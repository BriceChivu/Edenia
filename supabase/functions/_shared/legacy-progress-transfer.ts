const CREATE_ORIGINS = new Set([
  'https://bricechivu.github.io',
  'http://localhost:8002',
])
const CONSUME_ORIGINS = new Set([
  'https://www.edenia.study',
  'http://localhost:8000',
])
const ALLOWED_PREFLIGHT_HEADERS = new Set(['apikey', 'content-type'])
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{8,}$/
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/
const DIGEST_BYTES = 32
const IV_BYTES = 12
const MAXIMUM_CIPHERTEXT_BYTES = 2 * 1024 * 1024 + 16
const MAXIMUM_JSON_BODY_BYTES = 3 * 1024 * 1024
const MAXIMUM_CONTROL_RESPONSE_MINUTES = 20

type RpcError = { message: string }
type RpcResult = PromiseLike<{ data: unknown; error: RpcError | null }>

export type LegacyProgressTransferClient = {
  rpc: (name: string, params?: Record<string, unknown>) => RpcResult
}

type RelayMode = 'create' | 'consume'

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'",
  'Cross-Origin-Resource-Policy': 'same-site',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasExactKeys(value: unknown, expected: readonly string[]) {
  if (!isRecord(value)) return false
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index])
}

function allowedOrigins(mode: RelayMode) {
  return mode === 'create' ? CREATE_ORIGINS : CONSUME_ORIGINS
}

function isAllowedOrigin(request: Request, mode: RelayMode) {
  const origin = request.headers.get('origin')
  return Boolean(origin && allowedOrigins(mode).has(origin))
}

function responseHeaders(request: Request, mode: RelayMode) {
  const headers = new Headers({
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  })
  const origin = request.headers.get('origin')
  if (origin && allowedOrigins(mode).has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
  }
  return headers
}

function jsonResponse(
  request: Request,
  mode: RelayMode,
  body: Record<string, unknown>,
  status = 200,
  options: { allow?: string; retryAfter?: number } = {},
) {
  const headers = responseHeaders(request, mode)
  if (options.allow) headers.set('Allow', options.allow)
  if (options.retryAfter) {
    headers.set('Retry-After', String(options.retryAfter))
  }
  return new Response(JSON.stringify(body), { status, headers })
}

function statusResponse(
  request: Request,
  mode: RelayMode,
  statusValue: string,
  status = 200,
  options: { allow?: string; retryAfter?: number } = {},
) {
  return jsonResponse(request, mode, { status: statusValue }, status, options)
}

function requestedHeaderNames(request: Request) {
  return (request.headers.get('access-control-request-headers') || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
}

function preflightResponse(request: Request, mode: RelayMode) {
  const requestedHeaders = requestedHeaderNames(request)
  if (
    !isAllowedOrigin(request, mode)
    || request.headers.get('access-control-request-method') !== 'POST'
    || requestedHeaders.some(
      header => !ALLOWED_PREFLIGHT_HEADERS.has(header)
    )
  ) {
    return statusResponse(request, mode, 'forbidden_origin', 403)
  }
  const headers = responseHeaders(request, mode)
  headers.set('Access-Control-Allow-Headers', 'apikey, Content-Type')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Max-Age', '600')
  return new Response(null, { status: 204, headers })
}

export function legacyProgressTransferPreflightResponse(
  request: Request,
  mode: RelayMode,
) {
  return preflightResponse(request, mode)
}

async function readBoundedJson(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() || ''
  if (contentType.split(';')[0].trim() !== 'application/json') {
    return { errorStatus: 415, value: null }
  }

  const declaredLength = request.headers.get('content-length')
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      return { errorStatus: 400, value: null }
    }
    if (Number(declaredLength) > MAXIMUM_JSON_BODY_BYTES) {
      return { errorStatus: 413, value: null }
    }
  }

  const reader = request.body?.getReader()
  if (!reader) return { errorStatus: 400, value: null }
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > MAXIMUM_JSON_BODY_BYTES) {
      await reader.cancel()
      return { errorStatus: 413, value: null }
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    const serialized = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { errorStatus: 0, value: JSON.parse(serialized) }
  } catch {
    return { errorStatus: 400, value: null }
  }
}

