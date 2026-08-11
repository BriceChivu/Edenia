import { Webhook } from 'svix'

import {
  isReminderProviderEventType,
  REMINDER_PROVIDER_NAME,
  RESEND_REMINDER_SOURCE_TAG,
} from './reminder-provider-contract.ts'
import type {
  ReminderProviderEventType,
} from './reminder-provider-contract.ts'

const MAX_WEBHOOK_BODY_BYTES = 64 * 1024
const MAX_SIGNATURE_HEADER_BYTES = 4 * 1024
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/u
const DELIVERY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const PROVIDER_MESSAGE_ID_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const TIMESTAMP_WITH_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u

export type ReminderProviderEventInput = Readonly<{
  providerName: typeof REMINDER_PROVIDER_NAME
  eventId: string
  eventType: ReminderProviderEventType
  deliveryId: string
  providerMessageId: string
  eventCreatedAt: string
}>

export type ReminderProviderEventResult =
  | 'recorded'
  | 'suppressed'
  | 'duplicate'
  | 'unmatched'
  | 'invalid'
  | 'event_conflict'

export type ReminderProviderEventRecorder = (
  input: ReminderProviderEventInput,
) => Promise<ReminderProviderEventResult>

type ReminderWebhookLog = Readonly<{
  component: 'resend_reminder_webhook'
  outcome: string
  event_type?: ReminderProviderEventType
}>

export type ReminderProviderWebhookDependencies = Readonly<{
  webhookSecret?: string
  recordEvent: ReminderProviderEventRecorder
  log?: (entry: ReminderWebhookLog) => void
}>

type ParsedReminderEvent =
  | Readonly<{ status: 'ignored'; eventType?: ReminderProviderEventType }>
  | Readonly<{ status: 'invalid'; eventType?: ReminderProviderEventType }>
  | Readonly<{
    status: 'ready'
    eventType: ReminderProviderEventType
    input: ReminderProviderEventInput
  }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  })
}

export function reminderProviderWebhookUnavailableResponse() {
  return jsonResponse(503, { status: 'unavailable' }, {
    'Retry-After': '300',
  })
}

function safeLog(
  log: ReminderProviderWebhookDependencies['log'],
  outcome: string,
  eventType?: ReminderProviderEventType,
) {
  try {
    log?.(Object.freeze({
      component: 'resend_reminder_webhook' as const,
      outcome,
      ...(eventType ? { event_type: eventType } : {}),
    }))
  } catch {
    // Logging must never change provider acknowledgement or retry behavior.
  }
}

function createVerifier(secret: unknown) {
  if (
    typeof secret !== 'string'
    || secret.length < 24
    || secret.length > 512
    || secret.trim() !== secret
    || !secret.startsWith('whsec_')
    || /[^\x21-\x7e]/u.test(secret)
  ) {
    return null
  }
  try {
    return new Webhook(secret)
  } catch {
    return null
  }
}

function readSignatureHeaders(request: Request) {
  const id = request.headers.get('svix-id')
  const timestamp = request.headers.get('svix-timestamp')
  const signature = request.headers.get('svix-signature')
  if (
    !id
    || !timestamp
    || !signature
    || id.length > 200
    || timestamp.length > 32
    || signature.length > MAX_SIGNATURE_HEADER_BYTES
  ) {
    return null
  }
  return Object.freeze({
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': signature,
  })
}

async function readBoundedRawBody(request: Request) {
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    if (!/^\d{1,9}$/u.test(contentLength)) {
      return { status: 'invalid' as const }
    }
    if (Number(contentLength) > MAX_WEBHOOK_BODY_BYTES) {
      return { status: 'too_large' as const }
    }
  }

  if (!request.body) return { status: 'ok' as const, body: '' }
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let byteLength = 0
  let body = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteLength += value.byteLength
      if (byteLength > MAX_WEBHOOK_BODY_BYTES) {
        await reader.cancel()
        return { status: 'too_large' as const }
      }
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
    return { status: 'ok' as const, body }
  } catch {
    return { status: 'invalid' as const }
  } finally {
    reader.releaseLock()
  }
}

