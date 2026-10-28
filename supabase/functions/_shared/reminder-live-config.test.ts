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
  REMINDER_APP_URL: 'https://www.edenia.study/',
  REMINDER_UNSUBSCRIBE_PAGE_URL:
    'https://www.edenia.study/unsubscribe/',
  SUPABASE_URL: 'https://example-project.supabase.co',
  REMINDER_LIVE_RECIPIENT_EMAIL: 'Learner@Example.COM',
  REMINDER_UNSUBSCRIBE_KEY_VERSION: 'test-key-v1',
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
    allowedRecipientEmails: ['learner@example.com'],
    admissionMode: 'canary',
    unsubscribeKeyVersion: 'test-key-v1',
  })
  assert.ok(Object.isFrozen(config))
  assert.deepEqual(environment.reads, [
    'RESEND_API_KEY',
    'REMINDER_FROM_ADDRESS',
    'REMINDER_UNSUBSCRIBE_SECRET',
    'REMINDER_APP_URL',
    'REMINDER_UNSUBSCRIBE_PAGE_URL',
    'SUPABASE_URL',
    'REMINDER_ADMISSION_MODE',
    'REMINDER_UNSUBSCRIBE_KEY_VERSION',
    'REMINDER_LIVE_RECIPIENT_EMAIL',
  ])
})

test('collapses absent and invalid settings into one privacy-safe error', () => {
  const cases: Partial<Record<keyof typeof VALUES, string | undefined>>[] = [
    { RESEND_API_KEY: undefined },
    { RESEND_API_KEY: 'not-a-key' },
    { REMINDER_FROM_ADDRESS: 'invalid' },
    { REMINDER_UNSUBSCRIBE_SECRET: 'too-short' },
    { REMINDER_APP_URL: 'https://www.edenia.study/?internal_test=2' },
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

test('the exact authentication-trial base URL is allowed without changing delivery admission', () => {
  const environment = createEnvironment({ REMINDER_APP_URL: 'https://www.edenia.study/?internal_test=1' })
  const config = readReminderLiveConfig(environment.read)
  assert.equal(config.appUrl, 'https://www.edenia.study/?internal_test=1')
  assert.equal(config.admissionMode, 'canary')
  assert.deepEqual(config.allowedRecipientEmails, ['learner@example.com'])
})

test('public admission and key rotation versions are explicit configuration', () => {
  const environment = createEnvironment()
  const config = readReminderLiveConfig(name => name === 'REMINDER_ADMISSION_MODE' ? 'public'
    : name === 'REMINDER_LIVE_RECIPIENT_EMAIL' ? undefined : environment.read(name))
  assert.equal(config.admissionMode, 'public')
  assert.equal(config.allowedRecipientEmails, null)
  for (const invalid of ['', 'public ', 'internal_test=1']) {
    assert.throws(() => readReminderLiveConfig(name => name === 'REMINDER_ADMISSION_MODE' ? invalid : environment.read(name)))
  }
})


test('canary accepts a bounded explicit list while preserving single-address configuration', () => {
  const config = readReminderLiveConfig(createEnvironment({
    REMINDER_LIVE_RECIPIENT_EMAIL: 'Learner@Example.COM, second@example.com',
  }).read)
  assert.deepEqual(config.allowedRecipientEmails, ['learner@example.com', 'second@example.com'])
  assert.ok(Object.isFrozen(config.allowedRecipientEmails))
  assert.equal(config.admissionMode, 'canary')
  for (const value of ['learner@example.com,', 'learner@example.com,not-email',
    'learner@example.com,LEARNER@example.com', Array.from({length:11},(_,i)=>`user${i}@example.com`).join(',')]) {
    assert.throws(() => readReminderLiveConfig(createEnvironment({REMINDER_LIVE_RECIPIENT_EMAIL:value}).read),
      (error: unknown) => error instanceof ReminderDispatchError && error.code === 'live_configuration_unavailable')
  }
})