function encodeBase64Url(bytes: Uint8Array) {
  const chunks: string[] = []
  const chunkSize = 32 * 1024
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    ))
  }
  const binary = chunks.join('')
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

function decodeBase64Url(
  value: unknown,
  { exactBytes, maximumBytes, minimumBytes = 0 }: {
    exactBytes?: number
    maximumBytes?: number
    minimumBytes?: number
  } = {},
) {
  if (
    typeof value !== 'string'
    || !value
    || !BASE64URL_PATTERN.test(value)
    || value.length % 4 === 1
  ) return null
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/')
      + '='.repeat((4 - value.length % 4) % 4)
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    if (encodeBase64Url(bytes) !== value) return null
    if (exactBytes !== undefined && bytes.byteLength !== exactBytes) return null
    if (bytes.byteLength < minimumBytes) return null
    if (maximumBytes !== undefined && bytes.byteLength > maximumBytes) {
      return null
    }
    return bytes
  } catch {
    return null
  }
}

function encodePostgresBytea(bytes: Uint8Array) {
  const hex = '0123456789abcdef'
  const chunks: string[] = []
  const chunkSize = 32 * 1024
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, bytes.byteLength)
    let chunk = ''
    for (let index = offset; index < end; index += 1) {
      const byte = bytes[index]
      chunk += hex[byte >> 4] + hex[byte & 15]
    }
    chunks.push(chunk)
  }
  return `\\x${chunks.join('')}`
}

function decodePostgresBytea(value: unknown, options: {
  exactBytes?: number
  maximumBytes?: number
  minimumBytes?: number
} = {}) {
  if (
    typeof value !== 'string'
    || !value.startsWith('\\x')
    || value.length <= 2
    || (value.length - 2) % 2 !== 0
  ) {
    return null
  }
  const byteLength = (value.length - 2) / 2
  if (options.exactBytes !== undefined && byteLength !== options.exactBytes) {
    return null
  }
  if (byteLength < (options.minimumBytes || 0)) return null
  if (
    options.maximumBytes !== undefined
    && byteLength > options.maximumBytes
  ) return null
  const bytes = new Uint8Array(byteLength)
  const hexNibble = (characterCode: number) => {
    if (characterCode >= 48 && characterCode <= 57) return characterCode - 48
    if (characterCode >= 65 && characterCode <= 70) return characterCode - 55
    if (characterCode >= 97 && characterCode <= 102) return characterCode - 87
    return -1
  }
  for (let index = 0; index < byteLength; index += 1) {
    const pairOffset = 2 + index * 2
    const high = hexNibble(value.charCodeAt(pairOffset))
    const low = hexNibble(value.charCodeAt(pairOffset + 1))
    if (high < 0 || low < 0) return null
    bytes[index] = high * 16 + low
  }
  return bytes
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false
  let difference = 0
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}

async function digestSha256(bytes: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    Uint8Array.from(bytes).buffer,
  ))
}

function firstRpcRow(data: unknown) {
  return Array.isArray(data) && data.length === 1 && isRecord(data[0])
    ? data[0]
    : null
}

function canonicalFutureExpiry(value: unknown, now: Date) {
  if (typeof value !== 'string' || !value) return null
  const parsed = new Date(value)
  const milliseconds = parsed.getTime()
  if (
    !Number.isFinite(milliseconds)
    || milliseconds <= now.getTime()
    || milliseconds > now.getTime()
      + MAXIMUM_CONTROL_RESPONSE_MINUTES * 60_000
  ) return null
  return parsed.toISOString()
}

