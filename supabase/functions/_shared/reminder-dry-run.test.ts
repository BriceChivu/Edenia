import assert from 'node:assert/strict'
import test from 'node:test'

import {
  readReminderDryRunRequest,
  ReminderDryRunError,
  runReminderDryRun,
} from './reminder-dry-run.ts'

function createClient({ enabled = false, evaluation = [] as unknown[], error = false } = {}) {
  const calls: string[] = []
  return { calls, client: { rpc(name: string) {
    calls.push(name)
    if (name === 'reminder_delivery_is_enabled') return Promise.resolve({ data: enabled, error: null })
    if (name === 'evaluate_reminder_shadow') return Promise.resolve({ data: evaluation,
      error: error ? { message: 'private data must stay private' } : null })
    throw new Error(`unexpected mutation: ${name}`)
  } } }
}

test('empty shadow evaluation performs no claims, completions or writes', async () => {
 const h = createClient()
 const logs: Record<string, unknown>[] = []
 assert.deepEqual(await runReminderDryRun(h.client, x => logs.push(x)), {
  mode: 'dry_run', status: 'completed', liveDeliveryEnabled: false,
  claimed: 0, observed: 0, completionFailed: 0,
 })
 assert.deepEqual(h.calls, ['reminder_delivery_is_enabled', 'evaluate_reminder_shadow'])
 assert.deepEqual(logs, [{ event: 'reminder_dry_run_summary', claimed: 0,
  observed: 0, completion_failed: 0, live_delivery_enabled: false }])
})

test('shadow evaluation stops if the live switch is enabled', async () => {
 const h = createClient({ enabled: true })
 const result = await runReminderDryRun(h.client, () => {})
 assert.equal(result.status, 'blocked')
 assert.deepEqual(h.calls, ['reminder_delivery_is_enabled'])
})

test('shadow counts both choices without exposing owners or consuming real occurrence keys', async () => {
 const h = createClient({ evaluation: [{ email_type: 'streak', candidate_count: 4 },
  { email_type: 'discovery', candidate_count: '2' }] })
 const logs: Record<string, unknown>[] = []
 const result = await runReminderDryRun(h.client, x => logs.push(x))
 assert.equal(result.observed, 6)
 assert.equal(result.claimed, 0)
 assert.equal(result.completionFailed, 0)
 assert.deepEqual(h.calls, ['reminder_delivery_is_enabled', 'evaluate_reminder_shadow'])
 assert.doesNotMatch(JSON.stringify(logs), /user_id|claim_token|delivery_id|@|token=/u)
})

test('malformed evaluation and database errors stop before logging private data', async () => {
 for (const options of [
  { evaluation: [{ email_type: 'private owner value', candidate_count: 2 }] },
  { evaluation: [{ email_type: 'streak', candidate_count: -1 }] },
  { evaluation: [{ email_type: 'streak', candidate_count: Infinity }] },
  { error: true },
 ]) {
  const h = createClient(options)
  const logs: Record<string, unknown>[] = []
  await assert.rejects(runReminderDryRun(h.client, x => logs.push(x)),
   (error: unknown) => error instanceof ReminderDryRunError && error.code === 'database_unavailable')
  assert.deepEqual(logs, [])
 }
})

test('accepts only a small empty or exact capacity-check JSON POST request', async () => {
  assert.equal(await readReminderDryRunRequest(new Request(
    'https://example.test',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: '{}',
    },
  )), 'dispatch')
  assert.equal(await readReminderDryRunRequest(new Request('https://example.test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: '{"action":"capacity-check"}',
  })), 'capacity-check')

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
