import assert from 'node:assert/strict'
import test from 'node:test'

import {
  readReminderLiveConfig,
  type ReminderEnvironmentReader,
} from './reminder-live-config.ts'
import { ReminderDispatchError } from './reminder-delivery-claim.ts'

const VALUES = Object.freeze({
  RESEND_API_KEY: 're_test_key_1234567890',
  REMINDER_FROM_ADDRESS: 'Edenia <reminders@example.com>',
  REMINDER_UNSUBSCRIBE_SECRET: 'a-test-secret-with-at-least-32-bytes-of-entropy',
  REMINDER_APP_URL: 'https://www.edenia.study/?internal_test=1',
  REMINDER_UNSUBSCRIBE_PAGE_URL:
    'https://www.edenia.study/unsubscribe/',
  SUPABASE_URL: 'https://example-project.supabase.co',
  REMINDER_LIVE_RECIPIENT_EMAIL: 'Learner@Example.COM',
})

function createEnvironment(
  overrides: Partial<Record<keyof typeof VALUES, string | undefined>> = {},
) {
  const values: Record<string, string | undefined> = { ...VALUES, ...overrides }
  const reads: string[] = []
  const read: ReminderEnvironmentReader = name => {
    reads.push(name)
    return values[name]
  }
  return { read, reads }
}

test('validates and freezes every live-delivery setting before use', () => {
  const environment = createEnvironment()
  const config = readReminderLiveConfig(environment.read)

  assert.deepEqual(config, {
    resendApiKey: VALUES.RESEND_API_KEY,
    fromAddress: VALUES.REMINDER_FROM_ADDRESS,
    unsubscribeSecret: VALUES.REMINDER_UNSUBSCRIBE_SECRET,
    appUrl: VALUES.REMINDER_APP_URL,
    unsubscribeEndpointUrl:
      'https://example-project.supabase.co/functions/v1/unsubscribe-study-reminders',
    unsubscribePageUrl: VALUES.REMINDER_UNSUBSCRIBE_PAGE_URL,
    allowedRecipientEmail: 'learner@example.com',
  })
  assert.ok(Object.isFrozen(config))
  assert.deepEqual(environment.reads, [
    'RESEND_API_KEY',
    'REMINDER_FROM_ADDRESS',
    'REMINDER_UNSUBSCRIBE_SECRET',
    'REMINDER_APP_URL',
    'REMINDER_UNSUBSCRIBE_PAGE_URL',
    'SUPABASE_URL',
    'REMINDER_LIVE_RECIPIENT_EMAIL',
  ])
})

test('collapses absent and invalid settings into one privacy-safe error', () => {
  const cases: Partial<Record<keyof typeof VALUES, string | undefined>>[] = [
    { RESEND_API_KEY: undefined },
    { RESEND_API_KEY: 'not-a-key' },
    { REMINDER_FROM_ADDRESS: 'invalid' },
    { REMINDER_UNSUBSCRIBE_SECRET: 'too-short' },
    { REMINDER_APP_URL: 'https://www.edenia.study/' },
    { REMINDER_UNSUBSCRIBE_PAGE_URL: 'https://example.test/unsubscribe/' },
    { SUPABASE_URL: 'https://example.test' },
    { REMINDER_LIVE_RECIPIENT_EMAIL: 'not-an-email' },
  ]

  for (const overrides of cases) {
    const environment = createEnvironment(overrides)
    assert.throws(
      () => readReminderLiveConfig(environment.read),
      (error: unknown) => error instanceof ReminderDispatchError
        && error.status === 503
        && error.code === 'live_configuration_unavailable'
        && !JSON.stringify(error).includes('re_test_key'),
    )
  }
})
