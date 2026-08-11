import assert from 'node:assert/strict'
import test from 'node:test'

import {
  handleReminderUnsubscribeRequest,
  reminderUnsubscribeUnavailableResponse,
} from './reminder-unsubscribe.ts'

const TOKEN = 'A'.repeat(43)
const ENDPOINT = 'https://example-project.supabase.co/functions/v1/unsubscribe-study-reminders'
const LOCALES = ['en', 'zh-Hant', 'zh-Hans', 'es', 'fr'] as const

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

function getRequest(locale = 'en', token = TOKEN) {
  return new Request(`${ENDPOINT}?token=${token}&lang=${locale}`)
}

function formRequest(locale = 'en', token = TOKEN) {
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token, lang: locale }),
  })
}

test('GET renders a localized confirmation without reading or mutating the database', async () => {
  const harness = createClient()
  const response = await handleReminderUnsubscribeRequest(
    getRequest('fr'),
    harness.client,
  )
  const body = await response.text()

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('content-language'), 'fr')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(response.headers.get('x-frame-options'), 'DENY')
  assert.match(
    response.headers.get('content-security-policy') || '',
    /form-action 'self'/,
  )
  assert.match(body, /<html lang="fr">/)
  assert.match(body, /Arrêter les rappels/)
  assert.match(body, new RegExp(`name="token" value="${TOKEN}"`))
  assert.match(
    body,
    /action="unsubscribe-study-reminders"/,
  )
  assert.deepEqual(harness.calls, [])
})

test('GET does not reveal whether a well-formed capability exists', async () => {
  const first = createClient({ data: 'invalid' })
  const second = createClient({ data: 'unsubscribed' })
  const firstResponse = await handleReminderUnsubscribeRequest(
    getRequest('en', 'A'.repeat(43)),
    first.client,
  )
  const secondResponse = await handleReminderUnsubscribeRequest(
    getRequest('en', 'B'.repeat(43)),
    second.client,
  )

  assert.equal(firstResponse.status, 200)
  assert.equal(secondResponse.status, 200)
  assert.deepEqual(first.calls, [])
  assert.deepEqual(second.calls, [])
})

test('interactive POST consumes only the token digest and omits caller timestamps', async () => {
  const harness = createClient()
  const response = await handleReminderUnsubscribeRequest(
    formRequest('zh-Hant'),
    harness.client,
  )
  const body = await response.text()

  assert.equal(response.status, 200)
  assert.match(body, /學習提醒已停止/)
  assert.doesNotMatch(body, new RegExp(TOKEN))
  assert.equal(harness.calls.length, 1)
  assert.equal(harness.calls[0].name, 'consume_reminder_unsubscribe_token')
  assert.deepEqual(Object.keys(harness.calls[0].params || {}), [
    'p_token_digest',
  ])
  assert.match(
    String(harness.calls[0].params?.p_token_digest),
    /^\\x[0-9a-f]{64}$/,
  )
  assert.doesNotMatch(
    JSON.stringify(harness.calls),
    new RegExp(TOKEN),
  )
})

test('standards-compliant one-click POST consumes the query capability', async () => {
  const harness = createClient({ data: 'already_unsubscribed' })
  const response = await handleReminderUnsubscribeRequest(
    new Request(`${ENDPOINT}?token=${TOKEN}&lang=es`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    }),
    harness.client,
  )
  const body = await response.text()

  assert.equal(response.status, 200)
  assert.match(body, /ya estaban detenidos/)
  assert.equal(harness.calls.length, 1)
})

test('invalid, unavailable, and unexpected RPC results fail closed', async () => {
  const cases = [
    { harness: createClient({ data: 'invalid' }), status: 400 },
    {
      harness: createClient({
        data: null,
        error: { message: 'database details must not escape' },
      }),
      status: 503,
    },
    { harness: createClient({ data: { unexpected: true } }), status: 503 },
  ]

  for (const { harness, status } of cases) {
    const response = await handleReminderUnsubscribeRequest(
      formRequest(),
      harness.client,
    )
    const body = await response.text()
    assert.equal(response.status, status)
    assert.doesNotMatch(body, /database details|unexpected_error/i)
  }
})

test('rejects malformed methods, query parameters, media types, and large bodies', async () => {
  const harness = createClient()
  const cases = [
    {
      request: new Request(`${ENDPOINT}?token=${TOKEN}&lang=en&next=evil`),
      status: 400,
    },
    {
      request: new Request(`${ENDPOINT}?token=short&lang=en`),
      status: 400,
    },
    {
      request: new Request(`${ENDPOINT}?token=${TOKEN}&lang=de`),
      status: 400,
    },
    {
      request: new Request(ENDPOINT, { method: 'DELETE' }),
      status: 405,
      allow: 'GET, POST',
    },
    {
      request: new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      status: 415,
    },
    {
      request: new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${TOKEN}&lang=en&padding=${'x'.repeat(512)}`,
      }),
      status: 413,
    },
  ]

  for (const { request, status, allow } of cases) {
    const response = await handleReminderUnsubscribeRequest(
      request,
      harness.client,
    )
    assert.equal(response.status, status)
    assert.equal(response.headers.get('allow'), allow || null)
  }
  assert.deepEqual(harness.calls, [])
})

test('rejects parameter duplication and mixed interactive or one-click shapes', async () => {
  const harness = createClient()
  const bodies = [
    `token=${TOKEN}&token=${TOKEN}&lang=en`,
    `token=${TOKEN}&lang=en&extra=1`,
    `List-Unsubscribe=One-Click&token=${TOKEN}`,
    `List-Unsubscribe=not-one-click`,
  ]

  for (const body of bodies) {
    const response = await handleReminderUnsubscribeRequest(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }),
      harness.client,
    )
    assert.equal(response.status, 400)
  }
  assert.deepEqual(harness.calls, [])
})

test('serves accessible confirmation copy in all five reminder locales', async () => {
  for (const locale of LOCALES) {
    const harness = createClient()
    const response = await handleReminderUnsubscribeRequest(
      getRequest(locale),
      harness.client,
    )
    const body = await response.text()
    assert.equal(response.status, 200)
    assert.match(body, new RegExp(`<html lang="${locale}">`))
    assert.match(body, /<button type="submit">/)
    assert.match(body, /button:focus-visible/)
    assert.match(body, /name="lang"/)
    assert.deepEqual(harness.calls, [])
  }
})

test('unexpected endpoint failures use a generic secured response', async () => {
  const response = reminderUnsubscribeUnavailableResponse()
  const body = await response.text()

  assert.equal(response.status, 503)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.match(body, /try again later/i)
})
