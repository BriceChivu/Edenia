const DAY_MS = 24 * 60 * 60 * 1000
const EMERGENCY_ROLLBACK_MINIMUM_DAYS = 30
const LEGACY_MIGRATOR_MINIMUM_MONTHS = 12
const LEGACY_MIGRATOR_QUIET_DAYS = 90

function addUtcMonths(timestamp, months) {
  if (!Number.isFinite(timestamp)) return null
  const date = new Date(timestamp)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    0
  )).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return date.getTime()
}

export function canRemoveEmergencyAccountlessRollback({
  approved = false,
  finalCutoverAt,
  incidentFreeSince,
  now
} = {}) {
  return approved === true
    && Number.isFinite(now)
    && Number.isFinite(finalCutoverAt)
    && Number.isFinite(incidentFreeSince)
    && incidentFreeSince >= finalCutoverAt
    && now >= incidentFreeSince + (EMERGENCY_ROLLBACK_MINIMUM_DAYS * DAY_MS)
}

export function canRetireLegacyProfileMigrator({
  approved = false,
  finalCutoverAt,
  latestCompletedMigrationAt = null,
  now
} = {}) {
  const minimumRetentionAt = addUtcMonths(
    finalCutoverAt,
    LEGACY_MIGRATOR_MINIMUM_MONTHS
  )
  const quietPeriodStartedAt = Number.isFinite(latestCompletedMigrationAt)
    ? latestCompletedMigrationAt
    : finalCutoverAt
  return approved === true
    && Number.isFinite(now)
    && Number.isFinite(minimumRetentionAt)
    && Number.isFinite(quietPeriodStartedAt)
    && quietPeriodStartedAt >= finalCutoverAt
    && now >= minimumRetentionAt
    && now >= quietPeriodStartedAt + (LEGACY_MIGRATOR_QUIET_DAYS * DAY_MS)
}
