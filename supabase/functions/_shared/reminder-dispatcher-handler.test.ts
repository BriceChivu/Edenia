import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { handleReminderDispatcherRequest } from './reminder-dispatcher-handler.ts'
import type { ReminderLiveClient, ReminderLiveDependencies } from './reminder-live.ts'
import { readResendReminderCapacity } from './resend-reminder-capacity.ts'

const ENVIRONMENT = Object.freeze({
  RESEND_API_KEY: 're_preflight_test_key_1234567890',
  REMINDER_FROM_ADDRESS: 'Edenia <Reminders@MAIL.EDENIA.STUDY>',
  REMINDER_UNSUBSCRIBE_SECRET: 'private-unsubscribe-secret-with-at-least-32-bytes',
  REMINDER_APP_URL: 'https://www.edenia.study/?internal_test=1',
  REMINDER_UNSUBSCRIBE_PAGE_URL: 'https://www.edenia.study/unsubscribe/',
  SUPABASE_URL: 'https://example-project.supabase.co',
  REMINDER_LIVE_RECIPIENT_EMAIL: 'private-learner@example.com',
  REMINDER_UNSUBSCRIBE_KEY_VERSION: 'test-key-v1',
  REMINDER_ADMISSION_MODE: 'canary',
})
const observedAt = '2026-10-27T11:00:00.000Z'
const dailyReset = '2026-10-28T00:00:00.000Z'
const monthlyReset = '2026-11-01T00:00:00.000Z'
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
function request(body = '{"action":"capacity-check"}', method = 'POST') {
  return new Request('https://example.test/functions/v1/dispatch-study-reminders', {
    method, headers: { 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body } : {}),
  })
}
function harness(environment: Record<string, string> = ENVIRONMENT) {
  const rpcCalls: string[] = []
  const authCalls: string[] = []
  const logs: Record<string, string | number | boolean>[] = []
  let sendCalls = 0
  const client: ReminderLiveClient = {
    rpc(name) { rpcCalls.push(name); throw new Error('preflight must never touch the database') },
    auth: { admin: { getUserById(id) { authCalls.push(id); throw new Error('preflight must never read recipients') } } },
  }
  return {
    rpcCalls, authCalls, logs,
    sendCalls: () => sendCalls,
    run: (input: Request, dependencies: ReminderLiveDependencies = {}) => handleReminderDispatcherRequest(
      input, client, name => environment[name], entry => logs.push(entry),
      { send: async () => { sendCalls++; throw new Error('preflight must never send') }, ...dependencies },
    ),
  }
}
const capacity = () => ({ dailyUsed: 12, monthlyUsed: 120,
  dailyResetsAt: dailyReset, monthlyResetsAt: monthlyReset, observedAt })

test('capacity-check reads actual usage adapter without switch, database, auth, enrollment or send access', async () => {
  const h = harness()
  const requests: { url: string; method?: string }[] = []
  const response = await h.run(request(), { readCapacity: key => readResendReminderCapacity(key, {
    now: () => Date.parse(observedAt), fetcher: async (url, init) => {
      requests.push({ url, method: init?.method })
      assert.equal(init?.headers && (init.headers as Record<string, string>).Authorization, `Bearer ${ENVIRONMENT.RESEND_API_KEY}`)
      assert.equal(init?.body, undefined)
      assert.equal(init?.redirect, 'error')
      return new Response(JSON.stringify({ object: 'usage', emails: {
        daily: { used: 12, sent: 10, received: 2, limit: 100, resets_at: dailyReset },
        monthly: { used: 120, sent: 100, received: 20, limit: 3000, resets_at: monthlyReset },
      } }), { headers: { 'Content-Type': 'application/json' } })
    },
  }) })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(response.headers.get('Content-Type'), 'application/json')
  const body = await response.json()
  assert.deepEqual(body, {
    mode: 'capacity_check', status: 'completed', provider: 'resend', admission_mode: 'canary',
    api_key_sha256: digest(ENVIRONMENT.RESEND_API_KEY), sender_sha256: digest(ENVIRONMENT.REMINDER_FROM_ADDRESS),
    sender_domain: 'mail.edenia.study',
    daily: { used: 12, limit: 100, resets_at: dailyReset },
    monthly: { used: 120, limit: 3000, resets_at: monthlyReset }, observed_at: observedAt,
  })
  assert.deepEqual(requests, [{ url: 'https://api.resend.com/usage', method: 'GET' }])
  assert.deepEqual(h.rpcCalls, [])
  assert.deepEqual(h.authCalls, [])
  assert.deepEqual(h.logs, [])
  assert.equal(h.sendCalls(), 0)
  const publicResult = JSON.stringify(body)
  for (const secret of [ENVIRONMENT.RESEND_API_KEY, ENVIRONMENT.REMINDER_FROM_ADDRESS,
    ENVIRONMENT.REMINDER_LIVE_RECIPIENT_EMAIL, ENVIRONMENT.REMINDER_UNSUBSCRIBE_SECRET]) {
    assert.ok(!publicResult.includes(secret))
  }
})

test('capacity-check validates all live configuration before provider access and redacts failures', async () => {
  for (const field of Object.keys(ENVIRONMENT).filter(field => field !== 'REMINDER_ADMISSION_MODE')) {
    const environment: Record<string, string> = { ...ENVIRONMENT }
    delete environment[field]
    const h = harness(environment)
    let reads = 0
    const response = await h.run(request(), { readCapacity: async () => { reads++; return capacity() } })
    assert.equal(response.status, 503, field)
    assert.deepEqual(await response.json(), { error: 'Reminder dispatcher unavailable', code: 'live_configuration_unavailable' })
    assert.equal(reads, 0)
    assert.deepEqual(h.rpcCalls, [])
    assert.equal(h.sendCalls(), 0)
  }
})