async function handleCreate(
  request: Request,
  value: unknown,
  client: LegacyProgressTransferClient,
  now: () => Date,
) {
  if (!hasExactKeys(value, [
    'capability_digest',
    'ciphertext',
    'ciphertext_bytes',
    'ciphertext_digest',
    'iv',
  ])) return statusResponse(request, 'create', 'invalid_request', 400)

  const body = value as Record<string, unknown>
  const capabilityDigest = decodeBase64Url(body.capability_digest, {
    exactBytes: DIGEST_BYTES,
  })
  const initializationVector = decodeBase64Url(body.iv, {
    exactBytes: IV_BYTES,
  })
  const ciphertext = decodeBase64Url(body.ciphertext, {
    maximumBytes: MAXIMUM_CIPHERTEXT_BYTES,
    minimumBytes: 17,
  })
  const ciphertextDigest = decodeBase64Url(body.ciphertext_digest, {
    exactBytes: DIGEST_BYTES,
  })
  if (
    !capabilityDigest
    || !initializationVector
    || !ciphertext
    || !ciphertextDigest
    || !Number.isSafeInteger(body.ciphertext_bytes)
    || body.ciphertext_bytes !== ciphertext.byteLength
    || !constantTimeEqual(await digestSha256(ciphertext), ciphertextDigest)
  ) return statusResponse(request, 'create', 'invalid_request', 400)

  const { data, error } = await client.rpc(
    'create_legacy_progress_transfer',
    {
      p_capability_digest: encodePostgresBytea(capabilityDigest),
      p_ciphertext: encodePostgresBytea(ciphertext),
      p_ciphertext_bytes: ciphertext.byteLength,
      p_ciphertext_digest: encodePostgresBytea(ciphertextDigest),
      p_initialization_vector: encodePostgresBytea(initializationVector),
    },
  )
  if (error) return statusResponse(request, 'create', 'unavailable', 503)
  const row = firstRpcRow(data)
  if (
    !row
    || !hasExactKeys(row, ['expires_at', 'status'])
  ) return statusResponse(request, 'create', 'unavailable', 503)
  if (row.status === 'rate_limited') {
    return statusResponse(
      request,
      'create',
      'unavailable',
      429,
      { retryAfter: 60 },
    )
  }
  const expiresAt = canonicalFutureExpiry(row.expires_at, now())
  if (row.status !== 'created' || !expiresAt) {
    return statusResponse(request, 'create', 'unavailable', 503)
  }
  return jsonResponse(request, 'create', {
    expires_at: expiresAt,
    status: 'created',
  })
}

async function handleClaim(
  request: Request,
  capabilityDigest: Uint8Array,
  client: LegacyProgressTransferClient,
  now: () => Date,
) {
  const { data, error } = await client.rpc(
    'claim_legacy_progress_transfer',
    { p_capability_digest: encodePostgresBytea(capabilityDigest) },
  )
  if (error) return statusResponse(request, 'consume', 'unavailable', 503)
  const row = firstRpcRow(data)
  if (!row || !hasExactKeys(row, [
    'ciphertext',
    'ciphertext_bytes',
    'ciphertext_digest',
    'expires_at',
    'initialization_vector',
    'status',
  ])) return statusResponse(request, 'consume', 'unavailable', 503)
  if (row.status === 'rate_limited') {
    return statusResponse(
      request,
      'consume',
      'unavailable',
      429,
      { retryAfter: 60 },
    )
  }
  if (row.status !== 'claimed') {
    return row.status === 'invalid'
      ? statusResponse(request, 'consume', 'invalid', 400)
      : statusResponse(request, 'consume', 'unavailable', 503)
  }

  const initializationVector = decodePostgresBytea(
    row.initialization_vector,
    { exactBytes: IV_BYTES },
  )
  const ciphertext = decodePostgresBytea(row.ciphertext, {
    maximumBytes: MAXIMUM_CIPHERTEXT_BYTES,
    minimumBytes: 17,
  })
  const ciphertextDigest = decodePostgresBytea(row.ciphertext_digest, {
    exactBytes: DIGEST_BYTES,
  })
  const expiresAt = canonicalFutureExpiry(row.expires_at, now())
  if (
    !initializationVector
    || !ciphertext
    || !ciphertextDigest
    || !Number.isSafeInteger(row.ciphertext_bytes)
    || row.ciphertext_bytes !== ciphertext.byteLength
    || !constantTimeEqual(await digestSha256(ciphertext), ciphertextDigest)
    || !expiresAt
  ) return statusResponse(request, 'consume', 'unavailable', 503)

  return jsonResponse(request, 'consume', {
    ciphertext: encodeBase64Url(ciphertext),
    ciphertext_bytes: ciphertext.byteLength,
    ciphertext_digest: encodeBase64Url(ciphertextDigest),
    expires_at: expiresAt,
    iv: encodeBase64Url(initializationVector),
    status: 'claimed',
  })
}

