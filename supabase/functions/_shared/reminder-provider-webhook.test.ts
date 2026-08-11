import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'

import {
  handleReminderProviderWebhook,
} from './reminder-provider-webhook.ts'
import type {
  ReminderProviderEventInput,
  ReminderProviderEventResult,
} from './reminder-provider-webhook.ts'

const ENDPOINT =
  'https://example-project.supabase.co/functions/v1/resend-reminder-webhook'
const SECRET_BYTES = Buffer.from(
  '0123456789abcdef0123456789abcdef',
  'utf8',
)
const WEBHOOK_SECRET = `whsec_${SECRET_BYTES.toString('base64')}`
const EVENT_ID = 'msg_61111111111141118111111111111111'
const DELIVERY_ID = '61111111-1111-4111-8111-111111111111'
const PROVIDER_MESSAGE_ID = '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794'

function eventBody(overrides: Record<string, unknown> = {}) {
  const base = {
    type: 'email.bounced',
    created_at: new Date().toISOString(),
    data: {
      email_id: PROVIDER_MESSAGE_ID,
      message_id: '<private-recipient@example.test>',
      from: 'Edenia <private-sender@example.test>',
      to: ['private-recipient@example.test'],
      subject: 'Private subject',
      tags: {
        source: 'edenia-study-reminder',
        delivery_id: DELIVERY_ID,
      },
    },
  }
  return JSON.stringify({ ...base, ...overrides })
}

function signature(payload: string, eventId: string, timestamp: number) {
  return `v1,${createHmac('sha256', SECRET_BYTES)
    .update(`${eventId}.${timestamp}.${payload}`)
    .digest('base64')}`
}

function signedRequest(
  payload: string,
  {
    eventId = EVENT_ID,
    timestamp = Math.floor(Date.now() / 1000),
    contentType = 'application/json',
  }: {
    eventId?: string
    timestamp?: number
    contentType?: string
  } = {},
) {
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'svix-id': eventId,
      'svix-timestamp': String(timestamp),
      'svix-signature': signature(payload, eventId, timestamp),
    },
    body: payload,
  })
}

function recorder(result: ReminderProviderEventResult = 'recorded') {
  const calls: ReminderProviderEventInput[] = []
  return {
    calls,
    recordEvent(input: ReminderProviderEventInput) {
      calls.push(input)
      return Promise.resolve(result)
    },
  }
}

async function responseJson(response: Response) {
  return await response.json() as { status: string }
}

test('verifies the exact raw body and records only bounded correlation fields', async () => {
  const harness = recorder('suppressed')
  const response = await handleReminderProviderWebhook(
    signedRequest(eventBody()),
    { webhookSecret: WEBHOOK_SECRET, recordEvent: harness.recordEvent },
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await responseJson(response), { status: 'received' })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(harness.calls, [{
    providerName: 'resend',
    eventId: EVENT_ID,
    eventType: 'email.bounced',
    deliveryId: DELIVERY_ID,
    providerMessageId: PROVIDER_MESSAGE_ID,
    eventCreatedAt: harness.calls[0].eventCreatedAt,
  }])
  assert.match(harness.calls[0].eventCreatedAt, /Z$/u)
  assert.doesNotMatch(
    JSON.stringify(harness.calls),
    /private-recipient|private-sender|Private subject|message_id/iu,
  )
})

test('rejects tampering, missing signature headers, and stale signatures before mutation', async () => {
  const harness = recorder()
  const payload = eventBody()
  const validRequest = signedRequest(payload)
  const tampered = new Request(validRequest, {
    body: payload.replace('email.bounced', 'email.complained'),
  })
  const missingHeaders = new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  })
  const stale = signedRequest(payload, {
    timestamp: Math.floor(Date.now() / 1000) - 10 * 60,
  })

  for (const request of [tampered, missingHeaders, stale]) {
    const response = await handleReminderProviderWebhook(request, {
      webhookSecret: WEBHOOK_SECRET,
      recordEvent: harness.recordEvent,
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await responseJson(response), {
      status: 'invalid_webhook',
    })
  }
  assert.deepEqual(harness.calls, [])
})

test('missing or malformed signing configuration fails before reading the body', async () => {
  const harness = recorder()

  for (const webhookSecret of [undefined, '', 'not-a-webhook-secret']) {
    const request = signedRequest(eventBody())
    const response = await handleReminderProviderWebhook(
      request,
      { webhookSecret, recordEvent: harness.recordEvent },
    )
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('retry-after'), '300')
    assert.equal(request.bodyUsed, false)
  }
  assert.deepEqual(harness.calls, [])
})

