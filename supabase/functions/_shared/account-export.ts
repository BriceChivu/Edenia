const ALLOWED_BROWSER_ORIGINS = new Set([
  'https://www.edenia.study',
  'http://localhost:8000',
])
const ALLOWED_PREFLIGHT_HEADERS = new Set([
  'authorization',
  'apikey',
  'content-type',
  'x-client-info',
])
const MAXIMUM_REQUEST_BYTES = 512
const MAXIMUM_EXPORT_BYTES = 8 * 1024 * 1024
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ExportUser = { id: string }
type RateLimit = { allowed: boolean; retryAfterSeconds: number }

export type AccountExportDependencies = {
  authenticate: (request: Request) => Promise<ExportUser | null>
  consumeRateLimit: (userId: string) => Promise<RateLimit>
  loadExport: (userId: string) => Promise<unknown>
  now?: () => Date
}

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'",
  'Cross-Origin-Resource-Policy': 'same-site',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isAllowedOrigin(origin: string | null) {
  return Boolean(origin && ALLOWED_BROWSER_ORIGINS.has(origin))
}

function responseHeaders(request: Request) {
  const headers = new Headers({
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  })
  const origin = request.headers.get('origin')
  if (isAllowedOrigin(origin)) {
    headers.set('Access-Control-Allow-Origin', origin!)
    headers.set(
      'Access-Control-Expose-Headers',
      'Content-Disposition, Retry-After',
    )
  }
  return headers
}

function errorResponse(
  request: Request,
  code: string,
  status: number,
  options: { allow?: string; retryAfterSeconds?: number } = {},
) {
  const headers = responseHeaders(request)
  if (options.allow) headers.set('Allow', options.allow)
  if (options.retryAfterSeconds) {
    headers.set('Retry-After', String(options.retryAfterSeconds))
  }
  return new Response(JSON.stringify({
    error: 'Unable to export account data',
    code,
  }), { status, headers })
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
    !isAllowedOrigin(origin)
    || requestedMethod !== 'POST'
    || requestedHeaders.some(header => !ALLOWED_PREFLIGHT_HEADERS.has(header))
  ) {
    return errorResponse(request, 'forbidden_origin', 403)
  }

  const headers = responseHeaders(request)
  headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Apikey, Content-Type, X-Client-Info',
  )
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Max-Age', '600')
  return new Response(null, { status: 204, headers })
}

async function hasExactEmptyJsonObject(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() || ''
  if (contentType.split(';')[0].trim() !== 'application/json') {
    return { valid: false, status: 415 }
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_REQUEST_BYTES) {
    return { valid: false, status: 413 }
  }

  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > MAXIMUM_REQUEST_BYTES) {
    return { valid: false, status: 413 }
  }

  try {
    const parsed = JSON.parse(rawBody)
    return {
      valid: isRecord(parsed) && Object.keys(parsed).length === 0,
      status: 400,
    }
  } catch {
    return { valid: false, status: 400 }
  }
}

function isValidExport(value: unknown, userId: string) {
  if (!isRecord(value) || value.schema_version !== 'edenia-account-export-v1') {
    return false
  }
  const account = value.account
  const scope = value.scope
  return isRecord(account)
    && account.id === userId
    && isRecord(scope)
    && scope.server_data === true
    && scope.current_device_progress === false
}

export async function handleAccountExportRequest(
  request: Request,
  dependencies: AccountExportDependencies,
) {
  if (request.method === 'OPTIONS') return preflightResponse(request)

  if (!isAllowedOrigin(request.headers.get('origin'))) {
    return errorResponse(request, 'forbidden_origin', 403)
  }
  if (request.method !== 'POST') {
    return errorResponse(request, 'method_not_allowed', 405, {
      allow: 'POST, OPTIONS',
    })
  }

  const body = await hasExactEmptyJsonObject(request)
  if (!body.valid) {
    return errorResponse(request, 'invalid_request', body.status)
  }

  try {
    const user = await dependencies.authenticate(request)
    if (!user || !USER_ID_PATTERN.test(user.id)) {
      return errorResponse(request, 'authentication_required', 401)
    }

    const rateLimit = await dependencies.consumeRateLimit(user.id)
    if (!rateLimit.allowed) {
      return errorResponse(request, 'rate_limited', 429, {
        retryAfterSeconds: Math.max(1, rateLimit.retryAfterSeconds || 1),
      })
    }

    const exportedData = await dependencies.loadExport(user.id)
    if (!isValidExport(exportedData, user.id)) {
      return errorResponse(request, 'export_unavailable', 503)
    }

    const serialized = JSON.stringify(exportedData)
    if (new TextEncoder().encode(serialized).byteLength > MAXIMUM_EXPORT_BYTES) {
      return errorResponse(request, 'export_too_large', 413)
    }

    const now = dependencies.now?.() || new Date()
    const date = Number.isFinite(now.getTime())
      ? now.toISOString().slice(0, 10)
      : 'account'
    const headers = responseHeaders(request)
    headers.set(
      'Content-Disposition',
      `attachment; filename="edenia-account-data-${date}.json"`,
    )
    return new Response(serialized, { status: 200, headers })
  } catch {
    return errorResponse(request, 'export_unavailable', 503)
  }
}
