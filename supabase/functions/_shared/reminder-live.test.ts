import assert from 'node:assert/strict'
import test from 'node:test'

import { ReminderDispatchError } from './reminder-delivery-claim.ts'
import type { ReminderLiveConfig } from './reminder-live-config.ts'
import { runReminderLive } from './reminder-live.ts'
import type { ResendReminderSendResult } from './resend-reminder-adapter.ts'

const CLAIM = Object.freeze({
  delivery_id: '71111111-1111-4111-8111-111111111111',
  claim_token: '72222222-2222-4222-8222-222222222222',
  user_id: '73333333-3333-4333-8333-333333333333',
  scheduled_local_date: '2026-08-12',
  scheduled_for: '2026-08-12T11:00:00+00:00',
  timezone: 'Asia/Taipei',
  locale: 'zh-Hant',
  consent_version: 'reminder-email-v1',
  attempt_count: 1,
  email_type: 'streak',
  learning_language: 'mandarin',
  channel_id: 'UCaaaaaaaaaaaaaaaaaaaaaa',
  channel_name: 'Grace Mandarin Chinese',
  channel_summary: null,
  video_id: 'abcdefghijk',
  video_title: 'A new tone lesson',
  video_published_at: '2026-08-12T08:00:00+00:00',
})
const SECOND_CLAIM = Object.freeze({
  ...CLAIM,
  delivery_id: '74444444-4444-4444-8444-444444444444',
  claim_token: '75555555-5555-4555-8555-555555555555',
  attempt_count: 2,
})
const CONFIG: ReminderLiveConfig = Object.freeze({
  resendApiKey: 're_test_key_1234567890',
  fromAddress: 'Edenia <reminders@example.com>',
  unsubscribeSecret: 'a-test-secret-with-at-least-32-bytes-of-entropy',
  appUrl: 'https://bricechivu.github.io/Edenia/?internal_test=1',
  unsubscribeEndpointUrl:
    'https://example-project.supabase.co/functions/v1/unsubscribe-study-reminders',
  unsubscribePageUrl: 'https://bricechivu.github.io/Edenia/unsubscribe/',
  allowedRecipientEmail: 'learner@example.com',
})
const CONFIRMED_USER = Object.freeze({
  id: CLAIM.user_id,
  email: 'Learner@Example.COM',
  email_confirmed_at: '2026-08-01T00:00:00Z',
})

type HarnessOptions = {
  enabled?: boolean
  claims?: unknown[]
  user?: unknown
  authError?: { message: string; code?: string } | null
  rpcData?: Record<string, unknown>
  rpcErrors?: Record<string, { message: string }>
}

function createHarness({
  enabled = true,
  claims = [CLAIM],
  user = CONFIRMED_USER,
  authError = null,
  rpcData = {},
  rpcErrors = {},
}: HarnessOptions = {}) {
  const rpcCalls: Array<{
    name: string
    params: Record<string, unknown> | undefined
  }> = []
  const authCalls: string[] = []
  const defaults: Record<string, unknown> = {
    reminder_delivery_is_enabled: enabled,
    claim_due_typed_reminder_live: claims,
    complete_typed_reminder_without_send: true,
    store_typed_reminder_unsubscribe_token: true,
    begin_typed_reminder_provider_attempt: true,
    complete_reminder_provider_acceptance: true,
    complete_reminder_provider_failure: true,
  }
  return {
    rpcCalls,
    authCalls,
    client: {
      rpc(name: string, params?: Record<string, unknown>) {
        rpcCalls.push({ name, params })
        return Promise.resolve({
          data: Object.hasOwn(rpcData, name) ? rpcData[name] : defaults[name],
          error: rpcErrors[name] ?? null,
        })
      },
      auth: {
        admin: {
          getUserById(userId: string) {
            authCalls.push(userId)
            return Promise.resolve({
              data: { user },
              error: authError,
            })
          },
        },
      },
    },
  }
}

