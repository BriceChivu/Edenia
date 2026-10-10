import test from 'node:test'
import assert from 'node:assert/strict'
import { createStorageRecoveryFeedback, FEEDBACK_CAPTURE_URL } from '../../src/integrations/storage-recovery-feedback.js'
const details = { failure: { code: 'profile-invalid', retryable: false }, mode: 'auth-trial', release: 'test-release', locale: 'en', width: 390, height: 844 }

test('storage diagnostics go directly to the existing Discord feedback event without browser storage or analytics', async () => {
  for (const origin of ['https://edenia.study', 'https://www.edenia.study']) {
    const calls = []
    const report = createStorageRecoveryFeedback({
      location: { origin, href: origin + '/?token=PRIVATE#access_token=SECRET' },
      createId: () => '00000000-0000-4000-8000-000000000001',
      fetch: async (url, options) => { calls.push({ url, options }); return { ok: true } }
    })
    assert.equal(await report(details), 'sent')
    assert.equal(await report(details), 'sent')
    assert.equal(calls.length, 1)
    const { url, options } = calls[0]
    assert.equal(url, FEEDBACK_CAPTURE_URL)
    assert.equal(options.credentials, 'omit')
    const payload = JSON.parse(options.body)
    assert.equal(payload.event, 'feedback_submitted')
    assert.equal(payload.properties.feedback_source, 'automatic_storage_recovery')
    assert.equal(payload.properties.page_url, origin + '/')
    assert.equal(payload.properties.session_replay_url, null)
    assert.equal(payload.properties.$process_person_profile, false)
    assert.equal(payload.properties.feedback_name, null)
    assert.equal(payload.properties.feedback_email, null)
    assert.match(payload.properties.feedback_message, /profile-invalid/)
    assert.doesNotMatch(options.body, /PRIVATE|SECRET/)
  }
})

test('network failure is honest and explicit report retry reuses its ingestion UUID', async () => {
  const payloads = []
  const report = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' },
    createId: () => 'test-report', fetch: async (_, options) => {
      payloads.push(JSON.parse(options.body))
      if (payloads.length === 1) throw new Error('offline')
      return { ok: true }
    } })
  assert.equal(await report(details), 'failed')
  assert.equal(await report(details), 'failed')
  assert.equal(payloads.length, 1)
  assert.equal(await report(details, { retry: true }), 'sent')
  assert.equal(payloads[0].uuid, payloads[1].uuid)
})

test('concurrent screen rendering sends just one report and previews never send live feedback', async () => {
  let count = 0
  const report = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' }, fetch: async () => { count++; return { ok: false } } })
  assert.deepEqual(await Promise.all([report(details), report(details)]), ['failed', 'failed'])
  assert.equal(count, 1)
  const preview = createStorageRecoveryFeedback({ location: { origin: 'http://localhost:8055' }, fetch: () => { throw new Error('must not transmit') } })
  assert.equal(await preview(details), 'unavailable')
})

test('offline diagnostics survive reload and retry with the original report UUID', async () => {
  const store = nativeLikeStore()
  const data = store.data
  const first = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' }, getStores: () => [() => store],
    createId: () => '11111111-1111-4111-8111-111111111111', fetch: async () => { throw new Error('offline') } })
  assert.equal(await first({ ...details, operation: 'open', recovery: 'local', capabilities: { browser: 'Chrome/130.0 Android 15' } }), 'failed')
  const payloads = []
  const next = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' }, getStores: () => [() => store],
    fetch: async (_, options) => { payloads.push(JSON.parse(options.body)); return { ok: true } } })
  assert.deepEqual(await next.retryPending(), ['sent'])
  assert.equal(payloads[0].uuid, '11111111-1111-4111-8111-111111111111')
  assert.match(payloads[0].properties.feedback_message, /Android 15/)
  assert.equal(data.size, 0)
})

function nativeLikeStore() {
  const data = new Map()
  return {
    data,
    get length() { return data.size },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  }
}

test('two offline tabs retain both diagnostics even when opened before either failure', async () => {
  const store = nativeLikeStore()
  const make = id => createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' },
    getStores: () => [() => store], createId: () => id, fetch: async () => { throw new Error('offline') } })
  const first = make('first-tab-report')
  const second = make('second-tab-report')
  await first(details)
  await second({ ...details, operation: 'save' })
  const sent = []
  const reloaded = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' },
    getStores: () => [() => store], fetch: async (_, options) => { sent.push(JSON.parse(options.body).uuid); return { ok: true } } })
  await reloaded.retryPending()
  assert.deepEqual(sent.sort(), ['first-tab-report','second-tab-report'])
  assert.equal(store.length, 0)
})

test('acknowledging one tab report does not erase another tab pending report', async () => {
  const store = nativeLikeStore()
  const online = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' },
    getStores: () => [() => store], createId: () => 'online-report', fetch: async () => ({ ok: true }) })
  const offline = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' },
    getStores: () => [() => store], createId: () => 'offline-report', fetch: async () => { throw new Error('offline') } })
  await offline(details)
  await online({ ...details, operation: 'save' })
  const sent = []
  const reloaded = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' },
    getStores: () => [() => store], fetch: async (_, options) => { sent.push(JSON.parse(options.body).uuid); return { ok: true } } })
  await reloaded.retryPending()
  assert.deepEqual(sent, ['offline-report'])
})

