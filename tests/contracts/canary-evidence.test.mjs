import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { encodeCanaryEvidence } from '../../scripts/canary-evidence.mjs'

function fixture() {
  return {
    schemaVersion: 1, runId: '12345678-1234-1234-1234-123456789012', scenario: 'packet-0-capability', subcase: 1,
    procedureSha256: 'a'.repeat(64), runnerSha: 'b'.repeat(40), candidateSha: 'c'.repeat(40), gate: 'off',
    target: 'local-node', browserVersion: null, osVersion: null, sourceKind: 'local-synthetic',
    startedUtc: '2026-09-05T15:00:00.000Z', finishedUtc: '2026-09-05T15:00:01.000Z',
    assertions: [{ id: 'no-duplicate-executor', passed: true }],
    operations: [{ id: 'reset', expected: 0, observed: 0 }], cleanup: 'not-required', sourceHashes: ['d'.repeat(64)]
  }
}

test('safe evidence retains synthetic provenance and hashes exact artifact bytes', () => {
  const { json, sha256 } = encodeCanaryEvidence(fixture())
  assert.equal(JSON.parse(json).sourceKind, 'local-synthetic')
  assert.equal(sha256, createHash('sha256').update(json).digest('hex'))
})

test('private fields and arbitrary text are rejected rather than silently published', () => {
  for (const change of [
    { email: 'synthetic@example.invalid' }, { candidateSha: 'private-token' }, { browserVersion: 'private-endpoint' },
    { assertions: [{ id: 'owner-isolated', passed: true, rawProfile: {} }] },
    { operations: [{ id: 'private-identity', expected: 0, observed: 0 }] },
    { sourceHashes: ['https://example.invalid/private'] }, { cleanup: 'private free text' }
  ]) assert.throws(() => encodeCanaryEvidence({ ...fixture(), ...change }), /unsafe canary evidence/)
})

test('evidence rejects impossible provenance, chronology, duplicated assertions and invalid counts', () => {
  for (const change of [
    { sourceKind: 'live-browser' }, { finishedUtc: '2026-09-04T15:00:00.000Z' },
    { startedUtc: '2026-02-30T15:00:00.000Z' },
    { assertions: [{ id: 'ui-correct', passed: true }, { id: 'ui-correct', passed: false }] },
    { operations: [{ id: 'read', expected: -1, observed: 0 }] }
  ]) assert.throws(() => encodeCanaryEvidence({ ...fixture(), ...change }), /unsafe canary evidence/)
})

test('failed observations remain failed and do not acquire a passing status', () => {
  const record = fixture()
  record.assertions[0].passed = false
  record.cleanup = 'failed'
  const result = JSON.parse(encodeCanaryEvidence(record).json)
  assert.equal(result.assertions[0].passed, false)
  assert.equal(result.cleanup, 'failed')
  assert.equal(Object.hasOwn(result, 'status'), false)
})

test('custom serialization cannot inject private data after validation', () => {
  const record = fixture()
  Object.setPrototypeOf(record, { toJSON: () => ({ private: 'must-not-escape' }) })
  assert.throws(() => encodeCanaryEvidence(record), /unsafe canary evidence/)
  const nested = fixture()
  Object.setPrototypeOf(nested.assertions[0], { toJSON: () => ({ private: 'must-not-escape' }) })
  assert.throws(() => encodeCanaryEvidence(nested), /unsafe canary evidence/)
  const arrays = fixture()
  arrays.assertions.toJSON = () => ({ private: 'must-not-escape' })
  assert.throws(() => encodeCanaryEvidence(arrays), /unsafe canary evidence/)
  assert.throws(() => encodeCanaryEvidence({ ...fixture(), candidateSha: ['c'.repeat(40)] }), /unsafe canary evidence/)
})
