import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createEncryptedProgressTransfer,
  decryptProgressTransfer
} from '../../src/state/legacy-progress-crypto.js'
import {
  createPortableProgressEnvelope,
  decodeBase64Url
} from '../../src/state/portable-state.js'

function validState(marker = 'known-study-marker') {
  return {
    config: { locale: 'en', marker },
    videos: {},
    anki: {}
  }
}

test('progress transfer encryption round-trips with opaque bounded fields', async () => {
  const { envelope } = await createPortableProgressEnvelope({
    state: validState(),
    source: { kind: 'primary' },
    now: () => new Date('2026-08-13T00:00:00.000Z')
  })
  const encrypted = await createEncryptedProgressTransfer(envelope)

  assert.match(encrypted.capability, /^[A-Za-z0-9_-]{43}$/)
  assert.match(encrypted.capabilityDigest, /^[A-Za-z0-9_-]{43}$/)
  assert.match(encrypted.ciphertextDigest, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(decodeBase64Url(encrypted.capability).byteLength, 32)
  assert.equal(decodeBase64Url(encrypted.iv).byteLength, 12)
  assert.equal(
    decodeBase64Url(encrypted.ciphertext).byteLength,
    encrypted.plaintextBytes + 16
  )
  assert.equal(encrypted.ciphertext.includes('known-study-marker'), false)
  assert.deepEqual(
    await decryptProgressTransfer(encrypted),
    envelope
  )
})

test('tampering, wrong capabilities, and widened encodings fail closed', async () => {
  const { envelope } = await createPortableProgressEnvelope({
    state: validState(),
    source: { kind: 'primary' }
  })
  const encrypted = await createEncryptedProgressTransfer(envelope)

  await assert.rejects(
    decryptProgressTransfer({
      ...encrypted,
      ciphertextDigest: 'A'.repeat(43)
    }),
    /invalid/
  )
  await assert.rejects(
    decryptProgressTransfer({
      ...encrypted,
      capability: `${
        encrypted.capability.startsWith('A') ? 'B' : 'A'
      }${encrypted.capability.slice(1)}`
    }),
    /could not be verified/
  )
  await assert.rejects(
    decryptProgressTransfer({
      ...encrypted,
      iv: `${encrypted.iv}=`
    }),
    /invalid/
  )
  await assert.rejects(
    createEncryptedProgressTransfer({ nope: true }),
    /envelope is invalid/
  )
})
