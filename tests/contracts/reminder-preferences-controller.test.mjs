import assert from 'node:assert/strict'
import test from 'node:test'
import { ACCOUNT_SESSION_STATES } from '../../src/integrations/account-auth-controller.js'
import { createDefaultReminderPreference, createReminderPreferencesController, REMINDER_CONSENT_VERSION,
  REMINDER_PREFERENCE_FEEDBACK as FEEDBACK, REMINDER_PREFERENCE_STATES as STATES } from '../../src/integrations/reminder-preferences-controller.js'
const USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const USER_B = '223e4567-e89b-42d3-a456-426614174000'
const signedIn = (userId = USER_ID) => ({ sessionState: ACCOUNT_SESSION_STATES.SIGNED_IN, userId })
function createClient(initial = {}) {
  let stored = { user_id: USER_ID, streak_reminders_enabled: true, discovery_emails_enabled: true,
    timezone: 'UTC', locale: 'en', consent_granted_at: null, consent_revoked_at: null,
    enrollment_epoch: 0, streak_choice_version: 0, discovery_choice_version: 0, ...initial }
  const calls = []
  return { calls, get stored() { return stored }, update(patch) { stored = { ...stored, ...patch } },
    async rpc(name, args) {
      calls.push([name, args])
      if (args.p_expected_owner !== stored.user_id) return { error: { code: '42501', message: 'reminder_owner_changed' } }
      if (name === 'get_my_reminder_preferences') return { data: { ...stored } }
      if (args.p_enrollment_epoch !== stored.enrollment_epoch) return { error: { code: '40001' } }
      if (name === 'save_my_reminder_choice') {
        const prefix = args.p_choice
        if (args.p_expected_version !== stored[`${prefix}_choice_version`]) return { error: { code: '40001' } }
        stored[`${prefix === 'streak' ? 'streak_reminders' : 'discovery_emails'}_enabled`] = args.p_enabled
        stored[`${prefix}_choice_version`]++
        if (!args.p_enabled) stored[`${prefix}_enrollment_version`] = null
      } else if (name === 'enroll_my_reminder_choices') {
        if (stored.enrollment_blocked) return { error: { code: '42501', message: 'reminder_enrollment_suppressed' } }
        stored.streak_enrollment_version = args.p_streak ? REMINDER_CONSENT_VERSION : null
        stored.discovery_enrollment_version = args.p_discovery ? REMINDER_CONSENT_VERSION : null
        stored.enrollment_epoch++
        stored.consent_revoked_at = null
        stored.consent_granted_at = 'server-owned'
      }
      return { data: { ...stored } }
    }
  }
}
function controller(client) { return createReminderPreferencesController({ client, onStateChange() {} }) }

test('both default-on choices have no enrollment or read-time consent', async () => {
  const preference = createDefaultReminderPreference({ timezone: 'invalid', locale: 'invalid' })
  assert.equal(preference.streakRemindersEnabled, true)
  assert.equal(preference.discoveryEmailsEnabled, true)
  assert.equal(preference.consentGrantedAt, null)
  assert.equal(preference.streakEnrollmentVersion, null)
  assert.equal(preference.discoveryEnrollmentVersion, null)
  assert.equal(preference.timezone, 'UTC')
  const client = createClient(); const c = controller(client)
  await c.synchronizeAccount(signedIn(), { locale: 'fr', timezone: 'Europe/Paris' })
  assert.deepEqual(client.calls, [['get_my_reminder_preferences', { p_timezone: 'Europe/Paris', p_locale: 'fr', p_expected_owner: USER_ID }]])
  assert.equal(c.getState().preference.consentGrantedAt, null)
})

