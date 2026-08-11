import assert from 'node:assert/strict'
import test from 'node:test'
import { ACCOUNT_SESSION_STATES } from '../../src/integrations/account-auth-controller.js'
import {
  createReminderPreferencesController,
  REMINDER_CONSENT_VERSION,
  REMINDER_PREFERENCE_FEEDBACK,
  REMINDER_PREFERENCE_STATES
} from '../../src/integrations/reminder-preferences-controller.js'

const USER_ID = '123e4567-e89b-42d3-a456-426614174000'

function createClient({ stored = null, loadError = null, saveError = null } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(['from', table])
      return {
        select(columns) {
          calls.push(['select', columns])
          return this
        },
        eq(column, value) {
          calls.push(['eq', column, value])
          return this
        },
        async maybeSingle() {
          calls.push(['maybeSingle'])
          return { data: stored, error: loadError }
        },
        upsert(row, options) {
          calls.push(['upsert', row, options])
          return {
            select(columns) {
              calls.push(['save-select', columns])
              return {
                async single() {
                  calls.push(['single'])
                  return {
                    data: saveError ? null : {
                      ...row,
                      created_at: stored?.created_at || '2026-08-01T00:00:00.000Z'
                    },
                    error: saveError
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

function signedIn(userId = USER_ID) {
  return { sessionState: ACCOUNT_SESSION_STATES.SIGNED_IN, userId }
}

test('signed-in owner loads only the exact reminder preference columns and row', async () => {
  const client = createClient({ stored: {
    user_id: USER_ID,
    enabled: true,
    days: [1, 3, 5],
    local_time: '18:30:00',
    timezone: 'Asia/Taipei',
    locale: 'zh-Hant',
    consent_granted_at: '2026-08-01T00:00:00.000Z',
    consent_revoked_at: null,
    consent_version: REMINDER_CONSENT_VERSION,
    consent_source: 'settings',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z'
  } })
  const states = []
  const controller = createReminderPreferencesController({
    client,
    onStateChange: state => states.push(state)
  })

  await controller.synchronizeAccount(signedIn(), {
    locale: 'en', timezone: 'Europe/Paris'
  })

  assert.equal(controller.getState().status, REMINDER_PREFERENCE_STATES.READY)
  assert.deepEqual(controller.getState().preference.days, [1, 3, 5])
  assert.equal(controller.getState().preference.localTime, '18:30')
  assert.equal(controller.getState().preference.timezone, 'Asia/Taipei')
  assert.deepEqual(client.calls.slice(0, 4).map(call => call[0]), [
    'from', 'select', 'eq', 'maybeSingle'
  ])
  assert.deepEqual(client.calls[2], ['eq', 'user_id', USER_ID])
  assert.equal(states[0].status, REMINDER_PREFERENCE_STATES.LOADING)
})

test('saving derives ownership and consent metadata instead of accepting them from UI', async () => {
  const client = createClient()
  const controller = createReminderPreferencesController({
    client,
    now: () => '2026-08-11T12:00:00.000Z',
    onStateChange() {}
  })
  await controller.synchronizeAccount(signedIn(), {
    locale: 'en', timezone: 'Asia/Taipei'
  })

  const saved = await controller.save({
    userId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    email: 'attacker@example.com',
    enabled: true,
    days: [2, 4, 6],
    localTime: '07:45',
    timezone: 'Europe/Paris',
    locale: 'fr',
    consent: true,
    consentVersion: 'attacker-controlled'
  })

  assert.equal(saved, true)
  const row = client.calls.find(call => call[0] === 'upsert')[1]
  assert.equal(row.user_id, USER_ID)
  assert.equal(row.email, undefined)
  assert.equal(row.consent_version, REMINDER_CONSENT_VERSION)
  assert.equal(row.consent_source, 'settings')
  assert.equal(row.consent_granted_at, '2026-08-11T12:00:00.000Z')
  assert.equal(row.consent_revoked_at, null)
  assert.deepEqual(client.calls.find(call => call[0] === 'upsert')[2], {
    onConflict: 'user_id'
  })
  assert.equal(controller.getState().feedback, REMINDER_PREFERENCE_FEEDBACK.SAVED)
})

test('activation requires a signed-in UUID, consent, valid days, time, and IANA timezone', async () => {
  const client = createClient()
  const controller = createReminderPreferencesController({
    client,
    onStateChange() {}
  })
  const valid = {
    enabled: true,
    days: [1],
    localTime: '19:00',
    timezone: 'Asia/Taipei',
    locale: 'en',
    consent: true
  }

  assert.equal(await controller.save(valid), false)
  assert.equal(controller.getState().feedback, REMINDER_PREFERENCE_FEEDBACK.SIGN_IN_REQUIRED)
  await controller.synchronizeAccount(signedIn())

  for (const [patch, feedback] of [
    [{ consent: false }, REMINDER_PREFERENCE_FEEDBACK.CONSENT_REQUIRED],
    [{ days: [] }, REMINDER_PREFERENCE_FEEDBACK.INVALID_DAYS],
    [{ localTime: '25:00' }, REMINDER_PREFERENCE_FEEDBACK.INVALID_TIME],
    [{ timezone: 'not/a real timezone' }, REMINDER_PREFERENCE_FEEDBACK.INVALID_TIMEZONE]
  ]) {
    assert.equal(await controller.save({ ...valid, ...patch }), false)
    assert.equal(controller.getState().feedback, feedback)
  }
  assert.equal(client.calls.some(call => call[0] === 'upsert'), false)
})

test('sign-out clears the owner and ignores an obsolete in-flight load', async () => {
  let finishLoad
  const client = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        maybeSingle() {
          return new Promise(resolve => { finishLoad = resolve })
        }
      }
    }
  }
  const controller = createReminderPreferencesController({
    client,
    onStateChange() {}
  })
  const pending = controller.synchronizeAccount(signedIn())
  await controller.synchronizeAccount({ sessionState: ACCOUNT_SESSION_STATES.SIGNED_OUT })
  finishLoad({ data: { user_id: USER_ID, enabled: true }, error: null })
  await pending

  assert.equal(controller.getState().status, REMINDER_PREFERENCE_STATES.SIGNED_OUT)
  assert.equal(controller.getState().userId, null)
  assert.equal(controller.getState().preference.enabled, false)
})
