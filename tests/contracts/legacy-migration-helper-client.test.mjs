import assert from 'node:assert/strict'
import test from 'node:test'
import {
  submitEncryptedTransfer
} from '../../src/legacy-migration-helper.js'

const encrypted = {
  capabilityDigest: 'A'.repeat(43),
  ciphertext: 'ciphertext',
  ciphertextBytes: 10,
  ciphertextDigest: 'B'.repeat(43),
  iv: 'iv',
  plaintextBytes: 100
}
const runtime = {
  createTransferUrl: 'https://project.supabase.co/functions/v1/create-legacy-progress-transfer',
  supabasePublishableKey: 'sb_publishable_abcdefgh'
}

function jsonResponse(body, { ok = true } = {}) {
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type'
          ? 'application/json; charset=utf-8'
          : null
      }
    },
    json: async () => body,
    ok
  }
}

test('helper relay client sends only opaque exact fields with a publishable key', async () => {
  const calls = []
  const now = Date.parse('2026-08-13T00:00:00.000Z')
  const result = await submitEncryptedTransfer({
    encrypted,
    fetchImpl: async (...args) => {
      calls.push(args)
      return jsonResponse({
        expires_at: '2026-08-13T00:15:00.000Z',
        status: 'created'
      })
    },
    now: () => now,
    runtime
  })
  assert.equal(result, true)
  assert.equal(calls.length, 1)
  const [url, options] = calls[0]
  assert.equal(url, runtime.createTransferUrl)
  assert.deepEqual(options.headers, {
    apikey: runtime.supabasePublishableKey,
    'Content-Type': 'application/json'
  })
  assert.equal(Object.hasOwn(options.headers, 'Authorization'), false)
  assert.deepEqual(JSON.parse(options.body), {
    capability_digest: encrypted.capabilityDigest,
    ciphertext: encrypted.ciphertext,
    ciphertext_bytes: encrypted.ciphertextBytes,
    ciphertext_digest: encrypted.ciphertextDigest,
    iv: encrypted.iv
  })
  assert.equal(options.credentials, 'omit')
  assert.equal(options.referrerPolicy, 'no-referrer')
  assert.ok(options.signal)
})

test('helper relay client aborts a stalled request and rejects invalid expiry', async () => {
  let aborted = false
  const stalled = submitEncryptedTransfer({
    encrypted,
    fetchImpl: (_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted = true
        reject(new DOMException('Timed out', 'AbortError'))
      }, { once: true })
    }),
    runtime,
    setTimeoutImpl(callback) {
      queueMicrotask(callback)
      return 1
    }
  })
  assert.equal(await stalled, false)
  assert.equal(aborted, true)

  assert.equal(await submitEncryptedTransfer({
    encrypted,
    fetchImpl: async () => jsonResponse({
      expires_at: '2026-08-13T00:00:00.000Z',
      status: 'created'
    }),
    now: () => Date.parse('2026-08-13T00:00:00.000Z'),
    runtime
  }), false)
})
