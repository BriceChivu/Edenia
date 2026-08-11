import { normalizeCheckoutEmail } from './checkout-identity.ts'
import { validateReminderUnsubscribeApiUrl } from './reminder-email.ts'

const RESEND_SEND_URL = 'https://api.resend.com/emails'
const API_KEY_PATTERN = /^re_[A-Za-z0-9_-]{8,253}$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const PROVIDER_MESSAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const MAX_PROVIDER_BODY_BYTES = 16 * 1024
const DEFAULT_TIMEOUT_MS = 10_000

type ResendFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type ResendReminderSendInput = Readonly<{
  apiKey: string
  from: string
  to: string
  deliveryId: string
  subject: string
  text: string
  html: string
  unsubscribeApiUrl: string
}>

export type ResendReminderConfiguration = Readonly<{
  apiKey: string
  from: string
}>

export type ResendReminderSendResult =
  | Readonly<{
    status: 'accepted'
    providerMessageId: string
  }>
  | Readonly<{
    status: 'deferred'
    reason:
      | 'concurrent_request'
      | 'invalid_provider_response'
      | 'network_error'
      | 'provider_unavailable'
      | 'rate_limited'
      | 'request_timeout'
    retryAfterSeconds?: number
  }>
  | Readonly<{
    status: 'blocked'
    reason:
      | 'authentication_or_domain'
      | 'configuration'
      | 'idempotency_conflict'
      | 'provider_rejected'
      | 'request_invalid'
      | 'security_rejection'
  }>

type ResendReminderSendOptions = Readonly<{
  fetcher?: ResendFetch
  timeoutMs?: number
}>

function requireApiKey(value: unknown) {
  if (typeof value !== 'string' || !API_KEY_PATTERN.test(value)) {
    throw new TypeError('Resend API key is invalid')
  }
  return value
}

function requireFromAddress(value: unknown) {
  if (
    typeof value !== 'string'
    || value.length > 320
    || value.trim() !== value
    || /[\r\n]/u.test(value)
  ) {
    throw new TypeError('Resend From address is invalid')
  }

  const namedAddress = value.match(/^([^<>]{1,100}) <([^<>]+)>$/u)
  const address = namedAddress ? namedAddress[2] : value
  if (!normalizeCheckoutEmail(address)) {
    throw new TypeError('Resend From address is invalid')
  }
  return value
}

function requireSubject(value: unknown) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 500
    || /[\r\n]/u.test(value)
  ) {
    throw new TypeError('Reminder email subject is invalid')
  }
  return value
}

function requireContent(value: unknown, label: string, maxLength: number) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > maxLength
  ) {
    throw new TypeError(`Reminder email ${label} is invalid`)
  }
  return value
}

function requireTimeout(value: unknown) {
  if (
    !Number.isSafeInteger(value)
    || Number(value) < 100
    || Number(value) > 30_000
  ) {
    throw new TypeError('Resend request timeout is invalid')
  }
  return Number(value)
}

function readRetryAfterSeconds(response: Response) {
  const value = response.headers.get('retry-after')
  if (!value || !/^\d{1,5}$/u.test(value)) return undefined
  const seconds = Number(value)
  return seconds >= 1 && seconds <= 86_400 ? seconds : undefined
}

async function readBoundedJson(response: Response) {
  const contentLength = response.headers.get('content-length')
  if (
    contentLength
    && /^\d+$/u.test(contentLength)
    && Number(contentLength) > MAX_PROVIDER_BODY_BYTES
  ) {
    return null
  }

  let body: string
  try {
    body = await response.text()
  } catch {
    return null
  }
  if (new TextEncoder().encode(body).byteLength > MAX_PROVIDER_BODY_BYTES) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(body)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function getProviderErrorName(body: Record<string, unknown> | null) {
  const name = body?.name
  return typeof name === 'string' && name.length <= 100 ? name : null
}

function deferred(
  reason: Extract<ResendReminderSendResult, { status: 'deferred' }>['reason'],
  retryAfterSeconds?: number,
): ResendReminderSendResult {
  return Object.freeze({
    status: 'deferred' as const,
    reason,
    ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
  })
}

function blocked(
  reason: Extract<ResendReminderSendResult, { status: 'blocked' }>['reason'],
): ResendReminderSendResult {
  return Object.freeze({ status: 'blocked' as const, reason })
}

export function createResendReminderIdempotencyKey(deliveryId: string) {
  if (!UUID_PATTERN.test(deliveryId)) {
    throw new TypeError('Reminder delivery ID is invalid')
  }
  return `edenia-study-reminder-v1/${deliveryId.toLowerCase()}`
}

export function validateResendReminderConfiguration({
  apiKey,
  from,
}: ResendReminderConfiguration) {
  return Object.freeze({
    apiKey: requireApiKey(apiKey),
    from: requireFromAddress(from),
  })
}

export async function sendReminderWithResend(
  input: ResendReminderSendInput,
  options: ResendReminderSendOptions = {},
): Promise<ResendReminderSendResult> {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Resend reminder input is invalid')
  }
  const { apiKey, from } = validateResendReminderConfiguration(input)
  const to = normalizeCheckoutEmail(input.to)
  if (!to) throw new TypeError('Reminder recipient is invalid')
  const subject = requireSubject(input.subject)
  const text = requireContent(input.text, 'text', 100_000)
  const html = requireContent(input.html, 'HTML', 500_000)
  const unsubscribeApiUrl = validateReminderUnsubscribeApiUrl(
    input.unsubscribeApiUrl,
  )
  const idempotencyKey = createResendReminderIdempotencyKey(input.deliveryId)
  const timeoutMs = requireTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const fetcher = options.fetcher ?? fetch
  if (typeof fetcher !== 'function') {
    throw new TypeError('Resend fetch dependency is invalid')
  }

  const payload = JSON.stringify({
    from,
    to: [to],
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeApiUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  let body: Record<string, unknown> | null
  try {
    response = await fetcher(RESEND_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'User-Agent': 'Edenia-reminders/1.0',
      },
      body: payload,
      signal: controller.signal,
    })
    body = await readBoundedJson(response)
    if (controller.signal.aborted) return deferred('request_timeout')
  } catch {
    return deferred(controller.signal.aborted ? 'request_timeout' : 'network_error')
  } finally {
    clearTimeout(timeout)
  }

  const errorName = getProviderErrorName(body)

  if (response.ok) {
    const messageId = body?.id
    if (
      typeof messageId !== 'string'
      || !PROVIDER_MESSAGE_ID_PATTERN.test(messageId)
    ) {
      return deferred('invalid_provider_response')
    }
    return Object.freeze({
      status: 'accepted' as const,
      providerMessageId: messageId,
    })
  }

  if (response.status === 409) {
    if (errorName === 'concurrent_idempotent_requests') {
      return deferred('concurrent_request')
    }
    if (errorName === 'invalid_idempotent_request') {
      return blocked('idempotency_conflict')
    }
    return blocked('provider_rejected')
  }
  if (response.status === 429) {
    return deferred('rate_limited', readRetryAfterSeconds(response))
  }
  if (response.status >= 500) return deferred('provider_unavailable')
  if (response.status === 400 || response.status === 422) {
    return blocked('request_invalid')
  }
  if (response.status === 401 || response.status === 403) {
    return blocked('authentication_or_domain')
  }
  if (response.status === 404 || response.status === 405) {
    return blocked('configuration')
  }
  if (response.status === 451) return blocked('security_rejection')
  return blocked('provider_rejected')
}
