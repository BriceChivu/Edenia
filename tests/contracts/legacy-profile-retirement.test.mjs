import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canRemoveEmergencyAccountlessRollback,
  canRetireLegacyProfileMigrator
} from '../../src/domain/legacy-profile-retirement.js'

const DAY_MS = 24 * 60 * 60 * 1000
const FINAL_CUTOVER_AT = Date.parse('2026-08-31T00:00:00.000Z')

test('emergency rollback removal requires approval and 30 incident-free days after cutover', () => {
  const incidentFreeSince = Date.parse('2026-09-03T00:00:00.000Z')
  const removalAt = incidentFreeSince + (30 * DAY_MS)
  const context = { finalCutoverAt: FINAL_CUTOVER_AT, incidentFreeSince }

  assert.equal(canRemoveEmergencyAccountlessRollback({
    ...context,
    approved: true,
    now: removalAt - 1
  }), false)
  assert.equal(canRemoveEmergencyAccountlessRollback({
    ...context,
    approved: false,
    now: removalAt
  }), false)
  assert.equal(canRemoveEmergencyAccountlessRollback({
    ...context,
    approved: true,
    now: removalAt
  }), true)
})

test('legacy migrator retirement requires 12 months, 90 quiet days, and approval', () => {
  const twelveMonthsAt = Date.parse('2027-08-31T00:00:00.000Z')
  const latestCompletedMigrationAt = Date.parse('2027-07-01T00:00:00.000Z')
  const quietWindowAt = latestCompletedMigrationAt + (90 * DAY_MS)
  const eligibleAt = Math.max(twelveMonthsAt, quietWindowAt)
  const context = { finalCutoverAt: FINAL_CUTOVER_AT, latestCompletedMigrationAt }

  assert.equal(canRetireLegacyProfileMigrator({
    ...context,
    approved: true,
    now: eligibleAt - 1
  }), false)
  assert.equal(canRetireLegacyProfileMigrator({
    ...context,
    approved: false,
    now: eligibleAt
  }), false)
  assert.equal(canRetireLegacyProfileMigrator({
    ...context,
    approved: true,
    now: eligibleAt
  }), true)
})

test('a later completed migration restarts the 90-day quiet window', () => {
  assert.equal(canRetireLegacyProfileMigrator({
    approved: true,
    finalCutoverAt: FINAL_CUTOVER_AT,
    latestCompletedMigrationAt: Date.parse('2027-09-01T00:00:00.000Z'),
    now: Date.parse('2027-11-29T23:59:59.999Z')
  }), false)
})
