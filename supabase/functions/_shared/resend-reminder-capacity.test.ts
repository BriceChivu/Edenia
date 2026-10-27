import assert from 'node:assert/strict'
import test from 'node:test'
import { readResendReminderCapacity } from './resend-reminder-capacity.ts'

const now = () => Date.parse('2026-10-27T11:00:00Z')
const key = 're_fixture_only_key'
function usage() {
  return { object: 'usage', emails: {
    daily: { used: 12, sent: 10, received: 2, limit: 100, resets_at: '2026-10-28T00:00:00Z' },
    monthly: { used: 120, sent: 100, received: 20, limit: 3000, resets_at: '2026-11-01T00:00:00Z' },
  } }
}
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })

test('reads shared sent and received usage through a fixed GET endpoint only', async () => {
  const calls: string[] = []
  const capacity = await readResendReminderCapacity(key, { now, fetcher: async (url, init) => {
    calls.push(url)
    assert.equal(init?.method, 'GET')
    assert.equal(init?.redirect, 'error')
    assert.equal(init?.body, undefined)
    return json(usage())
  } })
  assert.deepEqual(calls, ['https://api.resend.com/usage'])
  assert.deepEqual(capacity, { dailyUsed: 12, monthlyUsed: 120,
    dailyResetsAt: '2026-10-28T00:00:00.000Z', monthlyResetsAt: '2026-11-01T00:00:00.000Z',
    observedAt: '2026-10-27T11:00:00.000Z' })
})

test('unknown plans, contradictory counters, missing usage, and stale periods fail closed', async () => {
  const invalid: unknown[] = [null, {}, { object: 'usage', emails: {} }]
  for (const change of [
    (u: ReturnType<typeof usage>) => { u.emails.daily.limit = 1000 },
    (u: ReturnType<typeof usage>) => { u.emails.monthly.limit = 50000 },
    (u: ReturnType<typeof usage>) => { u.emails.daily.used = -1 },
    (u: ReturnType<typeof usage>) => { u.emails.daily.received = 99 },
    (u: ReturnType<typeof usage>) => { u.emails.daily.resets_at = '2026-10-27T00:00:00Z' },
    (u: ReturnType<typeof usage>) => { u.emails.monthly.resets_at = '2027-01-01T00:00:00Z' },
  ]) { const value = usage(); change(value); invalid.push(value) }
  for (const value of invalid) assert.equal(await readResendReminderCapacity(key, { now, fetcher: async () => json(value) }), null)
})

test('errors, redirects, oversized streams and responses spanning UTC midnight never supply capacity', async () => {
  for (const response of [new Response('', { status: 429 }), new Response('', { status: 302 }), json({ text: 'a'.repeat(17000) }), new Response('malformed', { headers: { 'content-type': 'application/json' } })]) {
    assert.equal(await readResendReminderCapacity(key, { now, fetcher: async () => response }), null)
  }
  let time = now()
  assert.equal(await readResendReminderCapacity(key, { now: () => time, fetcher: async () => {
    time = Date.parse('2026-10-28T00:00:00Z'); return json(usage())
  } }), null)
  assert.equal(await readResendReminderCapacity(key, { now, fetcher: async () => { throw new Error(key) } }), null)
})

test('invalid keys never make a request', async () => {
  let calls = 0
  assert.equal(await readResendReminderCapacity('bad', { now, fetcher: async () => { calls++; return json(usage()) } }), null)
  assert.equal(calls, 0)
})
