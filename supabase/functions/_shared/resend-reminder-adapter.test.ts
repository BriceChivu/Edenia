import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createResendReminderIdempotencyKey,
  type ResendReminderSendInput,
  sendReminderWithResend,
  validateResendReminderConfiguration,
} from './resend-reminder-adapter.ts'

const DELIVERY_ID = '61111111-1111-4111-8111-111111111111'
const API_KEY = 're_test_key_1234567890'
const TOKEN = 'A'.repeat(43)
const UNSUBSCRIBE_API_URL =
  `https://example-project.supabase.co/functions/v1/unsubscribe-study-reminders?token=${TOKEN}&lang=en`
const INPUT: ResendReminderSendInput = Object.freeze({
  apiKey: API_KEY,
  from: 'Edenia <reminders@example.com>',
  to: 'Learner@Example.COM',
  deliveryId: DELIVERY_ID,
  subject: 'Your Edenia study reminder',
  text: 'Study with Edenia. Unsubscribe when you want.',
  html: '<p>Study with Edenia.</p>',
  unsubscribeApiUrl: UNSUBSCRIBE_API_URL,
})

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

test('builds one deterministic privacy-safe Resend request', async () => {
  let capturedUrl = ''
  let capturedInit: RequestInit | undefined
  const result = await sendReminderWithResend(INPUT, {
    fetcher: async (url, init) => {
      capturedUrl = String(url)
      capturedInit = init
      return jsonResponse(200, {
        id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794',
      })
    },
  })

  assert.deepEqual(result, {
    status: 'accepted',
    providerMessageId: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794',
  })
  assert.ok(Object.isFrozen(result))
  assert.equal(capturedUrl, 'https://api.resend.com/emails')
  assert.equal(capturedInit?.method, 'POST')
  assert.ok(capturedInit?.signal instanceof AbortSignal)

  const requestHeaders = new Headers(capturedInit?.headers)
  assert.equal(requestHeaders.get('authorization'), `Bearer ${API_KEY}`)
  assert.equal(requestHeaders.get('content-type'), 'application/json')
  assert.equal(
    requestHeaders.get('idempotency-key'),
    `edenia-study-reminder-v1/${DELIVERY_ID}`,
  )
  assert.equal(requestHeaders.get('user-agent'), 'Edenia-reminders/1.0')

  const payload = JSON.parse(String(capturedInit?.body))
  assert.deepEqual(payload, {
    from: INPUT.from,
    to: ['learner@example.com'],
    subject: INPUT.subject,
    text: INPUT.text,
    html: INPUT.html,
    headers: {
      'List-Unsubscribe': `<${UNSUBSCRIBE_API_URL}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
  assert.doesNotMatch(String(capturedInit?.body), /re_test_key/i)
})

test('locks one versioned idempotency key to the stable delivery UUID', () => {
  assert.equal(
    createResendReminderIdempotencyKey(
      '61111111-1111-4111-8111-11111111111A',
    ),
    'edenia-study-reminder-v1/61111111-1111-4111-8111-11111111111a',
  )
  assert.throws(
    () => createResendReminderIdempotencyKey('not-a-delivery-id'),
    /delivery ID is invalid/i,
  )
})

test('validates provider configuration without creating a request', () => {
  const configuration = validateResendReminderConfiguration(INPUT)
  assert.deepEqual(configuration, {
    apiKey: INPUT.apiKey,
    from: INPUT.from,
  })
  assert.ok(Object.isFrozen(configuration))
  assert.throws(
    () => validateResendReminderConfiguration({
      apiKey: 'not-a-key',
      from: INPUT.from,
    }),
    /API key is invalid/i,
  )
  assert.throws(
    () => validateResendReminderConfiguration({
      apiKey: INPUT.apiKey,
      from: 'bad-from-address',
    }),
    /From address is invalid/i,
  )
})

test('rejects malformed configuration and content before fetch', async () => {
  let fetchCalls = 0
  const fetcher = async () => {
    fetchCalls += 1
    return jsonResponse(200, { id: 'should-not-send' })
  }
  const invalidInputs: ResendReminderSendInput[] = [
    { ...INPUT, apiKey: 'not-a-key' },
    { ...INPUT, from: 'Edenia\n<reminders@example.com>' },
    { ...INPUT, to: 'not-an-email' },
    { ...INPUT, deliveryId: 'not-a-uuid' },
    { ...INPUT, subject: 'Unsafe\nsubject' },
    { ...INPUT, text: '' },
    { ...INPUT, html: '' },
    { ...INPUT, unsubscribeApiUrl: `${UNSUBSCRIBE_API_URL}&next=evil` },
  ]

  for (const input of invalidInputs) {
    await assert.rejects(
      sendReminderWithResend(input, { fetcher }),
      /invalid/i,
    )
  }
  await assert.rejects(
    sendReminderWithResend(INPUT, { fetcher, timeoutMs: 99 }),
    /timeout is invalid/i,
  )
  assert.equal(fetchCalls, 0)
})

test('classifies retryable provider responses without exposing response bodies', async () => {
  const cases = [
    {
      response: jsonResponse(409, { name: 'concurrent_idempotent_requests' }),
      expected: { status: 'deferred', reason: 'concurrent_request' },
    },
    {
      response: jsonResponse(
        429,
        { name: 'rate_limit_exceeded', message: 'contains@example.test' },
        { 'Retry-After': '30' },
      ),
      expected: {
        status: 'deferred',
        reason: 'rate_limited',
        retryAfterSeconds: 30,
      },
    },
    {
      response: jsonResponse(500, {
        name: 'internal_server_error',
        message: API_KEY,
      }),
      expected: { status: 'deferred', reason: 'provider_unavailable' },
    },
  ]

  for (const { response, expected } of cases) {
    const result = await sendReminderWithResend(INPUT, {
      fetcher: async () => response,
    })
    assert.deepEqual(result, expected)
    assert.doesNotMatch(JSON.stringify(result), /@|re_test_key/i)
  }
})

test('fails closed on provider rejections and idempotency conflicts', async () => {
  const cases = [
    [400, { name: 'validation_error' }, 'request_invalid'],
    [403, { name: 'invalid_api_key' }, 'authentication_or_domain'],
    [404, { name: 'not_found' }, 'configuration'],
    [409, { name: 'invalid_idempotent_request' }, 'idempotency_conflict'],
    [409, { name: 'unknown_conflict' }, 'provider_rejected'],
    [451, { name: 'security_error' }, 'security_rejection'],
    [418, { name: 'unexpected' }, 'provider_rejected'],
  ] as const

  for (const [status, body, reason] of cases) {
    const result = await sendReminderWithResend(INPUT, {
      fetcher: async () => jsonResponse(status, body),
    })
    assert.deepEqual(result, { status: 'blocked', reason })
  }
})

test('treats unknown success bodies as retryable ambiguous responses', async () => {
  for (const response of [
    jsonResponse(200, { id: 'invalid/message/id' }),
    new Response('not-json', { status: 200 }),
    new Response('{}', {
      status: 200,
      headers: { 'Content-Length': String(17 * 1024) },
    }),
  ]) {
    const result = await sendReminderWithResend(INPUT, {
      fetcher: async () => response,
    })
    assert.deepEqual(result, {
      status: 'deferred',
      reason: 'invalid_provider_response',
    })
  }
})

test('bounds network failures and timeouts without returning thrown details', async () => {
  const failed = await sendReminderWithResend(INPUT, {
    fetcher: async () => {
      throw new Error(`${API_KEY}:${INPUT.to}`)
    },
  })
  assert.deepEqual(failed, { status: 'deferred', reason: 'network_error' })
  assert.doesNotMatch(JSON.stringify(failed), /@|re_test_key/i)

  const timedOut = await sendReminderWithResend(INPUT, {
    timeoutMs: 100,
    fetcher: (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted with secret details', 'AbortError'))
      }, { once: true })
    }),
  })
  assert.deepEqual(timedOut, {
    status: 'deferred',
    reason: 'request_timeout',
  })
})