test('refuses live claims while the independent database switch is off', async () => {
  const harness = createHarness({ enabled: false })
  let sendCalls = 0
  const logs: Record<string, unknown>[] = []
  const result = await runReminderLive(
    harness.client,
    CONFIG,
    entry => logs.push(entry),
    { send: async () => {
      sendCalls += 1
      return { status: 'accepted', providerMessageId: 'should-not-send' }
    } },
  )

  assert.equal(result.status, 'blocked')
  assert.equal(sendCalls, 0)
  assert.deepEqual(harness.rpcCalls.map(call => call.name), [
    'reminder_delivery_is_enabled',
  ])
  assert.deepEqual(harness.authCalls, [])
  assert.deepEqual(logs, [{
    event: 'reminder_live_blocked',
    reason: 'live_delivery_disabled',
  }])
})

test('claims a small live batch with a longer bounded lease', async () => {
  const harness = createHarness({ claims: [] })
  const logs: Record<string, unknown>[] = []
  const result = await runReminderLive(
    harness.client,
    CONFIG,
    entry => logs.push(entry),
  )

  assert.equal(result.status, 'completed')
  assert.equal(result.claimed, 0)
  assert.deepEqual(harness.rpcCalls[1], {
    name: 'claim_due_typed_reminder_live',
    params: {
      p_batch_size: 5,
      p_due_window_seconds: 900,
      p_lease_seconds: 300,
    },
  })
  assert.deepEqual(logs, [{
    event: 'reminder_live_summary',
    status: 'completed',
    claimed: 0,
    accepted: 0,
    recipient_unavailable: 0,
    recipient_not_allowlisted: 0,
    fenced: 0,
    provider_deferred: 0,
    provider_blocked: 0,
    completion_failed: 0,
  }])
})

test('ends only definitively unusable recipients before provider state', async () => {
  const users = [
    null,
    { ...CONFIRMED_USER, email: 'invalid' },
    { ...CONFIRMED_USER, email_confirmed_at: undefined },
    { ...CONFIRMED_USER, deleted_at: '2026-08-10T00:00:00Z' },
  ]

  for (const user of users) {
    const harness = createHarness({ user })
    let sendCalls = 0
    const result = await runReminderLive(
      harness.client,
      CONFIG,
      () => {},
      { send: async () => {
        sendCalls += 1
        return { status: 'accepted', providerMessageId: 'should-not-send' }
      } },
    )

    assert.equal(result.status, 'completed')
    assert.equal(result.recipientUnavailable, 1)
    assert.equal(sendCalls, 0)
    assert.deepEqual(harness.rpcCalls.slice(2), [{
      name: 'complete_typed_reminder_without_send',
      params: {
        p_claim_token: CLAIM.claim_token,
        p_failure_code: 'recipient_unavailable',
      },
    }])
  }
})

test('recognizes only Supabase structured user-not-found errors as terminal', async () => {
  const harness = createHarness({
    authError: {
      message: 'message text is not used for classification',
      code: 'user_not_found',
    },
  })
  let sendCalls = 0
  const result = await runReminderLive(
    harness.client,
    CONFIG,
    () => {},
    { send: async () => {
      sendCalls += 1
      return { status: 'accepted', providerMessageId: 'should-not-send' }
    } },
  )

  assert.equal(result.recipientUnavailable, 1)
  assert.equal(sendCalls, 0)
  assert.equal(
    harness.rpcCalls.at(-1)?.name,
    'complete_typed_reminder_without_send',
  )
})

test('ends a confirmed recipient outside the single-address canary allowlist', async () => {
  const harness = createHarness({
    user: { ...CONFIRMED_USER, email: 'someone-else@example.com' },
  })
  let sendCalls = 0
  const logs: Record<string, unknown>[] = []
  const result = await runReminderLive(
    harness.client,
    CONFIG,
    entry => logs.push(entry),
    { send: async () => {
      sendCalls += 1
      return { status: 'accepted', providerMessageId: 'should-not-send' }
    } },
  )

  assert.equal(result.recipientNotAllowlisted, 1)
  assert.equal(sendCalls, 0)
  assert.deepEqual(harness.rpcCalls.slice(2), [{
    name: 'complete_typed_reminder_without_send',
    params: {
      p_claim_token: CLAIM.claim_token,
      p_failure_code: 'recipient_not_allowlisted',
    },
  }])
  assert.doesNotMatch(JSON.stringify(logs), /someone-else|@/iu)
})

