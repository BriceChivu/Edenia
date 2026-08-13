import assert from 'node:assert/strict'
import test from 'node:test'

import {
  type AccountExportDependencies,
  handleAccountExportRequest,
} from './account-export.ts'

const ENDPOINT = 'https://example-project.supabase.co/functions/v1/export-account-data'
const EDENIA_ORIGIN = 'https://www.edenia.study'
const USER_A = '91111111-1111-4111-8111-111111111111'

function exportedData(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 'edenia-account-export-v1',
    generated_at: '2026-08-12T00:00:00.000Z',
    scope: {
      server_data: true,
      current_device_progress: false,
    },
    account: { id: USER_A, email: 'export@example.test' },
    cloud_backup_snapshots: [],
    reminders: {},
    ...overrides,
  }
}

function createHarness(options: {
  user?: { id: string } | null
  rateLimit?: { allowed: boolean; retryAfterSeconds: number }
  exportValue?: unknown
  authenticateError?: Error
  rateLimitError?: Error
  exportError?: Error
} = {}) {
  const calls = {
    authenticate: 0,
    rateLimit: [] as string[],
    loadExport: [] as string[],
  }
  const dependencies: AccountExportDependencies = {
    async authenticate() {
      calls.authenticate += 1
      if (options.authenticateError) throw options.authenticateError
      return options.user === undefined ? { id: USER_A } : options.user
    },
    async consumeRateLimit(userId) {
      calls.rateLimit.push(userId)
      if (options.rateLimitError) throw options.rateLimitError
      return options.rateLimit || { allowed: true, retryAfterSeconds: 1 }
    },
    async loadExport(userId) {
      calls.loadExport.push(userId)
      if (options.exportError) throw options.exportError
      return options.exportValue === undefined
        ? exportedData()
        : options.exportValue
    },
    now: () => new Date('2026-08-12T05:00:00.000Z'),
  }
  return { calls, dependencies }
}

function postRequest({
  origin = EDENIA_ORIGIN,
  body = '{}',
  contentType = 'application/json',
  method = 'POST',
}: {
  origin?: string | null
  body?: string
  contentType?: string
  method?: string
} = {}) {
  const headers = new Headers({ 'Content-Type': contentType })
  if (origin) headers.set('Origin', origin)
  return new Request(ENDPOINT, { method, headers, body: method === 'POST' ? body : undefined })
}

async function responseJson(response: Response) {
  return await response.json() as Record<string, unknown>
}

test('returns the verified owner export with exact-origin download headers', async () => {
  const harness = createHarness()
  const response = await handleAccountExportRequest(
    postRequest(),
    harness.dependencies,
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await responseJson(response), exportedData())
  assert.equal(response.headers.get('access-control-allow-origin'), EDENIA_ORIGIN)
  assert.equal(
    response.headers.get('access-control-expose-headers'),
    'Content-Disposition, Retry-After',
  )
  assert.equal(
    response.headers.get('content-disposition'),
    'attachment; filename="edenia-account-data-2026-08-12.json"',
  )
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(harness.calls, {
    authenticate: 1,
    rateLimit: [USER_A],
    loadExport: [USER_A],
  })
})

test('preflight accepts only the exact origins, method, and bounded headers', async () => {
  for (const origin of [EDENIA_ORIGIN, 'http://localhost:8000']) {
    const response = await handleAccountExportRequest(
      new Request(ENDPOINT, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization, apikey, content-type, x-client-info',
        },
      }),
      createHarness().dependencies,
    )
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), origin)
    assert.equal(
      response.headers.get('access-control-allow-methods'),
      'POST, OPTIONS',
    )
  }
})

test('missing, unknown, and widened origins fail before authentication', async () => {
  const harness = createHarness()
  const requests = [
    postRequest({ origin: null }),
    postRequest({ origin: 'https://evil.example' }),
    new Request(ENDPOINT, {
      method: 'OPTIONS',
      headers: {
        Origin: EDENIA_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, x-export-owner',
      },
    }),
  ]

  for (const request of requests) {
    const response = await handleAccountExportRequest(request, harness.dependencies)
    assert.equal(response.status, 403)
  }
  assert.equal(harness.calls.authenticate, 0)
  assert.deepEqual(harness.calls.rateLimit, [])
  assert.deepEqual(harness.calls.loadExport, [])
})

test('method, media type, body shape, and body size are bounded before auth', async () => {
  const harness = createHarness()
  const cases = [
    [postRequest({ method: 'GET' }), 405],
    [postRequest({ contentType: 'text/plain' }), 415],
    [postRequest({ body: '{' }), 400],
    [postRequest({ body: '{"user_id":"someone-else"}' }), 400],
    [postRequest({ body: JSON.stringify({ padding: 'x'.repeat(600) }) }), 413],
  ] as const

  for (const [request, status] of cases) {
    const response = await handleAccountExportRequest(request, harness.dependencies)
    assert.equal(response.status, status)
  }
  assert.equal(harness.calls.authenticate, 0)
})

test('authentication failure prevents rate limiting and database export', async () => {
  for (const user of [null, { id: 'not-a-uuid' }]) {
    const harness = createHarness({ user })
    const response = await handleAccountExportRequest(
      postRequest(),
      harness.dependencies,
    )
    assert.equal(response.status, 401)
    assert.equal((await responseJson(response)).code, 'authentication_required')
    assert.deepEqual(harness.calls.rateLimit, [])
    assert.deepEqual(harness.calls.loadExport, [])
  }
})

test('rate limiting stops the export bridge and returns a bounded retry delay', async () => {
  const harness = createHarness({
    rateLimit: { allowed: false, retryAfterSeconds: 17 },
  })
  const response = await handleAccountExportRequest(
    postRequest(),
    harness.dependencies,
  )

  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '17')
  assert.deepEqual(harness.calls.loadExport, [])
})

test('mismatched or malformed export documents fail closed', async () => {
  const values = [
    null,
    exportedData({ schema_version: 'unknown' }),
    exportedData({ account: { id: '92222222-2222-4222-8222-222222222222' } }),
    exportedData({ scope: { server_data: true, current_device_progress: true } }),
  ]

  for (const exportValue of values) {
    const response = await handleAccountExportRequest(
      postRequest(),
      createHarness({ exportValue }).dependencies,
    )
    assert.equal(response.status, 503)
    assert.equal((await responseJson(response)).code, 'export_unavailable')
  }
})

test('oversized exports fail without returning partial account data', async () => {
  const marker = 'private-export-marker'
  const response = await handleAccountExportRequest(
    postRequest(),
    createHarness({
      exportValue: exportedData({ oversized: marker + 'x'.repeat(8 * 1024 * 1024) }),
    }).dependencies,
  )

  assert.equal(response.status, 413)
  const body = JSON.stringify(await responseJson(response))
  assert.match(body, /export_too_large/)
  assert.doesNotMatch(body, new RegExp(marker))
})

test('dependency failures return one generic response without thrown details', async () => {
  for (const options of [
    { authenticateError: new Error('secret auth detail') },
    { rateLimitError: new Error('secret rate detail') },
    { exportError: new Error('secret database detail') },
  ]) {
    const response = await handleAccountExportRequest(
      postRequest(),
      createHarness(options).dependencies,
    )
    assert.equal(response.status, 503)
    const body = JSON.stringify(await responseJson(response))
    assert.deepEqual(JSON.parse(body), {
      error: 'Unable to export account data',
      code: 'export_unavailable',
    })
    assert.doesNotMatch(body, /secret/)
  }
})
