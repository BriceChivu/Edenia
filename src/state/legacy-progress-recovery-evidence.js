export const LEGACY_PROGRESS_RECOVERY_EVIDENCE_SCHEMA =
  'edenia-legacy-progress-recovery-evidence-v1'

const PRIMARY_ISSUES = new Set(['corrupt', 'too_large'])
const BACKUP_ISSUES = new Set(['corrupt', 'too_large'])
const INDEXED_DB_ISSUES = new Set(['too_large', 'unreadable'])

function isCanonicalIsoDate(value) {
  if (typeof value !== 'string' || !value) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}

export function createLegacyProgressRecoveryEvidence({
  indexedDbIssue = null,
  localBackupRaw = null,
  localBackupsIssue = null,
  now = () => new Date(),
  primaryIssue = null,
  primaryRaw = null
} = {}) {
  const capturedAt = now().toISOString()
  if (!isCanonicalIsoDate(capturedAt)) {
    throw new TypeError('Recovery evidence timestamp is invalid')
  }

  const items = []
  if (
    typeof primaryRaw === 'string'
    && PRIMARY_ISSUES.has(primaryIssue)
  ) {
    items.push({
      issue: primaryIssue,
      raw: primaryRaw,
      source: 'normal_primary',
      storageKey: 'edenia_v1'
    })
  }
  if (
    typeof localBackupRaw === 'string'
    && BACKUP_ISSUES.has(localBackupsIssue)
  ) {
    items.push({
      issue: localBackupsIssue,
      raw: localBackupRaw,
      source: 'normal_local_backups',
      storageKey: 'edenia_v1_backups'
    })
  }
  if (INDEXED_DB_ISSUES.has(indexedDbIssue)) {
    items.push({
      databaseName: 'edenia_state_backups_v1',
      issue: indexedDbIssue,
      source: 'normal_indexed_db_backups'
    })
  }
  if (!items.length) {
    throw new TypeError('Recovery evidence requires a failed source')
  }

  return {
    capturedAt,
    items,
    schema: LEGACY_PROGRESS_RECOVERY_EVIDENCE_SCHEMA
  }
}

export function serializeLegacyProgressRecoveryEvidence(input) {
  return `${JSON.stringify(
    createLegacyProgressRecoveryEvidence(input),
    null,
    2
  )}\n`
}