test('treats auth lookup failures and mismatched users as retryable service errors', async () => {
  const cases: HarnessOptions[] = [
    { authError: { message: 'contains learner@example.com' } },
    { user: { ...CONFIRMED_USER, id: '76666666-6666-4666-8666-666666666666' } },
  ]
  for (const options of cases) {
    const harness = createHarness(options)
    let sendCalls = 0
    await assert.rejects(
      runReminderLive(
        harness.client,
        CONFIG,
        () => {},
        { send: async () => {
          sendCalls += 1
          return { status: 'accepted', providerMessageId: 'should-not-send' }
        } },
      ),
      (error: unknown) => error instanceof ReminderDispatchError
        && error.code === 'recipient_service_unavailable'
        && !error.message.includes('@'),
    )
    assert.equal(sendCalls, 0)
    assert.equal(harness.rpcCalls.length, 2)
  }
})

test('stores the opaque token digest and rechecks the claim before send', async () => {
  const harness = createHarness()
  const sent: Record<string, unknown>[] = []
  const logs: Record<string, unknown>[] = []
  const result = await runReminderLive(
    harness.client,
    CONFIG,
    entry => logs.push(entry),
    { send: async input => {
      sent.push(input)
      return {
        status: 'accepted',
        providerMessageId: 'provider-message-123',
      }
    } },
  )

  assert.equal(result.status, 'completed')
  assert.equal(result.accepted, 1)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'learner@example.com')
  assert.equal(sent[0].deliveryId, CLAIM.delivery_id)
  assert.equal(sent[0].apiKey, CONFIG.resendApiKey)
  assert.match(String(sent[0].unsubscribeApiUrl), /token=[A-Za-z0-9_-]{43}&lang=zh-Hant$/)
  assert.match(String(sent[0].html), /internal_test=1/)
  assert.match(String(sent[0].html), /reminder=streak/)
  assert.match(String(sent[0].html), /A new tone lesson/)
  assert.match(String(sent[0].text), /unsubscribe\/\?token=/)

  const tokenBinding = harness.rpcCalls[2]
  assert.equal(tokenBinding.name, 'store_typed_reminder_unsubscribe_token')
  assert.equal(tokenBinding.params?.p_delivery_id, CLAIM.delivery_id)
  assert.equal(tokenBinding.params?.p_claim_token, CLAIM.claim_token)
  assert.match(String(tokenBinding.params?.p_token_digest), /^\\x[0-9a-f]{64}$/u)
  assert.deepEqual(harness.rpcCalls[3], {
    name: 'begin_typed_reminder_provider_attempt',
    params: {
      p_claim_token: CLAIM.claim_token,
      p_provider_name: 'resend',
    },
  })
  assert.deepEqual(harness.rpcCalls[4], {
    name: 'complete_reminder_provider_acceptance',
    params: {
      p_claim_token: CLAIM.claim_token,
      p_provider_name: 'resend',
      p_provider_message_id: 'provider-message-123',
    },
  })
  const serializedLogs = JSON.stringify(logs)
  assert.doesNotMatch(serializedLogs, /@|re_test|token=|provider-message-123/iu)
  assert.doesNotMatch(serializedLogs, new RegExp(CLAIM.claim_token, 'iu'))
})

