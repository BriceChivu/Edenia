import {
  decodeBase64Url,
  LEGACY_PROGRESS_TRANSFER_MAX_BYTES,
  sha256Base64Url
} from '../state/portable-state.js'

export const LEGACY_PROGRESS_CONSUME_FUNCTION_PATH =
  '/functions/v1/consume-legacy-progress-transfer'

const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{8,}$/
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/
const MAXIMUM_CIPHERTEXT_BYTES = LEGACY_PROGRESS_TRANSFER_MAX_BYTES + 16
const MAXIMUM_EXPIRY_MINUTES = 20

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
}

function normalizeProjectUrl(value, { localTest }) {
  let url
  try {
    url = new URL(String(value || '').trim())
  } catch {
    return null
  }
  const hosted = url.protocol === 'https:'
    && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)
  const local = localTest && url.origin === 'http://localhost:8000'
  if (
    (!hosted && !local)
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) return null
  return url
}

export function deriveLegacyProgressRelayRuntime({
  isLegacyMigrationTest = false,
  locationLike,
  supabasePublishableKey,
  supabaseUrl
}) {
  let locationUrl
  try {
    locationUrl = new URL(locationLike?.href)
  } catch {
    return Object.freeze({ destinationEligible: false, valid: false })
  }
  const production = locationUrl.href === 'https://www.edenia.study/'
  const localTest = isLegacyMigrationTest === true
    && locationUrl.href ===
      'http://localhost:8000/?legacy_migration_test=1'
  const destinationEligible = production || localTest
  const projectUrl = normalizeProjectUrl(supabaseUrl, { localTest })
  if (
    !destinationEligible
    || !projectUrl
    || !PUBLISHABLE_KEY_PATTERN.test(supabasePublishableKey || '')
  ) return Object.freeze({ destinationEligible, valid: false })

  return Object.freeze({
    consumeTransferUrl: new URL(
      LEGACY_PROGRESS_CONSUME_FUNCTION_PATH,
      projectUrl.origin
    ).href,
    destinationEligible: true,
    localTest,
    supabasePublishableKey,
    valid: true
  })
}

export async function deriveLegacyProgressCapabilityDigest(
  capability,
  cryptoLike = globalThis.crypto
) {
  if (!CAPABILITY_PATTERN.test(capability || '')) {
    throw new TypeError('Legacy progress capability is invalid')
  }
  const capabilityBytes = decodeBase64Url(capability)
  if (capabilityBytes.byteLength !== 32) {
    throw new TypeError('Legacy progress capability is invalid')
  }
  return sha256Base64Url(capabilityBytes, cryptoLike)
}

function canonicalFutureExpiry(value, now) {
  if (typeof value !== 'string' || !value) return false
  const parsed = new Date(value)
  const milliseconds = parsed.getTime()
  return Number.isFinite(milliseconds)
    && parsed.toISOString() === value
    && milliseconds > now
    && milliseconds <= now + MAXIMUM_EXPIRY_MINUTES * 60_000
}

async function parseClaimResponse(value, now, cryptoLike) {
  if (!hasExactKeys(value, [
    'ciphertext',
    'ciphertext_bytes',
    'ciphertext_digest',
    'expires_at',
    'iv',
    'status'
  ]) || value.status !== 'claimed') return null
  let ciphertextBytes
  let ciphertextDigestBytes
  let ivBytes
  try {
    ciphertextBytes = decodeBase64Url(value.ciphertext)
    ciphertextDigestBytes = decodeBase64Url(value.ciphertext_digest)
    ivBytes = decodeBase64Url(value.iv)
  } catch {
    return null
  }
  if (
    !Number.isSafeInteger(value.ciphertext_bytes)
    || value.ciphertext_bytes !== ciphertextBytes.byteLength
    || ciphertextBytes.byteLength < 17
    || ciphertextBytes.byteLength > MAXIMUM_CIPHERTEXT_BYTES
    || ciphertextDigestBytes.byteLength !== 32
    || ivBytes.byteLength !== 12
    || !canonicalFutureExpiry(value.expires_at, now)
    || await sha256Base64Url(ciphertextBytes, cryptoLike)
      !== value.ciphertext_digest
  ) return null
  return Object.freeze({
    ciphertext: value.ciphertext,
    ciphertextDigest: value.ciphertext_digest,
    expiresAt: value.expires_at,
    iv: value.iv
  })
}

export function createLegacyProgressRelayClient({
  AbortControllerImpl = globalThis.AbortController,
  clearTimeoutImpl = globalThis.clearTimeout,
  cryptoLike = globalThis.crypto,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  runtime,
  setTimeoutImpl = globalThis.setTimeout,
  timeoutMs = 12_000
}) {
  if (!runtime?.valid || typeof fetchImpl !== 'function') {
    throw new TypeError('Legacy progress relay runtime is invalid')
  }

  async function request(action, capabilityDigest) {
    const controller = new AbortControllerImpl()
    const timeoutId = setTimeoutImpl(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(runtime.consumeTransferUrl, {
        method: 'POST',
        headers: {
          apikey: runtime.supabasePublishableKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          capability_digest: capabilityDigest
        }),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: controller.signal
      })
      if (
        !response.ok
        || !response.headers.get('content-type')
          ?.startsWith('application/json')
      ) throw new Error('Legacy progress relay is unavailable')
      return await response.json()
    } catch {
      throw new Error('Legacy progress relay is unavailable')
    } finally {
      clearTimeoutImpl(timeoutId)
    }
  }

  return Object.freeze({
    async claim(capabilityDigest) {
      const value = await request('claim', capabilityDigest)
      const result = await parseClaimResponse(value, now(), cryptoLike)
      if (!result) throw new Error('Legacy progress relay is unavailable')
      return result
    },
    async complete(capabilityDigest) {
      const value = await request('complete', capabilityDigest)
      if (
        !hasExactKeys(value, ['status'])
        || !['completed', 'already_completed'].includes(value.status)
      ) throw new Error('Legacy progress relay is unavailable')
      return value.status
    }
  })
}
