import assert from 'node:assert/strict'
import test from 'node:test'

import {
  readReminderDryRunRequest,
  ReminderDryRunError,
  runReminderDryRun,
} from './reminder-dry-run.ts'

const CLAIM = Object.freeze({
  delivery_id: '51111111-1111-4111-8111-111111111111',
  claim_token: '52222222-2222-4222-8222-222222222222',
  user_id: '53333333-3333-4333-8333-333333333333',
  scheduled_local_date: '2026-08-12',
  scheduled_for: '2026-08-12T11:00:00+00:00',
  timezone: 'Asia/Taipei',
  locale: 'zh-Hant',
  consent_version: 'reminder-email-v1',
  attempt_count: 1,
})

function createClient({
  enabled = false,
  claims = [],
  completionData = true,
  completionError = null,
} = {}) {
  const calls: Array<{
    name: string
    params: Record<string, unknown> | undefined
  }> = []
  return {
    calls,
    client: {
      rpc(name: string, params?: Record<string, unknown>) {
        calls.push({ name, params })
        if (name === 'reminder_delivery_is_enabled') {
          return Promise.resolve({ data: enabled, error: null })
        }
        if (name === 'claim_due_reminder_deliveries') {
          return Promise.resolve({ data: claims, error: null })
        }
        if (name === 'complete_reminder_dry_run') {
          return Promise.resolve({
            data: completionData,
            error: completionError,
          })
        }
        return Promise.resolve({
          data: null,
          error: { message: 'unexpected RPC' },
        })
      },
    },
  }
}

test('runs a bounded empty dry run while live delivery is disabled', async () => {
  const harness = createClient()
  const logs: Record<string, unknown>[] = []
  const result = await runReminderDryRun(harness.client, entry => logs.push(entry))

  assert.deepEqual(result, {
    mode: 'dry_run',
    status: 'completed',
    liveDeliveryEnabled: false,
    claimed: 0,
    observed: 0,
    completionFailed: 0,
  })
  assert.deepEqual(harness.calls, [
    { name: 'reminder_delivery_is_enabled', params: undefined },
    {
      name: 'claim_due_reminder_deliveries',
      params: {
        p_batch_size: 25,
        p_due_window_seconds: 900,
        p_lease_seconds: 120,
      },
    },
  ])
  assert.deepEqual(logs, [{
    event: 'reminder_dry_run_summary',
    claimed: 0,
    observed: 0,
    completion_failed: 0,
    live_delivery_enabled: false,
  }])
})

test('refuses to claim dry-run work when live delivery is enabled', async () => {
  const harness = createClient({ enabled: true, claims: [CLAIM] })
  const logs: Record<string, unknown>[] = []
  const result = await runReminderDryRun(harness.client, entry => logs.push(entry))

  assert.equal(result.status, 'blocked')
  assert.equal(result.liveDeliveryEnabled, true)
  assert.deepEqual(
    harness.calls.map(call => call.name),
    ['reminder_delivery_is_enabled'],
  )
  assert.deepEqual(logs, [{
    event: 'reminder_dry_run_blocked',
    reason: 'live_delivery_enabled',
  }])
})

test('logs intended delivery metadata and completes with the fencing token', async () => {
  const harness = createClient({ claims: [CLAIM] })
  const logs: Record<string, unknown>[] = []
  const result = await runReminderDryRun(harness.client, entry => logs.push(entry))

  assert.equal(result.claimed, 1)
  assert.equal(result.observed, 1)
  assert.equal(result.completionFailed, 0)
  assert.deepEqual(harness.calls[2], {
    name: 'complete_reminder_dry_run',
    params: { p_claim_token: CLAIM.claim_token },
  })
  assert.deepEqual(logs[0], {
    event: 'reminder_dry_run_intended',
    delivery_id: CLAIM.delivery_id,
    user_id: CLAIM.user_id,
    scheduled_local_date: CLAIM.scheduled_local_date,
    scheduled_for: CLAIM.scheduled_for,
    timezone: CLAIM.timezone,
    locale: CLAIM.locale,
    consent_version: CLAIM.consent_version,
    attempt_count: CLAIM.attempt_count,
  })
  assert.doesNotMatch(JSON.stringify(logs), /claim_token|52222222/)
  assert.doesNotMatch(JSON.stringify(logs), /"email"\s*:|@/i)
})

test('leaves failed completions retryable without exposing lease tokens', async () => {
  const harness = createClient({
    claims: [CLAIM],
    completionData: false,
  })
  const logs: Record<string, unknown>[] = []
  const result = await runReminderDryRun(harness.client, entry => logs.push(entry))

  assert.equal(result.observed, 0)
  assert.equal(result.completionFailed, 1)
  assert.deepEqual(logs[1], {
    event: 'reminder_dry_run_completion_failed',
    delivery_id: CLAIM.delivery_id,
    attempt_count: 1,
    reason: 'lease_not_completed',
  })
  assert.doesNotMatch(JSON.stringify(logs), /claim_token|52222222/)
})

test('rejects malformed database claims before logging or completion', async () => {
  const harness = createClient({
    claims: [{ ...CLAIM, locale: 'de', email: 'unsafe@example.test' }],
  })
  const logs: Record<string, unknown>[] = []
  await assert.rejects(
    runReminderDryRun(harness.client, entry => logs.push(entry)),
    (error: unknown) => error instanceof ReminderDryRunError
      && error.code === 'invalid_claim',
  )
  assert.deepEqual(logs, [])
  assert.equal(harness.calls.length, 2)
})

test('accepts only a small empty JSON POST request', async () => {
  await assert.doesNotReject(readReminderDryRunRequest(new Request(
    'https://example.test',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: '{}',
    },
  )))

  const rejectedRequests = [
    new Request('https://example.test'),
    new Request('https://example.test', { method: 'POST', body: '{}' }),
    new Request('https://example.test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    }),
    new Request('https://example.test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_size: 100 }),
    }),
  ]
  for (const request of rejectedRequests) {
    await assert.rejects(
      readReminderDryRunRequest(request),
      (error: unknown) => error instanceof ReminderDryRunError
        && error.status >= 400,
    )
  }
})
