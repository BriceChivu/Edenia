export class BillingRequestError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'BillingRequestError'
    this.status = status
    this.code = code
  }
}

export function getBearerToken(header: string | null) {
  const match = header?.match(/^Bearer\s+(\S+)$/i)
  return match?.[1] || null
}

export async function readJsonObject(
  request: Request,
  maximumBytes = 4_096,
) {
  if (request.method !== 'POST') {
    throw new BillingRequestError('Method not allowed', 405, 'method_not_allowed')
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() || ''
  if (contentType.split(';')[0].trim() !== 'application/json') {
    throw new BillingRequestError(
      'Content-Type must be application/json',
      415,
      'unsupported_media_type',
    )
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new BillingRequestError(
      'Request body is too large',
      413,
      'request_too_large',
    )
  }

  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > maximumBytes) {
    throw new BillingRequestError(
      'Request body is too large',
      413,
      'request_too_large',
    )
  }

  let value: unknown
  try {
    value = JSON.parse(rawBody)
  } catch {
    throw new BillingRequestError('Malformed JSON body', 400, 'invalid_json')
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BillingRequestError(
      'JSON body must be an object',
      400,
      'invalid_request',
    )
  }
  return value as Record<string, unknown>
}

export function assertOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: string[],
) {
  const unexpectedKey = Object.keys(value).find(key => !allowedKeys.includes(key))
  if (unexpectedKey) {
    throw new BillingRequestError(
      `Unexpected request field: ${unexpectedKey}`,
      400,
      'invalid_request',
    )
  }
}

export function getClientAddress(headers: Headers) {
  const connectingIp = headers.get('cf-connecting-ip')?.trim()
  if (connectingIp) return connectingIp

  const forwardedIp = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedIp || 'unknown'
}

export function isCheckoutSessionId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 255
    && /^cs_(?:test|live)_[A-Za-z0-9]+$/.test(value)
}