async function handleComplete(
  request: Request,
  capabilityDigest: Uint8Array,
  client: LegacyProgressTransferClient,
) {
  const { data, error } = await client.rpc(
    'complete_legacy_progress_transfer',
    { p_capability_digest: encodePostgresBytea(capabilityDigest) },
  )
  if (error) return statusResponse(request, 'consume', 'unavailable', 503)
  if (data === 'rate_limited') {
    return statusResponse(
      request,
      'consume',
      'unavailable',
      429,
      { retryAfter: 60 },
    )
  }
  if (data !== 'completed' && data !== 'already_completed') {
    return data === 'invalid'
      ? statusResponse(request, 'consume', 'invalid', 400)
      : statusResponse(request, 'consume', 'unavailable', 503)
  }
  return statusResponse(request, 'consume', data)
}

async function handleConsume(
  request: Request,
  value: unknown,
  client: LegacyProgressTransferClient,
  now: () => Date,
) {
  if (!hasExactKeys(value, ['action', 'capability_digest'])) {
    return statusResponse(request, 'consume', 'invalid_request', 400)
  }
  const body = value as Record<string, unknown>
  const capabilityDigest = decodeBase64Url(body.capability_digest, {
    exactBytes: DIGEST_BYTES,
  })
  if (!capabilityDigest) {
    return statusResponse(request, 'consume', 'invalid_request', 400)
  }
  if (body.action === 'claim') {
    return handleClaim(request, capabilityDigest, client, now)
  }
  if (body.action === 'complete') {
    return handleComplete(request, capabilityDigest, client)
  }
  return statusResponse(request, 'consume', 'invalid_request', 400)
}

export async function handleLegacyProgressTransferRequest(
  request: Request,
  mode: RelayMode,
  client: LegacyProgressTransferClient,
  options: { now?: () => Date } = {},
) {
  if (request.method === 'OPTIONS') return preflightResponse(request, mode)
  if (!isAllowedOrigin(request, mode)) {
    return statusResponse(request, mode, 'forbidden_origin', 403)
  }
  if (request.method !== 'POST') {
    return statusResponse(
      request,
      mode,
      'method_not_allowed',
      405,
      { allow: 'POST, OPTIONS' },
    )
  }
  if (
    request.headers.has('authorization')
    || !PUBLISHABLE_KEY_PATTERN.test(request.headers.get('apikey') || '')
  ) return statusResponse(request, mode, 'invalid_request', 400)

  const body = await readBoundedJson(request)
  if (body.errorStatus) {
    return statusResponse(
      request,
      mode,
      'invalid_request',
      body.errorStatus,
    )
  }
  try {
    const now = options.now || (() => new Date())
    return mode === 'create'
      ? await handleCreate(request, body.value, client, now)
      : await handleConsume(request, body.value, client, now)
  } catch {
    return statusResponse(request, mode, 'unavailable', 503)
  }
}

export function legacyProgressTransferUnavailableResponse(
  request: Request,
  mode: RelayMode,
) {
  return statusResponse(request, mode, 'unavailable', 503)
}