test('identical diagnostics from separate tabs keep both original report UUIDs', async () => {
  const store = nativeLikeStore()
  const make = id => createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' },
    getStores: () => [() => store], createId: () => id, fetch: async () => ({ ok: false }) })
  const first = make('first-identical')
  const second = make('second-identical')
  await first(details)
  await second(details)
  const ids = []
  const next = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' }, getStores: () => [() => store],
    fetch: async (_, options) => { ids.push(JSON.parse(options.body).uuid); return { ok: true } } })
  await next.retryPending()
  assert.deepEqual(ids.sort(), ['first-identical', 'second-identical'])
})

test('a corrupt legacy entry cannot suppress valid later reports or replay private metadata', async () => {
  const store = nativeLikeStore()
  const diagnostic = JSON.stringify({ code: 'storage-denied', mode: 'auth-trial', release: 'test-release' })
  store.setItem('edenia_storage_feedback_outbox_v1', JSON.stringify([
    { id: 'broken', diagnostic: '{' },
    { id: 'valid-legacy', diagnostic, submittedAt: 'SECRET', locale: 'PRIVATE@EMAIL', width: 'PRIVATE', height: Infinity }
  ]))
  const calls = []
  const next = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' }, getStores: () => [() => store],
    now: () => '2026-10-10T04:00:00.000Z', fetch: async (_, options) => { calls.push(JSON.parse(options.body)); return { ok: true } } })
  await next.retryPending()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].uuid, 'valid-legacy')
  assert.equal(calls[0].properties.submitted_at, '2026-10-10T04:00:00.000Z')
  assert.doesNotMatch(JSON.stringify(calls), /SECRET|PRIVATE/)
  assert.equal(store.length, 0)
})

test('legacy pending reports migrate safely when copying them encounters quota pressure', async () => {
  const store = nativeLikeStore()
  const diagnostic = JSON.stringify({ code: 'storage-denied', mode: 'public', release: 'test-release' })
  store.setItem('edenia_storage_feedback_outbox_v1', JSON.stringify([{ id: 'legacy-report', diagnostic }]))
  const set = store.setItem
  store.setItem = (key, value) => {
    if (key.includes('_report_')) throw new DOMException('Full', 'QuotaExceededError')
    set(key, value)
  }
  const failed = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' }, getStores: () => [() => store], fetch: async () => ({ ok: false }) })
  await failed.retryPending()
  assert.match(store.getItem('edenia_storage_feedback_outbox_v1'), /legacy-report/)
  store.setItem = set
  const sent = []
  const next = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' }, getStores: () => [() => store],
    fetch: async (_, options) => { sent.push(JSON.parse(options.body).uuid); return { ok: true } } })
  await next.retryPending()
  assert.deepEqual(sent, ['legacy-report'])
  assert.equal(store.length, 0)
})

test('persisted reports remain bounded without touching learner or auth storage', async () => {
  const store = nativeLikeStore()
  store.setItem('profile', 'PRIVATE PROGRESS')
  store.setItem('auth', 'SECRET TOKEN')
  let id = 0
  const report = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' }, getStores: () => [() => store],
    createId: () => `bounded-${++id}`, fetch: async () => ({ ok: false }) })
  for (let index = 0; index < 25; index++) await report({ ...details, release: `release-${index}` })
  assert.equal([...store.data.keys()].filter(key => key.startsWith('edenia_storage_feedback_outbox_v1_report_')).length, 20)
  assert.equal(store.getItem('profile'), 'PRIVATE PROGRESS')
  assert.equal(store.getItem('auth'), 'SECRET TOKEN')
})

test('an ingestion timeout retains the report and retries the same UUID without blocking the app', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const store = nativeLikeStore()
  const payloads = []
  const report = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' },
    getStores: () => [() => store], createId: () => 'timeout-report',
    fetch: (_, options) => {
      payloads.push(JSON.parse(options.body))
      if (payloads.length > 1) return Promise.resolve({ ok: true })
      return new Promise((resolve, reject) => options.signal.addEventListener('abort',
        () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
    } })
  const pending = report(details)
  t.mock.timers.tick(5000)
  assert.equal(await pending, 'failed')
  assert.equal(store.data.size, 1)
  assert.deepEqual(await report.retryPending(), ['sent'])
  assert.equal(payloads[0].uuid, payloads[1].uuid)
  assert.equal(store.data.size, 0)
})
test('HTTP rejection and denied outbox storage still retry from memory with the same UUID', async () => {
  const payloads = []
  const denied = () => { throw new DOMException('Denied', 'SecurityError') }
  const report = createStorageRecoveryFeedback({ location: { origin: 'https://edenia.study' },
    getStores: () => [denied, denied], createId: () => 'memory-network-report',
    fetch: async (_, options) => { payloads.push(JSON.parse(options.body)); return { ok: payloads.length > 1 } } })
  assert.equal(await report(details), 'failed')
  assert.deepEqual(await report.retryPending(), ['sent'])
  assert.equal(payloads[0].uuid, payloads[1].uuid)
})
