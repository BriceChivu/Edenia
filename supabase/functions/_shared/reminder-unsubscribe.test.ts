import assert from 'node:assert/strict'
import test from 'node:test'

import {
  handleReminderUnsubscribeRequest,
  reminderUnsubscribeUnavailableResponse,
} from './reminder-unsubscribe.ts'

const TOKEN = 'A'.repeat(43)
const ENDPOINT = 'https://example-project.supabase.co/functions/v1/unsubscribe-study-reminders'
const EDENIA_ORIGIN = 'https://www.edenia.study'

function createClient({
  data = 'unsubscribed',
  error = null,
}: {
  data?: unknown
  error?: { message: string } | null
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
        return Promise.resolve({ data, error })
      },
    },
  }
}

function formRequest({
  locale = 'en',
  token = TOKEN,
  origin = EDENIA_ORIGIN,
  body = new URLSearchParams({ token, lang: locale }).toString(),
  url = ENDPOINT,
  contentType = 'application/x-www-form-urlencoded',
}: {
  locale?: string
  token?: string
  origin?: string | null
  body?: string
  url?: string
  contentType?: string
} = {}) {
  const headers = new Headers({ 'Content-Type': contentType })
  if (origin) headers.set('Origin', origin)
  return new Request(url, { method: 'POST', headers, body })
}

async function responseJson(response: Response) {
  return await response.json() as { status: string }
}

test('allowed Edenia POST consumes only the digest and returns exact-origin CORS', async () => {
  const harness = createClient()
  const response = await handleReminderUnsubscribeRequest(
    formRequest(),
    harness.client,
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await responseJson(response), { status: 'unsubscribed' })
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    EDENIA_ORIGIN,
  )
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('vary'), 'Origin')
  assert.match(
    response.headers.get('content-type') || '',
    /^application\/json/,
  )
  assert.deepEqual(harness.calls.map(call => call.name), [
    'consume_reminder_unsubscribe_token',
  ])
  assert.deepEqual(Object.keys(harness.calls[0].params || {}), [
    'p_token_digest',
  ])
  assert.match(
    String(harness.calls[0].params?.p_token_digest),
    /^\\x[0-9a-f]{64}$/,
  )
  assert.doesNotMatch(JSON.stringify(harness.calls), new RegExp(TOKEN))
})

test('preflight accepts only the exact browser origins, method, and content type', async () => {
  for (const origin of [EDENIA_ORIGIN, 'http://localhost:8000']) {
    const response = await handleReminderUnsubscribeRequest(
      new Request(ENDPOINT, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      }),
      createClient().client,
    )
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), origin)
    assert.equal(
      response.headers.get('access-control-allow-methods'),
      'POST, OPTIONS',
    )
    assert.equal(
      response.headers.get('access-control-allow-headers'),
      'Content-Type',
    )
  }
})

test('unknown browser origins and widened preflights fail before the RPC', async () => {
  const harness = createClient()
  const requests = [
    formRequest({ origin: 'https://evil.example' }),
    new Request(ENDPOINT, {
      method: 'OPTIONS',
      headers: {
        Origin: EDENIA_ORIGIN,
        'Access-Control-Request-Method': 'DELETE',
      },
    }),
    new Request(ENDPOINT, {
      method: 'OPTIONS',
      headers: {
        Origin: EDENIA_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type',
      },
    }),
  ]

  for (const request of requests) {
    const response = await handleReminderUnsubscribeRequest(
      request,
      harness.client,
    )
    assert.equal(response.status, 403)
    assert.deepEqual(await responseJson(response), {
      status: 'forbidden_origin',
    })
  }
  assert.deepEqual(harness.calls, [])
})

test('GET is API-only, returns JSON, and never checks token existence', async () => {
  const harness = createClient({ data: 'unsubscribed' })
  const response = await handleReminderUnsubscribeRequest(
    new Request(`${ENDPOINT}?token=${TOKEN}&lang=en`),
    harness.client,
  )

  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'POST, OPTIONS')
  assert.deepEqual(await responseJson(response), {
    status: 'method_not_allowed',
  })
  assert.deepEqual(harness.calls, [])
})

test('standards-compliant one-click POST remains available without browser CORS', async () => {
  const harness = createClient({ data: 'already_unsubscribed' })
  const response = await handleReminderUnsubscribeRequest(
    formRequest({
      origin: null,
      url: `${ENDPOINT}?token=${TOKEN}&lang=es`,
      body: 'List-Unsubscribe=One-Click',
    }),
    harness.client,
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await responseJson(response), {
    status: 'already_unsubscribed',
  })
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  assert.equal(harness.calls.length, 1)
})

test('invalid, unavailable, and unexpected RPC results fail closed', async () => {
  const cases = [
    { harness: createClient({ data: 'invalid' }), status: 400, value: 'invalid' },
    {
      harness: createClient({
        data: null,
        error: { message: 'database details must not escape' },
      }),
      status: 503,
      value: 'unavailable',
    },
    {
      harness: createClient({ data: { unexpected: true } }),
      status: 503,
      value: 'unavailable',
    },
  ]

  for (const { harness, status, value } of cases) {
    const response = await handleReminderUnsubscribeRequest(
      formRequest(),
      harness.client,
    )
    assert.equal(response.status, status)
    assert.deepEqual(await responseJson(response), { status: value })
  }
})

test('malformed form shapes, locales, media types, and bodies never mutate', async () => {
  const harness = createClient()
  const cases = [
    formRequest({ token: 'short' }),
    formRequest({ locale: 'de' }),
    formRequest({ url: `${ENDPOINT}?next=evil` }),
    formRequest({ body: `token=${TOKEN}&token=${TOKEN}&lang=en` }),
    formRequest({ body: `token=${TOKEN}&lang=en&extra=1` }),
    formRequest({ body: `List-Unsubscribe=One-Click&token=${TOKEN}` }),
    formRequest({ contentType: 'application/json', body: '{}' }),
    formRequest({ body: `token=${TOKEN}&lang=en&padding=${'x'.repeat(512)}` }),
  ]

  for (const request of cases) {
    const response = await handleReminderUnsubscribeRequest(
      request,
      harness.client,
    )
    assert.ok([400, 413, 415].includes(response.status))
  }
  assert.deepEqual(harness.calls, [])
})

test('unexpected endpoint failures use a generic secured JSON response', async () => {
  const request = formRequest()
  const response = reminderUnsubscribeUnavailableResponse(request)

  assert.equal(response.status, 503)
  assert.deepEqual(await responseJson(response), { status: 'unavailable' })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    EDENIA_ORIGIN,
  )
})
