import {
  isValidStateShape,
  sanitizeConfigForStorage
} from './persistence-contract.js'

export const LEGACY_PROGRESS_TRANSFER_SCHEMA =
  'edenia-legacy-progress-transfer-v1'
export const LEGACY_PROGRESS_TRANSFER_MAX_BYTES = 8 * 1024 * 1024

const SHA256_BASE64URL_PATTERN = /^[A-Za-z0-9_-]{43}$/

function cloneJson(value) {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) {
    throw new TypeError('Portable progress must be JSON serializable')
  }
  return JSON.parse(serialized)
}

function isPlainRecord(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
  )
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainRecord(value)) return false
  const actualKeys = Object.keys(value).sort()
  const sortedExpected = [...expectedKeys].sort()
  return actualKeys.length === sortedExpected.length
    && actualKeys.every((key, index) => key === sortedExpected[index])
}

function isValidDate(value) {
  if (typeof value !== 'string' || !value) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}

function utf8Bytes(value) {
  return new TextEncoder().encode(String(value))
}

export function getJsonByteLength(value) {
  return utf8Bytes(JSON.stringify(value)).byteLength
}

export function isPortableProgressState(state) {
  return Boolean(
    isValidStateShape(state)
    && isPlainRecord(state.config)
  )
}

export function sanitizePortableProgressState(state) {
  if (!isPortableProgressState(state)) return null
  try {
    const portableState = cloneJson(state)
    portableState.config = sanitizeConfigForStorage(portableState.config)
    return isPortableProgressState(portableState) ? portableState : null
  } catch {
    return null
  }
}

function canonicalizeValue(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalizeValue)
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = canonicalizeValue(value[key])
      return result
    }, {})
}

export function canonicalizeJson(value) {
  return JSON.stringify(canonicalizeValue(cloneJson(value)))
}

function binaryString(bytes) {
  let result = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    result += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize)
    )
  }
  return result
}

export function encodeBase64Url(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('Base64url encoding requires bytes')
  }
  return btoa(binaryString(bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

export function decodeBase64Url(value) {
  const encoded = String(value || '')
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new TypeError('Base64url value is invalid')
  }
  const remainder = encoded.length % 4
  if (remainder === 1) throw new TypeError('Base64url value is invalid')
  const padded = encoded
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(encoded.length + ((4 - remainder) % 4), '=')
  let binary
  try {
    binary = atob(padded)
  } catch {
    throw new TypeError('Base64url value is invalid')
  }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  if (encodeBase64Url(bytes) !== encoded) {
    throw new TypeError('Base64url value is not canonical')
  }
  return bytes
}

export async function sha256Base64Url(
  value,
  cryptoLike = globalThis.crypto
) {
  if (!cryptoLike?.subtle || typeof cryptoLike.subtle.digest !== 'function') {
    throw new TypeError('SHA-256 requires Web Crypto')
  }
  const bytes = typeof value === 'string'
    ? utf8Bytes(value)
    : value instanceof Uint8Array
      ? value
      : value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : null
  if (!bytes) throw new TypeError('SHA-256 requires text or bytes')
  const digest = await cryptoLike.subtle.digest('SHA-256', bytes)
  return encodeBase64Url(new Uint8Array(digest))
}

function parsePortableState(raw) {
  if (typeof raw !== 'string' || !raw) return null
  try {
    return sanitizePortableProgressState(JSON.parse(raw))
  } catch {
    return null
  }
}

function readBackupEntries(raw) {
  if (raw === null || raw === undefined) {
    return { entries: [], malformed: false }
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? { entries: parsed, malformed: false }
      : { entries: [], malformed: true }
  } catch {
    return { entries: [], malformed: true }
  }
}

function normalizeBackupCandidate(entry) {
  const state = sanitizePortableProgressState(entry?.state)
  if (
    !state
    || typeof entry.id !== 'string'
    || !entry.id
    || !isValidDate(entry.createdAt)
    || entry.sandbox !== false
  ) return null
  return {
    createdAt: entry.createdAt,
    id: entry.id,
    state
  }
}

function collectBackupCandidates(localBackupRaw, indexedDbEntries) {
  const local = readBackupEntries(localBackupRaw)
  const indexed = Array.isArray(indexedDbEntries)
    ? indexedDbEntries
    : []
  const candidates = []
  let malformed = local.malformed || !Array.isArray(indexedDbEntries)
  for (const entry of [...local.entries, ...indexed]) {
    const candidate = normalizeBackupCandidate(entry)
    if (!candidate) {
      malformed = true
      continue
    }
    candidates.push(candidate)
  }

  const byId = new Map()
  const conflicts = new Set()
  for (const candidate of candidates) {
    const existing = byId.get(candidate.id)
    if (!existing) {
      byId.set(candidate.id, candidate)
      continue
    }
    if (canonicalizeJson(existing) !== canonicalizeJson(candidate)) {
      conflicts.add(candidate.id)
    }
  }
  conflicts.forEach(id => byId.delete(id))

  return {
    candidates: [...byId.values()].sort((left, right) => {
      const timeOrder = new Date(right.createdAt) - new Date(left.createdAt)
      return timeOrder || left.id.localeCompare(right.id)
    }),
    malformed: malformed || conflicts.size > 0
  }
}

function acceptedCandidate({ source, state, maxBytes, corruptEvidence }) {
  const byteLength = getJsonByteLength(state)
  if (byteLength > maxBytes) {
    return {
      status: 'too_large',
      source,
      byteLength,
      maxBytes,
      corruptEvidence
    }
  }
  return {
    status: source.kind,
    source,
    state,
    byteLength,
    corruptEvidence
  }
}

export function selectPortableProgressCandidate({
  primaryRaw = null,
  localBackupRaw = null,
  indexedDbEntries = [],
  maxBytes = LEGACY_PROGRESS_TRANSFER_MAX_BYTES
} = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError('Portable progress maximum bytes must be positive')
  }

  const primaryExists = primaryRaw !== null && primaryRaw !== undefined
  const primaryState = primaryExists ? parsePortableState(primaryRaw) : null
  const backups = collectBackupCandidates(localBackupRaw, indexedDbEntries)
  const corruptEvidence = {
    primary: primaryExists && !primaryState,
    backups: backups.malformed
  }

  if (primaryState) {
    return acceptedCandidate({
      source: { kind: 'primary' },
      state: primaryState,
      maxBytes,
      corruptEvidence
    })
  }

  const backup = backups.candidates[0]
  if (backup) {
    return acceptedCandidate({
      source: {
        kind: 'backup',
        backupId: backup.id,
        createdAt: backup.createdAt,
        recoveredFromCorruptPrimary: corruptEvidence.primary
      },
      state: backup.state,
      maxBytes,
      corruptEvidence
    })
  }

  if (primaryExists || backups.malformed) {
    return { status: 'corrupt', corruptEvidence }
  }
  return { status: 'none', corruptEvidence }
}