for (const streak of [false,true]) for (const discovery of [false,true]) {
  test(`saved combination ${streak}/${discovery} survives reload`, async () => {
    const c = controller(createClient({ streak_reminders_enabled: streak, discovery_emails_enabled: discovery }))
    await c.synchronizeAccount(signedIn())
    assert.equal(c.getState().preference.streakRemindersEnabled, streak)
    assert.equal(c.getState().preference.discoveryEmailsEnabled, discovery)
    await c.retry()
    assert.equal(c.getState().preference.streakRemindersEnabled, streak)
    assert.equal(c.getState().preference.discoveryEmailsEnabled, discovery)
  })
}

test('automatic change saves only one choice with a server version and epoch', async () => {
  const client = createClient(); const c = controller(client)
  await c.synchronizeAccount(signedIn())
  assert.equal(await c.save({ streakRemindersEnabled: false, discoveryEmailsEnabled: true, userId: USER_B }), true)
  assert.deepEqual(client.calls[1], ['save_my_reminder_choice', {
    p_choice: 'streak', p_enabled: false, p_expected_version: 0, p_enrollment_epoch: 0,
    p_timezone: 'UTC', p_locale: 'en', p_expected_owner: USER_ID
  }])
  assert.equal(c.getState().preference.discoveryEmailsEnabled, true)
  assert.equal(c.getState().preference.streakEnrollmentVersion, null)
})

test('two stale tabs changing different choices preserve both intentions', async () => {
  const client = createClient(); const a = controller(client); const b = controller(client)
  await Promise.all([a.synchronizeAccount(signedIn()),b.synchronizeAccount(signedIn())])
  assert.equal(await a.save({ streakRemindersEnabled: false }), true)
  assert.equal(await b.save({ discoveryEmailsEnabled: false }), true)
  assert.equal(client.stored.streak_reminders_enabled, false)
  assert.equal(client.stored.discovery_emails_enabled, false)
})

test('a stale same-choice save reloads the current server version and reports conflict', async () => {
  const client = createClient(); const c = controller(client)
  await c.synchronizeAccount(signedIn())
  client.update({ streak_choice_version: 1, streak_reminders_enabled: false })
  assert.equal(await c.save({ streakRemindersEnabled: false }), false)
  assert.equal(c.getState().preference.streakChoiceVersion, 1)
  assert.equal(c.getState().feedback, FEEDBACK.STALE)
})

test('unsubscribe epoch prevents a stale save from restoring choices or enrollment', async () => {
  const client = createClient(); const c = controller(client)
  await c.synchronizeAccount(signedIn())
  client.update({ enrollment_epoch: 1, streak_reminders_enabled: false, discovery_emails_enabled: false,
    consent_revoked_at: 'server-unsubscribe' })
  assert.equal(await c.save({ streakRemindersEnabled: false }), false)
  assert.equal(c.getState().preference.discoveryEmailsEnabled, false)
  assert.equal(c.getState().preference.consentRevokedAt, 'server-unsubscribe')
  assert.equal(client.calls.some(([name]) => name === 'enroll_my_reminder_choices'), false)
})

test('enable action deliberately enrolls exactly the displayed selections', async () => {
  const client = createClient({ discovery_emails_enabled: false }); const c = controller(client)
  await c.synchronizeAccount(signedIn())
  assert.equal(await c.enroll(), true)
  assert.deepEqual(client.calls[1], ['enroll_my_reminder_choices', { p_streak: true, p_discovery: false,
    p_streak_version: 0, p_discovery_version: 0, p_enrollment_epoch: 0, p_expected_owner: USER_ID }])
  assert.equal(c.getState().preference.streakEnrollmentVersion, REMINDER_CONSENT_VERSION)
  assert.equal(c.getState().preference.discoveryEnrollmentVersion, null)
  assert.equal(c.getState().feedback, FEEDBACK.ENROLLED)
})

test('turning an enrolled choice off and on requires a fresh enrollment action', async () => {
  const client = createClient(); const c = controller(client)
  await c.synchronizeAccount(signedIn()); await c.enroll()
  await c.save({ streakRemindersEnabled: false }); await c.save({ streakRemindersEnabled: true })
  assert.equal(c.getState().preference.streakEnrollmentVersion, null)
  assert.equal(c.getState().preference.discoveryEnrollmentVersion, REMINDER_CONSENT_VERSION)
})

