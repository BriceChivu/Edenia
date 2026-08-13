import {
  digestReminderUnsubscribeToken,
  encodeReminderDigestForPostgres,
  normalizeReminderLocale,
} from './reminder-email.ts'

const ALLOWED_BROWSER_ORIGINS = new Set([
  'https://www.edenia.study',
  'http://localhost:8000',
])
const MAXIMUM_BODY_BYTES = 512
const REMINDER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

type RpcError = { message: string }
type RpcResult = PromiseLike<{ data: unknown; error: RpcError | null }>

export type ReminderUnsubscribeClient = {
  rpc: (name: string, params?: Record<string, unknown>) => RpcResult
}

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'",
  'Cross-Origin-Resource-Policy': 'same-site',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
})

function isAllowedBrowserOrigin(origin: string | null) {
  return Boolean(origin && ALLOWED_BROWSER_ORIGINS.has(origin))
}

function responseHeaders(request: Request) {
  const headers = new Headers({
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  })
  const origin = request.headers.get('origin')
  if (isAllowedBrowserOrigin(origin)) {
    headers.set('Access-Control-Allow-Origin', origin!)
  }
  return headers
}

function jsonResponse(
  request: Request,
  statusValue: string,
  status = 200,
  allow?: string,
) {
  const headers = responseHeaders(request)
  if (allow) headers.set('Allow', allow)
  return new Response(JSON.stringify({ status: statusValue }), {
    status,
    headers,
  })
}

function readToken(value: string | null) {
  return value && REMINDER_TOKEN_PATTERN.test(value) ? value : null
}

function hasExactParameters(
  params: URLSearchParams,
  names: readonly string[],
) {
  const keys = [...params.keys()]
  return keys.length === names.length
    && names.every(name => params.getAll(name).length === 1)
    && keys.every(name => names.includes(name))
}

function readRequestedHeaderNames(request: Request) {
  return (request.headers.get('access-control-request-headers') || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
}

function preflightResponse(request: Request) {
  const origin = request.headers.get('origin')
  const requestedMethod = request.headers.get('access-control-request-method')
  const requestedHeaders = readRequestedHeaderNames(request)
  if (
    !isAllowedBrowserOrigin(origin)
    || requestedMethod !== 'POST'
    || requestedHeaders.some(header => header !== 'content-type')
  ) {
    return jsonResponse(request, 'forbidden_origin', 403)
  }

  const headers = responseHeaders(request)
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Max-Age', '600')
  return new Response(null, { status: 204, headers })
}

async function readBoundedForm(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() || ''
  if (contentType.split(';')[0].trim() !== 'application/x-www-form-urlencoded') {
    return { form: null, status: 415 }
  }
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_BODY_BYTES) {
    return { form: null, status: 413 }
  }
  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > MAXIMUM_BODY_BYTES) {
    return { form: null, status: 413 }
  }
  return { form: new URLSearchParams(rawBody), status: 200 }
}

async function consumeToken(
  request: Request,
  token: string,
  client: ReminderUnsubscribeClient,
) {
  const digest = await digestReminderUnsubscribeToken(token)
  const { data, error } = await client.rpc(
    'consume_reminder_unsubscribe_token',
    { p_token_digest: encodeReminderDigestForPostgres(digest) },
  )

  if (error || !['unsubscribed', 'already_unsubscribed', 'invalid'].includes(String(data))) {
    return jsonResponse(request, 'unavailable', 503)
  }
  if (data === 'invalid') {
    return jsonResponse(request, 'invalid', 400)
  }
  return jsonResponse(request, String(data))
}

export async function handleReminderUnsubscribeRequest(
  request: Request,
  client: ReminderUnsubscribeClient,
) {
  const origin = request.headers.get('origin')
  if (origin && !isAllowedBrowserOrigin(origin)) {
    return jsonResponse(request, 'forbidden_origin', 403)
  }
  if (request.method === 'OPTIONS') {
    return preflightResponse(request)
  }
  if (request.method !== 'POST') {
    return jsonResponse(
      request,
      'method_not_allowed',
      405,
      'POST, OPTIONS',
    )
  }

  const formResult = await readBoundedForm(request)
  if (!formResult.form) {
    return jsonResponse(request, 'invalid_request', formResult.status)
  }
  const form = formResult.form
  const url = new URL(request.url)
  const queryLocale = normalizeReminderLocale(url.searchParams.get('lang'))

  const isOneClick = hasExactParameters(form, ['List-Unsubscribe'])
    && form.get('List-Unsubscribe') === 'One-Click'
  if (isOneClick) {
    if (
      !hasExactParameters(url.searchParams, ['token', 'lang'])
      || url.searchParams.get('lang') !== queryLocale
    ) {
      return jsonResponse(request, 'invalid', 400)
    }
    const token = readToken(url.searchParams.get('token'))
    return token
      ? consumeToken(request, token, client)
      : jsonResponse(request, 'invalid', 400)
  }

  if (url.search || !hasExactParameters(form, ['token', 'lang'])) {
    return jsonResponse(request, 'invalid', 400)
  }
  const formLocale = normalizeReminderLocale(form.get('lang'))
  const token = readToken(form.get('token'))
  if (!token || form.get('lang') !== formLocale) {
    return jsonResponse(request, 'invalid', 400)
  }
  return consumeToken(request, token, client)
}

export function reminderUnsubscribeUnavailableResponse(request: Request) {
  return jsonResponse(request, 'unavailable', 503)
}
