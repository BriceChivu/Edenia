import assert from 'node:assert/strict'
import test from 'node:test'

import { ReminderDispatchError } from './reminder-delivery-claim.ts'
import { runReminderDispatcher } from './reminder-dispatcher.ts'

const ENVIRONMENT = Object.freeze({
  RESEND_API_KEY: 're_test_key_1234567890',
  REMINDER_FROM_ADDRESS: 'Edenia <reminders@example.com>',
  REMINDER_UNSUBSCRIBE_SECRET: 'a-test-secret-with-at-least-32-bytes-of-entropy',
  REMINDER_APP_URL: 'https://www.edenia.study/?internal_test=1',
  REMINDER_UNSUBSCRIBE_PAGE_URL:
    'https://www.edenia.study/unsubscribe/',
  SUPABASE_URL: 'https://example-project.supabase.co',
  REMINDER_LIVE_RECIPIENT_EMAIL: 'learner@example.com',
})

function createHarness(switchValues: boolean[]) {
  const rpcCalls: string[] = []
  const authCalls: string[] = []
  let switchIndex = 0
  return {
    rpcCalls,
    authCalls,
    client: {
      rpc(name: string) {
        rpcCalls.push(name)
        if (name === 'reminder_delivery_is_enabled') {
          const value = switchValues[Math.min(
            switchIndex,
            switchValues.length - 1,
          )]
          switchIndex += 1
          return Promise.resolve({ data: value, error: null })
        }
        if (
          name === 'claim_due_typed_reminder_dry_runs'
          || name === 'claim_due_typed_reminder_live'
        ) {
          return Promise.resolve({ data: [], error: null })
        }
        return Promise.resolve({
          data: null,
          error: { message: 'unexpected RPC' },
        })
      },
      auth: {
        admin: {
          getUserById(userId: string) {
            authCalls.push(userId)
            return Promise.resolve({ data: { user: null }, error: null })
          },
        },
      },
    },
  }
}

test('switch-off dispatch stays dry-run and never reads live settings', async () => {
  const harness = createHarness([false, false])
  const environmentReads: string[] = []
  let sendCalls = 0
  const result = await runReminderDispatcher(
    harness.client,
    name => {
      environmentReads.push(name)
      return ENVIRONMENT[name as keyof typeof ENVIRONMENT]
    },
    () => {},
    { send: async () => {
      sendCalls += 1
      return { status: 'accepted', providerMessageId: 'should-not-send' }
    } },
  )

  assert.equal(result.mode, 'dry_run')
  assert.equal(result.status, 'completed')
  assert.deepEqual(environmentReads, [])
  assert.equal(sendCalls, 0)
  assert.deepEqual(harness.authCalls, [])
  assert.deepEqual(harness.rpcCalls, [
    'reminder_delivery_is_enabled',
    'reminder_delivery_is_enabled',
    'claim_due_typed_reminder_dry_runs',
  ])
})

test('switch-on dispatch rejects missing settings before a live claim', async () => {
  const harness = createHarness([true])
  let sendCalls = 0
  await assert.rejects(
    runReminderDispatcher(
      harness.client,
      () => undefined,
      () => {},
      { send: async () => {
        sendCalls += 1
        return { status: 'accepted', providerMessageId: 'should-not-send' }
      } },
    ),
    (error: unknown) => error instanceof ReminderDispatchError
      && error.code === 'live_configuration_unavailable',
  )

  assert.deepEqual(harness.rpcCalls, ['reminder_delivery_is_enabled'])
  assert.deepEqual(harness.authCalls, [])
  assert.equal(sendCalls, 0)
})

test('switch-on dispatch validates config then enters the bounded live path', async () => {
  const harness = createHarness([true, true])
  const result = await runReminderDispatcher(
    harness.client,
    name => ENVIRONMENT[name as keyof typeof ENVIRONMENT],
    () => {},
  )

  assert.equal(result.mode, 'live')
  assert.equal(result.status, 'completed')
  assert.deepEqual(harness.rpcCalls, [
    'reminder_delivery_is_enabled',
    'reminder_delivery_is_enabled',
    'claim_due_typed_reminder_live',
  ])
})

test('a switch disabled during setup stops before claim or provider access', async () => {
  const harness = createHarness([true, false])
  let sendCalls = 0
  const result = await runReminderDispatcher(
    harness.client,
    name => ENVIRONMENT[name as keyof typeof ENVIRONMENT],
    () => {},
    { send: async () => {
      sendCalls += 1
      return { status: 'accepted', providerMessageId: 'should-not-send' }
    } },
  )

  assert.equal(result.mode, 'live')
  assert.equal(result.status, 'blocked')
  assert.deepEqual(harness.rpcCalls, [
    'reminder_delivery_is_enabled',
    'reminder_delivery_is_enabled',
  ])
  assert.equal(sendCalls, 0)
})