test('hard suppression blocks enrollment and a failed write rolls back optimistic state', async () => {
  const client = createClient({ enrollment_blocked: true }); const c = controller(client)
  await c.synchronizeAccount(signedIn())
  assert.equal(await c.enroll(), false)
  assert.equal(c.getState().feedback, FEEDBACK.ENROLLMENT_BLOCKED)
  client.rpc = async () => ({ error: { message: 'offline' } })
  assert.equal(await c.save({ streakRemindersEnabled: false }), false)
  assert.equal(c.getState().preference.streakRemindersEnabled, true)
  assert.equal(c.getState().feedback, FEEDBACK.SAVE_ERROR)
})

test('failed initial load is unavailable and never reports saved or enrolled', async () => {
  const c = controller({ rpc: async () => ({ error: { message: 'offline' } }) })
  await c.synchronizeAccount(signedIn())
  assert.equal(c.getState().status, STATES.UNAVAILABLE)
  assert.equal(c.getState().feedback, FEEDBACK.LOAD_ERROR)
  assert.equal(await c.enroll(), false)
})

test('account change while a save is pending cannot publish the previous owner response', async () => {
  const client = createClient(); const c = controller(client)
  await c.synchronizeAccount(signedIn())
  let finish
  const original = client.rpc.bind(client)
  client.rpc = (name,args) => name === 'save_my_reminder_choice'
    ? new Promise(resolve => { finish = resolve }) : original(name,args)
  const pending = c.save({ streakRemindersEnabled: false })
  client.update({ user_id: USER_B })
  await c.synchronizeAccount(signedIn(USER_B))
  finish({ data: { user_id: USER_ID, streak_reminders_enabled: false } })
  assert.equal(await pending, false)
  assert.equal(c.getState().userId, USER_B)
  assert.equal(c.getState().preference.streakRemindersEnabled, true)
})

test('sign-out invalidates an in-flight first read', async () => {
  let finish
  const c = controller({ rpc: () => new Promise(resolve => { finish = resolve }) })
  const pending = c.synchronizeAccount(signedIn())
  await c.synchronizeAccount({ sessionState: ACCOUNT_SESSION_STATES.SIGNED_OUT })
  finish({ data: { user_id: USER_ID } }); await pending
  assert.equal(c.getState().status, STATES.SIGNED_OUT)
  assert.equal(c.getState().userId, null)
})


test('a malformed same-owner response cannot masquerade as saved off choices', async () => {
  const c = controller({ rpc: async () => ({ data: { user_id: USER_ID } }) })
  await c.synchronizeAccount(signedIn())
  assert.equal(c.getState().status, STATES.UNAVAILABLE)
  assert.equal(c.getState().feedback, FEEDBACK.LOAD_ERROR)
})


test('an Auth token switch before dispatch cannot save or enroll the new owner', async () => {
  for (const operation of ['save', 'enroll']) {
    const client = createClient(); const c = controller(client)
    await c.synchronizeAccount(signedIn())
    const dispatch = client.rpc.bind(client)
    let release
    client.rpc = (name, args) => new Promise(resolve => {
      release = async () => resolve(await dispatch(name, args))
    })
    const pending = operation === 'save'
      ? c.save({ streakRemindersEnabled: false }) : c.enroll()
    // The shared client resolves an Auth token only when the request dispatches.
    // B has identical zero versions/epoch; version checks alone cannot fence it.
    client.update({ user_id: USER_B })
    await release()
    assert.equal(await pending, false)
    assert.equal(client.calls.at(-1)[1].p_expected_owner, USER_ID)
    assert.equal(client.stored.user_id, USER_B)
    assert.equal(client.stored.streak_reminders_enabled, true)
    assert.equal(client.stored.discovery_emails_enabled, true)
    assert.equal(client.stored.enrollment_epoch, 0)
    assert.equal(client.stored.consent_granted_at, null)
  }
})
