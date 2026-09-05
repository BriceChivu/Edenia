import { createHash } from 'node:crypto'
import { REQUIRED_SCENARIOS } from './release-readiness.mjs'

const SCENARIOS = new Set([...REQUIRED_SCENARIOS.map(row => row.id), 'packet-0-capability', 'packet-1-profile-opening', 'packet-2-provider-origins'])
const TARGETS = new Set(['operator-cli', 'local-node', 'macos-chrome', 'macos-safari', 'fresh-chrome-isolated-context', 'private-browsing'])
const SHA = /^[a-f0-9]{40}$/u
const HASH = /^[a-f0-9]{64}$/u
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
const ASSERTIONS = new Set(['identity-matches', 'gate-matches', 'owner-isolated', 'progress-preserved', 'history-protected', 'revision-correct', 'ui-correct', 'counts-match', 'cleanup-verified', 'interruption-contained', 'no-duplicate-executor', 'no-duplicate-mutation'])
const OPERATIONS = new Set(['read', 'resolve', 'backup', 'sync', 'import', 'reset', 'undo', 'delivery', 'auth', 'sign-out', 'gate-transition', 'monitor-transition'])

function check(value) { if (!value) throw new Error('Invalid or unsafe canary evidence') }
function matches(pattern, value) { return typeof value === 'string' && pattern.test(value) }
function exact(value, keys) {
  check(value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)))
  check(Reflect.ownKeys(value).every(key => typeof key === 'string' && Object.getOwnPropertyDescriptor(value, key)?.get === undefined && Object.getOwnPropertyDescriptor(value, key)?.set === undefined))
  check(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)))
}
function plainArray(value) {
  check(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype)
  check(Reflect.ownKeys(value).length === value.length + 1)
  check(Reflect.ownKeys(value).every(key => key === 'length' || (typeof key === 'string' && /^(0|[1-9][0-9]*)$/u.test(key) && Number(key) < value.length && Object.getOwnPropertyDescriptor(value, key)?.get === undefined)))
}
function utc(value) { check(typeof value === 'string' && TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value) }

// Reject unknown fields instead of attempting to scrub arbitrary private logs.
// This validates a reviewer-safe envelope, not the truth of supplied observations.
// A reviewer must retrieve and verify the separately retained source evidence.
export function encodeCanaryEvidence(record) {
  exact(record, ['schemaVersion', 'runId', 'scenario', 'subcase', 'procedureSha256', 'runnerSha', 'candidateSha', 'gate', 'target', 'browserVersion', 'osVersion', 'sourceKind', 'startedUtc', 'finishedUtc', 'assertions', 'operations', 'cleanup', 'sourceHashes'])
  check(record.schemaVersion === 1 && matches(UUID, record.runId) && SCENARIOS.has(record.scenario))
  check(Number.isSafeInteger(record.subcase) && record.subcase >= 1 && record.subcase <= 1000)
  check(matches(HASH, record.procedureSha256) && matches(SHA, record.runnerSha) && matches(SHA, record.candidateSha))
  check(['off', 'developer-canary'].includes(record.gate) && TARGETS.has(record.target))
  check(['local-synthetic', 'live-browser', 'deployed-schema', 'operator-metadata'].includes(record.sourceKind))
  for (const version of [record.browserVersion, record.osVersion]) check(version === null || matches(/^\d+(?:\.\d+){0,4}$/u, version))
  if (record.sourceKind === 'live-browser') check(record.browserVersion !== null && record.osVersion !== null && !['operator-cli', 'local-node'].includes(record.target))
  utc(record.startedUtc)
  utc(record.finishedUtc)
  check(Date.parse(record.finishedUtc) >= Date.parse(record.startedUtc))
  plainArray(record.assertions)
  check(record.assertions.length > 0)
  const assertionIds = new Set()
  for (const assertion of record.assertions) {
    exact(assertion, ['id', 'passed'])
    check(ASSERTIONS.has(assertion.id) && !assertionIds.has(assertion.id) && typeof assertion.passed === 'boolean')
    assertionIds.add(assertion.id)
  }
  plainArray(record.operations)
  const operationIds = new Set()
  for (const operation of record.operations) {
    exact(operation, ['id', 'expected', 'observed'])
    check(OPERATIONS.has(operation.id) && !operationIds.has(operation.id))
    for (const count of [operation.expected, operation.observed]) check(Number.isSafeInteger(count) && count >= 0)
    operationIds.add(operation.id)
  }
  check(['verified', 'failed', 'not-required'].includes(record.cleanup))
  plainArray(record.sourceHashes)
  check(record.sourceHashes.length > 0 && record.sourceHashes.every(hash => typeof hash === 'string' && HASH.test(hash)))
  const safe = { ...record, assertions: record.assertions.map(({ id, passed }) => ({ id, passed })), operations: record.operations.map(({ id, expected, observed }) => ({ id, expected, observed })), sourceHashes: [...record.sourceHashes] }
  const json = JSON.stringify(safe, null, 2) + '\n'
  return { json, sha256: createHash('sha256').update(json).digest('hex') }
}
