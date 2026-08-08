import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeStateBackupEntries,
  parseLegacyStateBackupEntries,
  stateBackupEntriesMatch
} from '../../src/state/indexed-db-backups.js'

function validEntry(id, createdAt = '2026-08-01T00:00:00.000Z') {
  return {
    id,
    createdAt,
    reason: 'automatic backup',
    sandbox: false,
    state: {
      config: {},
      videos: {},
      anki: {}
    }
  }
}

function isValidEntry(entry) {
  return Boolean(
    entry?.id
    && entry?.createdAt
    && entry?.state?.config
    && entry?.state?.videos
    && entry?.state?.anki
  )
}

test('legacy parsing distinguishes absence from malformed or duplicate data', () => {
  assert.deepEqual(parseLegacyStateBackupEntries(null, isValidEntry), {
    entries: [],
    exists: false,
    valid: true
  })

  for (const raw of [
    '{invalid',
    JSON.stringify({ nope: true }),
    JSON.stringify([validEntry('duplicate'), validEntry('duplicate')]),
    JSON.stringify([validEntry('valid'), { id: 'invalid' }])
  ]) {
    assert.deepEqual(parseLegacyStateBackupEntries(raw, isValidEntry), {
      entries: [],
      exists: true,
      valid: false
    })
  }
})

test('legacy parsing clones every valid entry without silently dropping data', () => {
  const entries = [
    validEntry('one'),
    validEntry('two', '2026-07-31T00:00:00.000Z')
  ]
  const result = parseLegacyStateBackupEntries(
    JSON.stringify(entries),
    isValidEntry
  )
  assert.deepEqual(result, {
    entries,
    exists: true,
    valid: true
  })
  assert.notEqual(result.entries, entries)
})

test('migration merging is idempotent and lets legacy copies reconcile IDs', () => {
  const indexed = [
    validEntry('indexed', '2026-08-01T00:00:00.000Z'),
    { ...validEntry('shared'), reason: 'indexed copy' }
  ]
  const legacy = [
    { ...validEntry('shared'), reason: 'legacy copy' },
    validEntry('legacy', '2026-08-02T00:00:00.000Z')
  ]
  const merged = mergeStateBackupEntries(indexed, legacy)

  assert.deepEqual(merged.map(entry => entry.id), [
    'legacy',
    'indexed',
    'shared'
  ])
  assert.equal(
    merged.find(entry => entry.id === 'shared').reason,
    'legacy copy'
  )
  assert.deepEqual(mergeStateBackupEntries(merged, legacy), merged)
})

test('verification compares complete backup content independent of order', () => {
  const first = validEntry('first')
  const second = validEntry('second')
  assert.equal(stateBackupEntriesMatch([first, second], [second, first]), true)
  assert.equal(stateBackupEntriesMatch(
    [first],
    [{ ...first, reason: 'changed' }]
  ), false)
  assert.equal(stateBackupEntriesMatch([first], []), false)
  assert.equal(stateBackupEntriesMatch(null, []), false)
})