test('unknown usage, provider errors and unexpected exceptions never attest capacity or expose provider details', async () => {
  for (const readCapacity of [
    async () => null,
    async () => { throw new Error(`${ENVIRONMENT.RESEND_API_KEY} ${ENVIRONMENT.REMINDER_LIVE_RECIPIENT_EMAIL}`) },
  ]) {
    const h = harness()
    const response = await h.run(request(), { readCapacity })
    assert.ok(response.status >= 500)
    const body = await response.json()
    assert.equal(body.error, 'Reminder dispatcher unavailable')
    assert.ok(['provider_capacity_unknown', 'internal_error'].includes(body.code))
    assert.doesNotMatch(JSON.stringify({ body, logs: h.logs }), /re_preflight|private-learner|private-unsubscribe|Reminders@/u)
    assert.deepEqual(h.rpcCalls, [])
    assert.deepEqual(h.authCalls, [])
    assert.equal(h.sendCalls(), 0)
  }
})

test('only the exact capacity-check action is accepted; invalid requests never access provider or database', async () => {
  for (const input of [request('{"action":"capacity-check","enabled":true}'), request('{"action":"capacity-check","batch_size":1}'),
    request('{"action":"live"}'), request('{"action":null}'), request('[]'), request('{'), request('', 'GET'),
    new Request('https://example.test', { method: 'POST', body: '{"action":"capacity-check"}' }),
    request(`{"action":"capacity-check","padding":"${'a'.repeat(80)}"}`),
  ]) {
    const h = harness()
    let reads = 0
    const response = await h.run(input, { readCapacity: async () => { reads++; return capacity() } })
    assert.ok(response.status >= 400 && response.status < 500)
    assert.equal(reads, 0)
    assert.deepEqual(h.rpcCalls, [])
    assert.equal(h.sendCalls(), 0)
  }
})

test('preflight preserves public mode and bare sender domain without returning the address', async () => {
  const h = harness({ ...ENVIRONMENT, REMINDER_ADMISSION_MODE: 'public', REMINDER_FROM_ADDRESS: 'private@MAIL.EDENIA.STUDY' })
  const response = await h.run(request(), { readCapacity: async () => capacity() })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.admission_mode, 'public')
  assert.equal(body.sender_domain, 'mail.edenia.study')
  assert.equal(body.sender_sha256, digest('private@MAIL.EDENIA.STUDY'))
  assert.doesNotMatch(JSON.stringify(body), /private@/u)
})

test('empty request retains switch-off shadow dispatch and response without provider access', async () => {
  const calls: string[] = []
  const client: ReminderLiveClient = {
    rpc(name) {
      calls.push(name)
      if (name === 'reminder_delivery_is_enabled') return Promise.resolve({ data: false, error: null })
      if (name === 'evaluate_reminder_shadow') return Promise.resolve({ data: [{ email_type: 'streak', candidate_count: 2 }], error: null })
      throw new Error('unexpected mutation')
    },
    auth: { admin: { getUserById() { throw new Error('unexpected auth read') } } },
  }
  const response = await handleReminderDispatcherRequest(request('{}'), client,
    () => { throw new Error('shadow dispatch must not read secrets') }, () => {},
    { readCapacity: async () => { throw new Error('shadow dispatch must not read provider') } })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { mode: 'dry_run', status: 'completed', live_delivery_enabled: false,
    claimed: 0, observed: 2, completion_failed: 0 })
  assert.deepEqual(calls, ['reminder_delivery_is_enabled', 'reminder_delivery_is_enabled', 'evaluate_reminder_shadow'])
})

test('empty request retains the fenced live route and live result fields', async () => {
  const calls: string[] = []
  const client: ReminderLiveClient = {
    rpc(name) {
      calls.push(name)
      if (['reminder_delivery_is_enabled', 'reminder_provider_attestation_is_current',
        'refresh_reminder_provider_usage', 'refresh_reminder_eligibility_snapshots'].includes(name)) {
        return Promise.resolve({ data: true, error: null })
      }
      if (name === 'claim_due_typed_reminder_live') return Promise.resolve({ data: [], error: null })
      throw new Error('unexpected mutation')
    },
    auth: { admin: { getUserById() { throw new Error('unexpected auth read') } } },
  }
  let providerReads = 0
  const response = await handleReminderDispatcherRequest(request('{}'), client,
    name => ENVIRONMENT[name as keyof typeof ENVIRONMENT], () => {},
    { readCapacity: async () => { providerReads++; return capacity() },
      send: async () => { throw new Error('no claim may send') } })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { mode: 'live', status: 'completed', live_delivery_enabled: true,
    claimed: 0, accepted: 0, recipient_unavailable: 0, recipient_not_allowlisted: 0,
    fenced: 0, provider_deferred: 0, provider_blocked: 0, completion_failed: 0 })
  assert.equal(providerReads, 1)
  assert.deepEqual(calls, ['reminder_delivery_is_enabled', 'reminder_delivery_is_enabled',
    'reminder_provider_attestation_is_current', 'refresh_reminder_provider_usage',
    'refresh_reminder_eligibility_snapshots', 'claim_due_typed_reminder_live'])
})
