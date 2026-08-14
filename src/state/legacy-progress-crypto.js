import {
  canonicalizeJson,
  decodeBase64Url,
  encodeBase64Url,
  LEGACY_PROGRESS_TRANSFER_MAX_BYTES,
  LEGACY_PROGRESS_TRANSFER_SCHEMA,
  parsePortableProgressEnvelope,
  sha256Base64Url,
  verifyPortableProgressEnvelope
} from './portable-state.js'

const CAPABILITY_BYTES = 32
const IV_BYTES = 12
const AES_GCM_TAG_BYTES = 16
const TRANSFER_AAD = new TextEncoder().encode(
  LEGACY_PROGRESS_TRANSFER_SCHEMA
)

function requireCrypto(cryptoLike) {
  if (
    !cryptoLike
    || typeof cryptoLike.getRandomValues !== 'function'
    || typeof cryptoLike.subtle?.importKey !== 'function'
    || typeof cryptoLike.subtle?.encrypt !== 'function'
    || typeof cryptoLike.subtle?.decrypt !== 'function'
  ) {
    throw new TypeError('Progress transfer requires Web Crypto')
  }
  return cryptoLike
}

function randomBytes(length, cryptoLike) {
  const bytes = new Uint8Array(length)
  cryptoLike.getRandomValues(bytes)
  return bytes
}

async function importCapabilityKey(capabilityBytes, usages, cryptoLike) {
  return cryptoLike.subtle.importKey(
    'raw',
    capabilityBytes,
    { name: 'AES-GCM' },
    false,
    usages
  )
}

export async function createEncryptedProgressTransfer(
  envelopeValue,
  cryptoLike = globalThis.crypto
) {
  const cryptoApi = requireCrypto(cryptoLike)
  const envelope = parsePortableProgressEnvelope(envelopeValue)
  if (!envelope) {
    throw new TypeError('Progress transfer envelope is invalid')
  }

  const plaintext = new TextEncoder().encode(canonicalizeJson(envelope))
  if (plaintext.byteLength > LEGACY_PROGRESS_TRANSFER_MAX_BYTES) {
    throw new RangeError('Progress transfer plaintext is too large')
  }
  const capabilityBytes = randomBytes(CAPABILITY_BYTES, cryptoApi)
  const ivBytes = randomBytes(IV_BYTES, cryptoApi)
  const key = await importCapabilityKey(
    capabilityBytes,
    ['encrypt'],
    cryptoApi
  )
  const encrypted = await cryptoApi.subtle.encrypt({
    name: 'AES-GCM',
    iv: ivBytes,
    additionalData: TRANSFER_AAD,
    tagLength: AES_GCM_TAG_BYTES * 8
  }, key, plaintext)
  const ciphertextBytes = new Uint8Array(encrypted)

  return Object.freeze({
    capability: encodeBase64Url(capabilityBytes),
    capabilityDigest: await sha256Base64Url(
      capabilityBytes,
      cryptoApi
    ),
    ciphertext: encodeBase64Url(ciphertextBytes),
    ciphertextBytes: ciphertextBytes.byteLength,
    ciphertextDigest: await sha256Base64Url(
      ciphertextBytes,
      cryptoApi
    ),
    iv: encodeBase64Url(ivBytes),
    plaintextBytes: plaintext.byteLength
  })
}

export async function decryptProgressTransfer({
  capability,
  ciphertext,
  ciphertextDigest,
  iv
}, cryptoLike = globalThis.crypto) {
  const cryptoApi = requireCrypto(cryptoLike)
  let capabilityBytes
  let ciphertextBytes
  let ivBytes
  try {
    capabilityBytes = decodeBase64Url(capability)
    ciphertextBytes = decodeBase64Url(ciphertext)
    ivBytes = decodeBase64Url(iv)
  } catch {
    throw new TypeError('Encrypted progress transfer is invalid')
  }
  if (
    capabilityBytes.byteLength !== CAPABILITY_BYTES
    || ivBytes.byteLength !== IV_BYTES
    || ciphertextBytes.byteLength <= AES_GCM_TAG_BYTES
    || ciphertextBytes.byteLength
      > LEGACY_PROGRESS_TRANSFER_MAX_BYTES + AES_GCM_TAG_BYTES
    || await sha256Base64Url(ciphertextBytes, cryptoApi)
      !== ciphertextDigest
  ) {
    throw new TypeError('Encrypted progress transfer is invalid')
  }

  try {
    const key = await importCapabilityKey(
      capabilityBytes,
      ['decrypt'],
      cryptoApi
    )
    const decrypted = await cryptoApi.subtle.decrypt({
      name: 'AES-GCM',
      iv: ivBytes,
      additionalData: TRANSFER_AAD,
      tagLength: AES_GCM_TAG_BYTES * 8
    }, key, ciphertextBytes)
    const serialized = new TextDecoder('utf-8', { fatal: true }).decode(
      decrypted
    )
    const envelope = await verifyPortableProgressEnvelope(
      serialized,
      cryptoApi
    )
    if (!envelope) throw new TypeError('Invalid envelope')
    return envelope
  } catch {
    throw new TypeError('Encrypted progress transfer could not be verified')
  }
}
