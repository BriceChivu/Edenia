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

function createClient({
  stored = null,
  loadError = null,
  insertError = null,
  saveError = null
} = {}) {
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
        insert(row) {
          calls.push(['insert', row])
          return {
            select(columns) {
              calls.push(['insert-select', columns])
              return {
                async single() {
                  calls.push(['insert-single'])
                  return {
                    data: insertError ? null : {
                      ...row,
                      created_at: '2026-08-12T00:00:00.000Z'
                    },
                    error: insertError
                  }
                }
              }
            }
          }
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
                      created_at: stored?.created_at || '2026-08-12T00:00:00.000Z'
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

test('signed-in owner loads only their two persisted email choices', async () => {
  const client = createClient({ stored: {
    user_id: USER_ID,
    streak_reminders_enabled: false,
    discovery_emails_enabled: true,
    timezone: 'Asia/Taipei',
    locale: 'zh-Hant',
    consent_granted_at: '2026-08-01T00:00:00.000Z',
    consent_revoked_at: null,
    consent_version: REMINDER_CONSENT_VERSION,
    consent_source: 'settings',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z'
  } })
  const controller = createReminderPreferencesController({
    client,
    onStateChange() {}
  })

  await controller.synchronizeAccount(signedIn(), {
    locale: 'en', timezone: 'Europe/Paris'
  })

  assert.equal(controller.getState().status, REMINDER_PREFERENCE_STATES.READY)
  assert.equal(controller.getState().preference.streakRemindersEnabled, false)
  assert.equal(controller.getState().preference.discoveryEmailsEnabled, true)
  assert.equal(controller.getState().preference.timezone, 'Asia/Taipei')
  assert.equal(client.calls.some(call => call[0] === 'insert'), false)
  assert.deepEqual(client.calls[2], ['eq', 'user_id', USER_ID])
})

test('first signed-in load creates both choices on exactly once', async () => {
  const client = createClient()
  const controller = createReminderPreferencesController({
    client,
    now: () => '2026-08-12T12:00:00.000Z',
    onStateChange() {}
  })

  await controller.synchronizeAccount(signedIn(), {
    locale: 'fr', timezone: 'Europe/Paris'
  })

  const row = client.calls.find(call => call[0] === 'insert')[1]
  assert.deepEqual(row, {
    user_id: USER_ID,
    enabled: false,
    streak_reminders_enabled: true,
    discovery_emails_enabled: true,
    timezone: 'Europe/Paris',
    locale: 'fr',
    consent_granted_at: '2026-08-12T12:00:00.000Z',
    consent_revoked_at: null,
    consent_version: REMINDER_CONSENT_VERSION,
    consent_source: 'account-default',
    updated_at: '2026-08-12T12:00:00.000Z'
  })
  assert.equal(row.email, undefined)
  assert.equal(controller.getState().preference.streakRemindersEnabled, true)
  assert.equal(controller.getState().preference.discoveryEmailsEnabled, true)
})

test('a concurrent first-login insert reloads the row created by another tab', async () => {
  const existing = {
    user_id: USER_ID,
    streak_reminders_enabled: false,
    discovery_emails_enabled: true,
    timezone: 'Asia/Taipei',
    locale: 'zh-Hant',
    consent_granted_at: '2026-08-12T11:59:59.000Z',
    consent_revoked_at: null,
    consent_version: REMINDER_CONSENT_VERSION,
    consent_source: 'account-default'
  }
  let loadCount = 0
  const client = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        async maybeSingle() {
          loadCount += 1
          return loadCount === 1
            ? { data: null, error: null }
            : { data: existing, error: null }
        },
        insert() {
          return {
            select() {
              return {
                async single() {
                  return {
                    data: null,
                    error: { code: '23505', message: 'duplicate key' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  const controller = createReminderPreferencesController({
    client,
    onStateChange() {}
  })

  await controller.synchronizeAccount(signedIn())

  assert.equal(controller.getState().status, REMINDER_PREFERENCE_STATES.READY)
  assert.equal(controller.getState().preference.streakRemindersEnabled, false)
  assert.equal(controller.getState().preference.discoveryEmailsEnabled, true)
  assert.equal(loadCount, 2)
})

test('existing disabled choices stay disabled on later sign-in', async () => {
  const client = createClient({ stored: {
    user_id: USER_ID,
    streak_reminders_enabled: false,
    discovery_emails_enabled: false,
    timezone: 'UTC',
    locale: 'en',
    consent_granted_at: '2026-08-01T00:00:00.000Z',
    consent_revoked_at: '2026-08-02T00:00:00.000Z',
    consent_version: REMINDER_CONSENT_VERSION,
    consent_source: 'settings'
  } })
  const controller = createReminderPreferencesController({
    client,
    onStateChange() {}
  })

  await controller.synchronizeAccount(signedIn())

  assert.equal(controller.getState().preference.streakRemindersEnabled, false)
  assert.equal(controller.getState().preference.discoveryEmailsEnabled, false)
  assert.equal(client.calls.some(call => call[0] === 'insert'), false)
  assert.equal(client.calls.some(call => call[0] === 'upsert'), false)
})

test('saving derives ownership and keeps the obsolete scheduler disabled', async () => {
  const client = createClient({ stored: {
    user_id: USER_ID,
    streak_reminders_enabled: true,
    discovery_emails_enabled: true,
    timezone: 'Asia/Taipei',
    locale: 'en',
    consent_granted_at: '2026-08-12T11:00:00.000Z',
    consent_revoked_at: null,
    consent_version: REMINDER_CONSENT_VERSION,
    consent_source: 'account-default'
  } })
  const controller = createReminderPreferencesController({
    client,
    now: () => '2026-08-12T12:00:00.000Z',
    onStateChange() {}
  })
  await controller.synchronizeAccount(signedIn(), {
    locale: 'en', timezone: 'Asia/Taipei'
  })

  const saved = await controller.save({
    userId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    email: 'attacker@example.com',
    streakRemindersEnabled: false,
    discoveryEmailsEnabled: true
  })

  assert.equal(saved, true)
  const row = client.calls.find(call => call[0] === 'upsert')[1]
  assert.equal(row.user_id, USER_ID)
  assert.equal(row.email, undefined)
  assert.equal(row.enabled, false)
  assert.equal(row.streak_reminders_enabled, false)
  assert.equal(row.discovery_emails_enabled, true)
  assert.equal(row.consent_granted_at, '2026-08-12T11:00:00.000Z')
  assert.equal(row.consent_revoked_at, null)
  assert.equal(row.consent_source, 'settings')
  assert.deepEqual(client.calls.find(call => call[0] === 'upsert')[2], {
    onConflict: 'user_id'
  })
  assert.equal(controller.getState().feedback, REMINDER_PREFERENCE_FEEDBACK.SAVED)
})

test('a failed automatic save restores the last server preference', async () => {
  const client = createClient({
    stored: {
      user_id: USER_ID,
      streak_reminders_enabled: true,
      discovery_emails_enabled: true,
      timezone: 'UTC',
      locale: 'en',
      consent_granted_at: '2026-08-01T00:00:00.000Z',
      consent_revoked_at: null,
      consent_version: REMINDER_CONSENT_VERSION,
      consent_source: 'account-default'
    },
    saveError: new Error('offline')
  })
  const controller = createReminderPreferencesController({
    client,
    onStateChange() {}
  })
  await controller.synchronizeAccount(signedIn())

  assert.equal(await controller.save({
    streakRemindersEnabled: false,
    discoveryEmailsEnabled: true
  }), false)
  assert.equal(controller.getState().preference.streakRemindersEnabled, true)
  assert.equal(controller.getState().preference.discoveryEmailsEnabled, true)
  assert.equal(controller.getState().feedback, REMINDER_PREFERENCE_FEEDBACK.SAVE_ERROR)
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
  finishLoad({ data: { user_id: USER_ID }, error: null })
  await pending

  assert.equal(controller.getState().status, REMINDER_PREFERENCE_STATES.SIGNED_OUT)
  assert.equal(controller.getState().userId, null)
})