function normalizeEventTimestamp(value: unknown) {
  if (
    typeof value !== 'string'
    || value.length > 64
    || !TIMESTAMP_WITH_ZONE_PATTERN.test(value)
  ) {
    return null
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function parseReminderProviderEvent(
  value: unknown,
  eventId: string,
): ParsedReminderEvent {
  if (!isRecord(value)) return Object.freeze({ status: 'invalid' })

  const rawType = value.type
  if (typeof rawType !== 'string' || rawType.length > 100) {
    return Object.freeze({ status: 'invalid' })
  }
  if (!isReminderProviderEventType(rawType)) {
    return Object.freeze({ status: 'ignored' })
  }
  const eventType = rawType
  const data = value.data
  if (!isRecord(data)) {
    return Object.freeze({ status: 'invalid', eventType })
  }
  const tags = data.tags
  if (!isRecord(tags) || tags.source !== RESEND_REMINDER_SOURCE_TAG) {
    return Object.freeze({ status: 'ignored', eventType })
  }

  const deliveryId = tags.delivery_id
  const providerMessageId = data.email_id
  const eventCreatedAt = normalizeEventTimestamp(value.created_at)
  if (
    !EVENT_ID_PATTERN.test(eventId)
    || typeof deliveryId !== 'string'
    || !DELIVERY_ID_PATTERN.test(deliveryId)
    || typeof providerMessageId !== 'string'
    || !PROVIDER_MESSAGE_ID_PATTERN.test(providerMessageId)
    || !eventCreatedAt
  ) {
    return Object.freeze({ status: 'invalid', eventType })
  }

  return Object.freeze({
    status: 'ready',
    eventType,
    input: Object.freeze({
      providerName: REMINDER_PROVIDER_NAME,
      eventId,
      eventType,
      deliveryId: deliveryId.toLowerCase(),
      providerMessageId,
      eventCreatedAt,
    }),
  })
}

export async function handleReminderProviderWebhook(
  request: Request,
  dependencies: ReminderProviderWebhookDependencies,
) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { status: 'method_not_allowed' }, {
      Allow: 'POST',
    })
  }
  if (!dependencies || typeof dependencies.recordEvent !== 'function') {
    return reminderProviderWebhookUnavailableResponse()
  }

  const verifier = createVerifier(dependencies.webhookSecret)
  if (!verifier) {
    safeLog(dependencies.log, 'configuration_unavailable')
    return reminderProviderWebhookUnavailableResponse()
  }
  const signatureHeaders = readSignatureHeaders(request)
  if (!signatureHeaders) {
    return jsonResponse(400, { status: 'invalid_webhook' })
  }
  const mediaType = request.headers.get('content-type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase()
  if (mediaType !== 'application/json') {
    return jsonResponse(415, { status: 'unsupported_media_type' })
  }

  const rawBody = await readBoundedRawBody(request)
  if (rawBody.status === 'too_large') {
    return jsonResponse(413, { status: 'payload_too_large' })
  }
  if (rawBody.status !== 'ok') {
    return jsonResponse(400, { status: 'invalid_webhook' })
  }

  let verifiedPayload: unknown
  try {
    verifiedPayload = verifier.verify(rawBody.body, signatureHeaders)
  } catch {
    return jsonResponse(400, { status: 'invalid_webhook' })
  }

  const parsed = parseReminderProviderEvent(
    verifiedPayload,
    signatureHeaders['svix-id'],
  )
  if (parsed.status === 'ignored') {
    safeLog(dependencies.log, 'ignored', parsed.eventType)
    return jsonResponse(200, { status: 'received' })
  }
  if (parsed.status === 'invalid') {
    safeLog(dependencies.log, 'invalid_event', parsed.eventType)
    return jsonResponse(422, { status: 'invalid_event' })
  }

  let result: ReminderProviderEventResult
  try {
    result = await dependencies.recordEvent(parsed.input)
  } catch {
    safeLog(dependencies.log, 'dependency_unavailable', parsed.eventType)
    return reminderProviderWebhookUnavailableResponse()
  }

  if (result === 'recorded' || result === 'suppressed' || result === 'duplicate') {
    safeLog(dependencies.log, result, parsed.eventType)
    return jsonResponse(200, { status: 'received' })
  }
  if (result === 'unmatched' || result === 'invalid' || result === 'event_conflict') {
    safeLog(dependencies.log, 'event_rejected', parsed.eventType)
    return jsonResponse(409, { status: 'event_rejected' })
  }

  safeLog(dependencies.log, 'dependency_unavailable', parsed.eventType)
  return reminderProviderWebhookUnavailableResponse()
}