test('acknowledges unrelated signed events without exposing the recorder', async () => {
  const harness = recorder()
  const unrelatedType = eventBody({ type: 'email.opened' })
  const unrelatedSource = eventBody({
    data: {
      email_id: PROVIDER_MESSAGE_ID,
      tags: { source: 'another-product', delivery_id: DELIVERY_ID },
    },
  })

  for (const payload of [unrelatedType, unrelatedSource]) {
    const response = await handleReminderProviderWebhook(
      signedRequest(payload),
      { webhookSecret: WEBHOOK_SECRET, recordEvent: harness.recordEvent },
    )
    assert.equal(response.status, 200)
    assert.deepEqual(await responseJson(response), { status: 'received' })
  }
  assert.deepEqual(harness.calls, [])
})

test('rejects malformed Edenia events without trusting recipient payload fields', async () => {
  const harness = recorder()
  const malformedEvents = [
    eventBody({ created_at: 'not-a-timestamp' }),
    eventBody({
      data: {
        email_id: '<wrong-message-id@example.test>',
        tags: { source: 'edenia-study-reminder', delivery_id: DELIVERY_ID },
      },
    }),
    eventBody({
      data: {
        email_id: PROVIDER_MESSAGE_ID,
        tags: { source: 'edenia-study-reminder', delivery_id: 'not-a-uuid' },
      },
    }),
  ]

  for (const payload of malformedEvents) {
    const response = await handleReminderProviderWebhook(
      signedRequest(payload),
      { webhookSecret: WEBHOOK_SECRET, recordEvent: harness.recordEvent },
    )
    assert.equal(response.status, 422)
    assert.deepEqual(await responseJson(response), { status: 'invalid_event' })
  }
  assert.deepEqual(harness.calls, [])
})

test('bounds methods, media types, and request bodies before mutation', async () => {
  const harness = recorder()
  const getResponse = await handleReminderProviderWebhook(
    new Request(ENDPOINT),
    { webhookSecret: WEBHOOK_SECRET, recordEvent: harness.recordEvent },
  )
  assert.equal(getResponse.status, 405)
  assert.equal(getResponse.headers.get('allow'), 'POST')

  const mediaResponse = await handleReminderProviderWebhook(
    signedRequest(eventBody(), { contentType: 'text/plain' }),
    { webhookSecret: WEBHOOK_SECRET, recordEvent: harness.recordEvent },
  )
  assert.equal(mediaResponse.status, 415)

  const oversized = 'x'.repeat(64 * 1024 + 1)
  const sizeResponse = await handleReminderProviderWebhook(
    signedRequest(oversized),
    { webhookSecret: WEBHOOK_SECRET, recordEvent: harness.recordEvent },
  )
  assert.equal(sizeResponse.status, 413)
  assert.deepEqual(harness.calls, [])
})

test('maps database idempotency and safety outcomes without leaking internals', async () => {
  for (const [result, expectedStatus, expectedBody] of [
    ['recorded', 200, 'received'],
    ['suppressed', 200, 'received'],
    ['duplicate', 200, 'received'],
    ['unmatched', 409, 'event_rejected'],
    ['invalid', 409, 'event_rejected'],
    ['event_conflict', 409, 'event_rejected'],
  ] as const) {
    const response = await handleReminderProviderWebhook(
      signedRequest(eventBody()),
      {
        webhookSecret: WEBHOOK_SECRET,
        recordEvent: recorder(result).recordEvent,
      },
    )
    assert.equal(response.status, expectedStatus)
    assert.deepEqual(await responseJson(response), { status: expectedBody })
  }
})

test('dependency and logging failures preserve safe retries and redact payload data', async () => {
  const logs: unknown[] = []
  const response = await handleReminderProviderWebhook(
    signedRequest(eventBody()),
    {
      webhookSecret: WEBHOOK_SECRET,
      recordEvent: () => Promise.reject(
        new Error('private-recipient@example.test database detail'),
      ),
      log(entry) {
        logs.push(entry)
        throw new Error('logging failed')
      },
    },
  )

  assert.equal(response.status, 503)
  assert.deepEqual(await responseJson(response), { status: 'unavailable' })
  assert.deepEqual(logs, [{
    component: 'resend_reminder_webhook',
    outcome: 'dependency_unavailable',
    event_type: 'email.bounced',
  }])
  assert.doesNotMatch(
    JSON.stringify(logs),
    /private-recipient|private-sender|Private subject|whsec_|61111111/iu,
  )
})
