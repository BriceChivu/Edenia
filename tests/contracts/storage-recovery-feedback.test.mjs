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
  const data = new Map()
  const store = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key,value), removeItem: key => data.delete(key) }
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
