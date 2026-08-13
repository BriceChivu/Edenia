import assert from 'node:assert/strict'
import test from 'node:test'

import {
  handleLegacyProgressTransferRequest,
  legacyProgressTransferUnavailableResponse,
} from './legacy-progress-transfer.ts'

const ENDPOINT = 'https://project.supabase.co/functions/v1/'
  + 'create-legacy-progress-transfer'
const CREATE_ORIGIN = 'https://bricechivu.github.io'
const CONSUME_ORIGIN = 'https://www.edenia.study'
const APIKEY = 'sb_publishable_abcdefgh'
const CAPABILITY_DIGEST = 'A'.repeat(43)
const IV = 'B'.repeat(16)
const CIPHERTEXT = 'AQIDBAUGBwgJCgsMDQ4PEBE'

async function ciphertextDigest() {
  const bytes = Uint8Array.from({ length: 17 }, (_, index) => index + 1)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  let binary = ''
  for (const byte of digest) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

function postgresBytea(bytes: number[]) {
  return `\\x${bytes.map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

function request({
  body,
  headers = {},
  method = 'POST',
  origin = CREATE_ORIGIN,
  url = ENDPOINT,
}: {
  body?: string
  headers?: Record<string, string>
  method?: string
  origin?: string | null
  url?: string
} = {}) {
  const requestHeaders = new Headers({
    apikey: APIKEY,
    'Content-Type': 'application/json',
    ...headers,
  })
  if (origin) requestHeaders.set('Origin', origin)
  return new Request(url, {
    body: ['GET', 'HEAD'].includes(method) ? undefined : body,
    headers: requestHeaders,
    method,
  })
}

function createHarness(data: unknown) {
  const calls: Array<{
    name: string
    params: Record<string, unknown> | undefined
  }> = []
  return {
    calls,
    client: {
      rpc(name: string, params?: Record<string, unknown>) {
        calls.push({ name, params })
        return Promise.resolve({ data, error: null })
      },
    },
  }
}

async function responseJson(response: Response) {
  return await response.json() as Record<string, unknown>
}

test('create validates opaque bytes and calls only the exact service RPC', async () => {
  const digest = await ciphertextDigest()
  const harness = createHarness([{
    expires_at: '2026-08-13T00:15:00+00:00',
    status: 'created',
  }])
  const response = await handleLegacyProgressTransferRequest(
    request({
      body: JSON.stringify({
        capability_digest: CAPABILITY_DIGEST,
        ciphertext: CIPHERTEXT,
        ciphertext_bytes: 17,
        ciphertext_digest: digest,
        iv: IV,
      }),
    }),
    'create',
    harness.client,
    { now: () => new Date('2026-08-13T00:00:00.000Z') },
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await responseJson(response), {
    expires_at: '2026-08-13T00:15:00.000Z',
    status: 'created',
  })
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    CREATE_ORIGIN,
  )
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(harness.calls.length, 1)
  assert.equal(harness.calls[0].name, 'create_legacy_progress_transfer')
  assert.deepEqual(Object.keys(harness.calls[0].params || {}).sort(), [
    'p_capability_digest',
    'p_ciphertext',
    'p_ciphertext_bytes',
    'p_ciphertext_digest',
    'p_initialization_vector',
  ])
  assert.match(
    String(harness.calls[0].params?.p_capability_digest),
    /^\\x[0-9a-f]{64}$/,
  )
  assert.doesNotMatch(
    JSON.stringify(harness.calls[0].params),
    /email|posthog|serialized_state|source_hash/i,
  )
})

test('consume claim validates database bytes and returns exact wire fields', async () => {
  const digest = await ciphertextDigest()
  const digestBytes = [...new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      Uint8Array.from({ length: 17 }, (_, index) => index + 1),
    ),
  )]
  const harness = createHarness([{
    ciphertext: postgresBytea(
      Array.from({ length: 17 }, (_, index) => index + 1),
    ),
    ciphertext_bytes: 17,
    ciphertext_digest: postgresBytea(digestBytes),
    expires_at: '2026-08-13T00:15:00+00:00',
    initialization_vector: postgresBytea(Array(12).fill(4)),
    status: 'claimed',
  }])
  const response = await handleLegacyProgressTransferRequest(
    request({
      body: JSON.stringify({
        action: 'claim',
        capability_digest: CAPABILITY_DIGEST,
      }),
      origin: CONSUME_ORIGIN,
      url: ENDPOINT.replace('create-', 'consume-'),
    }),
    'consume',
    harness.client,
    { now: () => new Date('2026-08-13T00:00:00.000Z') },
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await responseJson(response), {
    ciphertext: CIPHERTEXT,
    ciphertext_bytes: 17,
    ciphertext_digest: digest,
    expires_at: '2026-08-13T00:15:00.000Z',
    iv: 'BAQEBAQEBAQEBAQE',
    status: 'claimed',
  })
  assert.equal(harness.calls[0].name, 'claim_legacy_progress_transfer')
  assert.deepEqual(Object.keys(harness.calls[0].params || {}), [
    'p_capability_digest',
  ])
})

test('consume completion accepts only idempotent success statuses', async () => {
  for (const status of ['completed', 'already_completed']) {
    const harness = createHarness(status)
    const response = await handleLegacyProgressTransferRequest(
      request({
        body: JSON.stringify({
          action: 'complete',
          capability_digest: CAPABILITY_DIGEST,
        }),
        origin: CONSUME_ORIGIN,
      }),
      'consume',
      harness.client,
    )
    assert.equal(response.status, 200)
    assert.deepEqual(await responseJson(response), { status })
    assert.equal(
      harness.calls[0].name,
      'complete_legacy_progress_transfer',
    )
  }
})

test('exact-origin preflight allows only apikey and content type', async () => {
  for (const [mode, origin] of [
    ['create', CREATE_ORIGIN],
    ['create', 'http://localhost:8002'],
    ['consume', CONSUME_ORIGIN],
    ['consume', 'http://localhost:8000'],
  ] as const) {
    const response = await handleLegacyProgressTransferRequest(
      request({
        headers: {
          'Access-Control-Request-Headers': 'apikey, content-type',
          'Access-Control-Request-Method': 'POST',
        },
        method: 'OPTIONS',
        origin,
      }),
      mode,
      createHarness(null).client,
    )
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), origin)
    assert.equal(
      response.headers.get('access-control-allow-headers'),
      'apikey, Content-Type',
    )
  }
})

test('forged origins, widened headers, Authorization, and methods fail closed', async () => {
  const harness = createHarness(null)
  const cases = [
    request({ body: '{}', origin: 'https://evil.example' }),
    request({ body: '{}', method: 'PUT' }),
    request({ body: '{}', headers: { Authorization: 'Bearer secret' } }),
    request({
      headers: {
        'Access-Control-Request-Headers': 'authorization, content-type',
        'Access-Control-Request-Method': 'POST',
      },
      method: 'OPTIONS',
    }),
  ]
  for (const candidate of cases) {
    const response = await handleLegacyProgressTransferRequest(
      candidate,
      'create',
      harness.client,
    )
    assert.ok([400, 403, 405].includes(response.status))
  }
  assert.deepEqual(harness.calls, [])
})

test('malformed, widened, noncanonical, mismatched, and oversized bodies never call RPC', async () => {
  const digest = await ciphertextDigest()
  const valid = {
    capability_digest: CAPABILITY_DIGEST,
    ciphertext: CIPHERTEXT,
    ciphertext_bytes: 17,
    ciphertext_digest: digest,
    iv: IV,
  }
  const harness = createHarness(null)
  const cases = [
    request({ body: '{' }),
    request({ body: JSON.stringify({ ...valid, extra: true }) }),
    request({ body: JSON.stringify({ ...valid, capability_digest: 'short' }) }),
    request({ body: JSON.stringify({ ...valid, ciphertext: `${CIPHERTEXT}=` }) }),
    request({ body: JSON.stringify({ ...valid, ciphertext_bytes: 18 }) }),
    request({ body: JSON.stringify({ ...valid, ciphertext_digest: 'C'.repeat(43) }) }),
    request({ body: JSON.stringify(valid), headers: { 'Content-Type': 'text/plain' } }),
    request({ body: JSON.stringify(valid), headers: { 'Content-Length': String(12 * 1024 * 1024) } }),
    request({ body: ' '.repeat(3 * 1024 * 1024 + 1) }),
    new Request(ENDPOINT, {
      body: Uint8Array.from([0xff]),
      headers: {
        apikey: APIKEY,
        'Content-Type': 'application/json',
        Origin: CREATE_ORIGIN,
      },
      method: 'POST',
    }),
  ]
  for (const candidate of cases) {
    const response = await handleLegacyProgressTransferRequest(
      candidate,
      'create',
      harness.client,
    )
    assert.ok([400, 413, 415].includes(response.status))
  }
  assert.deepEqual(harness.calls, [])
})

test('database errors and thrown dependencies expose no internal detail', async () => {
  const digest = await ciphertextDigest()
  const body = JSON.stringify({
    capability_digest: CAPABILITY_DIGEST,
    ciphertext: CIPHERTEXT,
    ciphertext_bytes: 17,
    ciphertext_digest: digest,
    iv: IV,
  })
  const details = 'database ciphertext capability internal detail'
  for (const client of [
    {
      rpc() {
        return Promise.resolve({ data: null, error: { message: details } })
      },
    },
    {
      rpc() {
        throw new Error(details)
      },
    },
  ]) {
    const response = await handleLegacyProgressTransferRequest(
      request({ body }),
      'create',
      client,
    )
    const serialized = JSON.stringify(await responseJson(response))
    assert.equal(response.status, 503)
    assert.equal(serialized.includes(details), false)
    assert.deepEqual(JSON.parse(serialized), { status: 'unavailable' })
  }
})

test('the exact maximum ciphertext stays within the bounded wire contract', async () => {
  const ciphertext = new Uint8Array(2 * 1024 * 1024 + 16)
  ciphertext.fill(7)
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', ciphertext),
  )
  const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
  const harness = createHarness([{
    expires_at: '2026-08-13T00:15:00+00:00',
    status: 'created',
  }])
  const response = await handleLegacyProgressTransferRequest(
    request({
      body: JSON.stringify({
        capability_digest: CAPABILITY_DIGEST,
        ciphertext: encode(ciphertext),
        ciphertext_bytes: ciphertext.byteLength,
        ciphertext_digest: encode(digest),
        iv: IV,
      }),
    }),
    'create',
    harness.client,
    { now: () => new Date('2026-08-13T00:00:00.000Z') },
  )

  assert.equal(response.status, 200)
  assert.equal(harness.calls.length, 1)
  assert.equal(
    String(harness.calls[0].params?.p_ciphertext).length,
    2 + ciphertext.byteLength * 2,
  )
})

test('database controls and malformed RPC responses map to generic outcomes', async () => {
  const consumeBody = JSON.stringify({
    action: 'claim',
    capability_digest: CAPABILITY_DIGEST,
  })
  for (const [data, expectedStatus, expectedValue] of [
    [[{
      ciphertext: null,
      ciphertext_bytes: null,
      ciphertext_digest: null,
      expires_at: null,
      initialization_vector: null,
      status: 'invalid',
    }], 400, 'invalid'],
    [[{
      ciphertext: null,
      ciphertext_bytes: null,
      ciphertext_digest: null,
      expires_at: null,
      initialization_vector: null,
      status: 'consumption_disabled',
    }], 503, 'unavailable'],
    [[{ unexpected: true }], 503, 'unavailable'],
  ] as const) {
    const response = await handleLegacyProgressTransferRequest(
      request({ body: consumeBody, origin: CONSUME_ORIGIN }),
      'consume',
      createHarness(data).client,
    )
    assert.equal(response.status, expectedStatus)
    assert.deepEqual(await responseJson(response), { status: expectedValue })
  }
})

test('unexpected entrypoint failures use generic secured JSON', async () => {
  const response = legacyProgressTransferUnavailableResponse(
    request({ body: '{}' }),
    'create',
  )
  assert.equal(response.status, 503)
  assert.deepEqual(await responseJson(response), { status: 'unavailable' })
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('vary'), 'Origin')
})