test('a failed token or provider-begin fence results in zero provider calls', async () => {
  for (const rpcName of [
    'store_typed_reminder_unsubscribe_token',
    'begin_typed_reminder_provider_attempt',
  ]) {
    const harness = createHarness({ rpcData: { [rpcName]: false } })
    let sendCalls = 0
    const result = await runReminderLive(
      harness.client,
      CONFIG,
      () => {},
      { send: async () => {
        sendCalls += 1
        return { status: 'accepted', providerMessageId: 'should-not-send' }
      } },
    )

    assert.equal(result.status, 'blocked')
    assert.equal(result.fenced, 1)
    assert.equal(sendCalls, 0)
    assert.doesNotMatch(
      harness.rpcCalls.map(call => call.name).join(','),
      /complete_reminder_provider_acceptance/u,
    )
  }
})

test('halts the batch after a retryable or blocked provider result', async () => {
  const cases: ResendReminderSendResult[] = [
    { status: 'deferred', reason: 'rate_limited', retryAfterSeconds: 30 },
    { status: 'blocked', reason: 'authentication_or_domain' },
  ]
  for (const providerResult of cases) {
    const harness = createHarness({ claims: [CLAIM, SECOND_CLAIM] })
    let sendCalls = 0
    const logs: Record<string, unknown>[] = []
    const result = await runReminderLive(
      harness.client,
      CONFIG,
      entry => logs.push(entry),
      { send: async () => {
        sendCalls += 1
        return providerResult
      } },
    )

    assert.equal(result.status, providerResult.status)
    assert.equal(result.claimed, 2)
    assert.equal(sendCalls, 1)
    assert.equal(harness.authCalls.length, 1)
    assert.doesNotMatch(
      harness.rpcCalls.map(call => call.name).join(','),
      /complete_reminder_provider_acceptance/u,
    )
    if (providerResult.status === 'blocked') {
      assert.deepEqual(harness.rpcCalls.at(-1), {
        name: 'complete_reminder_provider_failure',
        params: {
          p_claim_token: CLAIM.claim_token,
          p_provider_name: 'resend',
          p_failure_code: 'configuration_invalid',
        },
      })
    }
    assert.doesNotMatch(JSON.stringify(logs), /@|re_test|token=/iu)
  }
})

test('a failed permanent-provider completion remains safely retryable', async () => {
  const harness = createHarness({
    rpcData: { complete_reminder_provider_failure: false },
  })
  const result = await runReminderLive(
    harness.client,
    CONFIG,
    () => {},
    { send: async () => ({
      status: 'blocked',
      reason: 'request_invalid',
    }) },
  )

  assert.equal(result.status, 'deferred')
  assert.equal(result.providerBlocked, 1)
  assert.equal(result.completionFailed, 1)
  assert.deepEqual(harness.rpcCalls.at(-1), {
    name: 'complete_reminder_provider_failure',
    params: {
      p_claim_token: CLAIM.claim_token,
      p_provider_name: 'resend',
      p_failure_code: 'template_invalid',
    },
  })
})

test('leaves an accepted but unrecorded result retryable with the same occurrence ID', async () => {
  const harness = createHarness({
    rpcData: { complete_reminder_provider_acceptance: false },
  })
  const deliveries: string[] = []
  const result = await runReminderLive(
    harness.client,
    CONFIG,
    () => {},
    { send: async input => {
      deliveries.push(input.deliveryId)
      return { status: 'accepted', providerMessageId: 'provider-message-123' }
    } },
  )

  assert.equal(result.status, 'deferred')
  assert.equal(result.accepted, 0)
  assert.equal(result.completionFailed, 1)
  assert.deepEqual(deliveries, [CLAIM.delivery_id])
})

test('rejects malformed claims before auth, token creation, or provider access', async () => {
  const harness = createHarness({ claims: [{ ...CLAIM, locale: 'de' }] })
  let sendCalls = 0
  await assert.rejects(
    runReminderLive(
      harness.client,
      CONFIG,
      () => {},
      { send: async () => {
        sendCalls += 1
        return { status: 'accepted', providerMessageId: 'should-not-send' }
      } },
    ),
    (error: unknown) => error instanceof ReminderDispatchError
      && error.code === 'invalid_claim',
  )
  assert.deepEqual(harness.authCalls, [])
  assert.equal(sendCalls, 0)
  assert.equal(harness.rpcCalls.length, 2)
})
