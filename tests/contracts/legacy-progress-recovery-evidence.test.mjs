import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLegacyProgressRecoveryEvidence,
  LEGACY_PROGRESS_RECOVERY_EVIDENCE_SCHEMA,
  serializeLegacyProgressRecoveryEvidence
} from '../../src/state/legacy-progress-recovery-evidence.js'

const fixedNow = () => new Date('2026-08-13T00:00:00.000Z')

test('recovery evidence contains only explicit normal-mode failed sources', () => {
  const evidence = createLegacyProgressRecoveryEvidence({
    indexedDbIssue: 'unreadable',
    localBackupRaw: '{broken backups',
    localBackupsIssue: 'corrupt',
    now: fixedNow,
    primaryIssue: 'corrupt',
    primaryRaw: '{broken primary'
  })
  assert.deepEqual(evidence, {
    capturedAt: '2026-08-13T00:00:00.000Z',
    items: [
      {
        issue: 'corrupt',
        raw: '{broken primary',
        source: 'normal_primary',
        storageKey: 'edenia_v1'
      },
      {
        issue: 'corrupt',
        raw: '{broken backups',
        source: 'normal_local_backups',
        storageKey: 'edenia_v1_backups'
      },
      {
        databaseName: 'edenia_state_backups_v1',
        issue: 'unreadable',
        source: 'normal_indexed_db_backups'
      }
    ],
    schema: LEGACY_PROGRESS_RECOVERY_EVIDENCE_SCHEMA
  })
  assert.deepEqual(Object.keys(evidence).sort(), [
    'capturedAt',
    'items',
    'schema'
  ])
  const serialized = serializeLegacyProgressRecoveryEvidence({
    now: fixedNow,
    primaryIssue: 'too_large',
    primaryRaw: 'oversized primary'
  })
  assert.equal(serialized.endsWith('\n'), true)
  assert.equal(serialized.includes('oversized primary'), true)
  for (const forbidden of [
    'cookie',
    'posthog',
    'supabase',
    'edenia_v1_test',
    'edenia_v1_sandbox'
  ]) {
    assert.equal(serialized.toLowerCase().includes(forbidden), false)
  }
})

test('recovery evidence rejects empty or ambiguous inputs', () => {
  assert.throws(
    () => createLegacyProgressRecoveryEvidence({ now: fixedNow }),
    /requires a failed source/
  )
  assert.throws(
    () => createLegacyProgressRecoveryEvidence({
      now: fixedNow,
      primaryIssue: 'unknown',
      primaryRaw: 'data'
    }),
    /requires a failed source/
  )
  assert.throws(
    () => createLegacyProgressRecoveryEvidence({
      indexedDbIssue: 'unknown',
      localBackupRaw: 'data',
      localBackupsIssue: 'unknown',
      now: fixedNow
    }),
    /requires a failed source/
  )
})
