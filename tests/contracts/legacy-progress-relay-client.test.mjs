import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import test from 'node:test'
import {
  createLegacyProgressRelayClient,
  deriveLegacyProgressCapabilityDigest,
  deriveLegacyProgressRelayRuntime
} from '../../src/integrations/legacy-progress-relay-client.js'
import {
  encodeBase64Url,
  sha256Base64Url
} from '../../src/state/portable-state.js'

const capability = encodeBase64Url(new Uint8Array(32).fill(7))
const capabilityDigest = await deriveLegacyProgressCapabilityDigest(
  capability,
  webcrypto
)
const productionRuntime = deriveLegacyProgressRelayRuntime({
  locationLike: { href: 'https://www.edenia.study/' },
  supabasePublishableKey: 'sb_publishable_abcdefgh',
  supabaseUrl: 'https://project-ref.supabase.co'
})

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

async function claimedResponse(overrides = {}) {
  const ciphertextBytes = new Uint8Array(17)
  return {
    ciphertext: encodeBase64Url(ciphertextBytes),
    ciphertext_bytes: ciphertextBytes.byteLength,
    ciphertext_digest: await sha256Base64Url(ciphertextBytes, webcrypto),
    expires_at: '2026-08-13T00:15:00.000Z',
    iv: encodeBase64Url(new Uint8Array(12)),
    status: 'claimed',
    ...overrides
  }
}

test('relay runtime accepts only exact canonical and explicit local test locations', () => {
  assert.deepEqual(productionRuntime, {
    consumeTransferUrl:
      'https://project-ref.supabase.co/functions/v1/consume-legacy-progress-transfer',
    destinationEligible: true,
    localTest: false,
    supabasePublishableKey: 'sb_publishable_abcdefgh',
    valid: true
  })
  const local = deriveLegacyProgressRelayRuntime({
    isLegacyMigrationTest: true,
    locationLike: {
      href: 'http://localhost:8000/?legacy_migration_test=1'
    },
    supabasePublishableKey: 'sb_publishable_localtest',
    supabaseUrl: 'http://localhost:8000'
  })
  assert.equal(local.valid, true)
  assert.equal(local.destinationEligible, true)
  assert.equal(local.localTest, true)

  for (const input of [
    { locationLike: { href: 'https://edenia.study/' } },
    { locationLike: { href: 'https://www.edenia.study/path' } },
    { locationLike: { href: 'https://www.edenia.study/?extra=1' } },
    { locationLike: { href: 'http://localhost:8000/?legacy_migration_test=1' } },
    {
      isLegacyMigrationTest: true,
      locationLike: { href: 'http://localhost:8000/?legacy_migration_test=1' },
      supabaseUrl: 'https://attacker.example'
    }
  ]) {
    assert.equal(deriveLegacyProgressRelayRuntime({
      supabasePublishableKey: 'sb_publishable_abcdefgh',
      supabaseUrl: 'https://project-ref.supabase.co',
      ...input
    }).valid, false)
  }
})

test('canonical destination eligibility survives missing relay configuration', () => {
  assert.deepEqual(deriveLegacyProgressRelayRuntime({
    locationLike: { href: 'https://www.edenia.study/' },
    supabasePublishableKey: '',
    supabaseUrl: ''
  }), {
    destinationEligible: true,
    valid: false
  })
  assert.deepEqual(deriveLegacyProgressRelayRuntime({
    locationLike: { href: 'https://edenia.study/' },
    supabasePublishableKey: '',
    supabaseUrl: ''
  }), {
    destinationEligible: false,
    valid: false
  })
})

test('relay client sends only a capability digest and publishable key', async () => {
  const calls = []
  const client = createLegacyProgressRelayClient({
    cryptoLike: webcrypto,
    fetchImpl: async (...args) => {
      calls.push(args)
      return jsonResponse(await claimedResponse())
    },
    now: () => Date.parse('2026-08-13T00:00:00.000Z'),
    runtime: productionRuntime
  })
  await client.claim(capabilityDigest)
  const [url, options] = calls[0]
  assert.equal(url, productionRuntime.consumeTransferUrl)
  assert.deepEqual(options.headers, {
    apikey: 'sb_publishable_abcdefgh',
    'Content-Type': 'application/json'
  })
  assert.equal(Object.hasOwn(options.headers, 'Authorization'), false)
  assert.deepEqual(JSON.parse(options.body), {
    action: 'claim',
    capability_digest: capabilityDigest
  })
  assert.doesNotMatch(options.body, new RegExp(capability))
  assert.equal(options.credentials, 'omit')
  assert.equal(options.referrerPolicy, 'no-referrer')
})

test('relay client validates claim bytes, digest, expiry, and exact fields', async () => {
  const now = () => Date.parse('2026-08-13T00:00:00.000Z')
  for (const response of [
    await claimedResponse({ ciphertext_bytes: 18 }),
    await claimedResponse({ ciphertext_digest: 'A'.repeat(43) }),
    await claimedResponse({ expires_at: '2026-08-13T00:00:00.000Z' }),
    await claimedResponse({ extra: true }),
    { status: 'unavailable' }
  ]) {
    const client = createLegacyProgressRelayClient({
      cryptoLike: webcrypto,
      fetchImpl: async () => jsonResponse(response),
      now,
      runtime: productionRuntime
    })
    await assert.rejects(client.claim(capabilityDigest), /unavailable/)
  }
})

test('relay completion is exact and request timeout is fail-closed', async () => {
  const calls = []
  const client = createLegacyProgressRelayClient({
    cryptoLike: webcrypto,
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body))
      return jsonResponse({ status: 'already_completed' })
    },
    runtime: productionRuntime
  })
  assert.equal(await client.complete(capabilityDigest), 'already_completed')
  assert.deepEqual(calls, [{
    action: 'complete',
    capability_digest: capabilityDigest
  }])

  let aborted = false
  const stalled = createLegacyProgressRelayClient({
    cryptoLike: webcrypto,
    fetchImpl: (_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted = true
        reject(new DOMException('Timed out', 'AbortError'))
      }, { once: true })
    }),
    runtime: productionRuntime,
    setTimeoutImpl(callback) {
      queueMicrotask(callback)
      return 1
    }
  })
  await assert.rejects(stalled.complete(capabilityDigest), /unavailable/)
  assert.equal(aborted, true)
})

test('capability digest accepts only one canonical 32-byte capability', async () => {
  assert.equal(capability.length, 43)
  assert.equal(capabilityDigest.length, 43)
  for (const value of ['', 'short', 'A'.repeat(42), 'A'.repeat(44)]) {
    await assert.rejects(
      deriveLegacyProgressCapabilityDigest(value, webcrypto),
      /invalid/
    )
  }
})