function normalizeEnvelopeSource(source) {
  if (source?.kind === 'primary') return { kind: 'primary' }
  if (
    source?.kind === 'backup'
    && typeof source.backupId === 'string'
    && source.backupId
    && isValidDate(source.createdAt)
  ) {
    return {
      kind: 'backup',
      backupId: source.backupId,
      createdAt: source.createdAt,
      recoveredFromCorruptPrimary:
        source.recoveredFromCorruptPrimary === true
    }
  }
  return null
}

export async function createPortableProgressEnvelope({
  state,
  source,
  now = () => new Date(),
  maxBytes = LEGACY_PROGRESS_TRANSFER_MAX_BYTES,
  cryptoLike = globalThis.crypto
}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError('Portable progress maximum bytes must be positive')
  }
  const portableState = sanitizePortableProgressState(state)
  const portableSource = normalizeEnvelopeSource(source)
  const createdAt = now().toISOString()
  if (!portableState || !portableSource || !isValidDate(createdAt)) {
    throw new TypeError('Portable progress envelope input is invalid')
  }
  const stateSha256 = await sha256Base64Url(
    canonicalizeJson(portableState),
    cryptoLike
  )
  const envelope = {
    schema: LEGACY_PROGRESS_TRANSFER_SCHEMA,
    createdAt,
    source: portableSource,
    stateSha256,
    state: portableState
  }
  const serialized = canonicalizeJson(envelope)
  const byteLength = utf8Bytes(serialized).byteLength
  if (byteLength > maxBytes) {
    throw new RangeError('Portable progress envelope is too large')
  }
  return { envelope, serialized, byteLength }
}

export function parsePortableProgressEnvelope(
  value,
  { maxBytes = LEGACY_PROGRESS_TRANSFER_MAX_BYTES } = {}
) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) return null
  let envelope
  try {
    envelope = typeof value === 'string' ? JSON.parse(value) : cloneJson(value)
  } catch {
    return null
  }
  const source = normalizeEnvelopeSource(envelope?.source)
  const sanitizedState = sanitizePortableProgressState(envelope?.state)
  if (
    !hasExactKeys(envelope, [
      'schema',
      'createdAt',
      'source',
      'stateSha256',
      'state'
    ])
    || envelope.schema !== LEGACY_PROGRESS_TRANSFER_SCHEMA
    || !isValidDate(envelope.createdAt)
    || !source
    || !hasExactKeys(
      envelope.source,
      source.kind === 'primary'
        ? ['kind']
        : [
            'kind',
            'backupId',
            'createdAt',
            'recoveredFromCorruptPrimary'
          ]
    )
    || !SHA256_BASE64URL_PATTERN.test(envelope.stateSha256)
    || !sanitizedState
    || canonicalizeJson(sanitizedState) !== canonicalizeJson(envelope.state)
    || getJsonByteLength(envelope) > maxBytes
  ) return null
  return envelope
}

export async function verifyPortableProgressEnvelope(
  value,
  cryptoLike = globalThis.crypto
) {
  const envelope = parsePortableProgressEnvelope(value)
  if (!envelope) return null
  const stateSha256 = await sha256Base64Url(
    canonicalizeJson(envelope.state),
    cryptoLike
  )
  return stateSha256 === envelope.stateSha256 ? envelope : null
}
