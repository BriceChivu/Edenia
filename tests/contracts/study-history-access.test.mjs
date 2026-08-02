import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPlusAccessPolicy,
  PLUS_ENTITLEMENT_STATES
} from '../../src/domain/plus-access-policy.js'
import {
  getFreeStudyHistoryCutoff,
  getStudyHistoryAccessDecision,
  STUDY_HISTORY_ACCESS_STATES
} from '../../src/domain/study-history-access.js'
import { toDateKey } from '../../src/core/date-keys.js'

function policy(entitlementState, options = {}) {
  return createPlusAccessPolicy({
    entitlementState,
    freePlusEnabled: true,
    ...options
  })
}

test('Free cutoff includes the current Monday-based week and four previous weeks', () => {
  assert.equal(
    toDateKey(getFreeStudyHistoryCutoff(new Date(2026, 7, 2, 23, 30))),
    '2026-06-29'
  )
  assert.equal(
    toDateKey(getFreeStudyHistoryCutoff(new Date(2026, 0, 4, 8, 0))),
    '2025-12-01'
  )
})

test('Free history admits the cutoff and hides the day before it', () => {
  const accessPolicy = policy(PLUS_ENTITLEMENT_STATES.FREE)
  const currentDate = new Date(2026, 7, 2, 12, 0)

  assert.equal(getStudyHistoryAccessDecision({
    accessPolicy,
    currentDate,
    periodStart: '2026-06-29'
  }).state, STUDY_HISTORY_ACCESS_STATES.AVAILABLE)
  assert.equal(getStudyHistoryAccessDecision({
    accessPolicy,
    currentDate,
    periodStart: '2026-06-28'
  }).state, STUDY_HISTORY_ACCESS_STATES.LOCKED)
})

test('month access uses its start so a month overlapping the cutoff stays locked', () => {
  const accessPolicy = policy(PLUS_ENTITLEMENT_STATES.FREE)
  const currentDate = new Date(2026, 7, 17, 12, 0)

  assert.equal(getStudyHistoryAccessDecision({
    accessPolicy,
    currentDate,
    periodStart: new Date(2026, 6, 1)
  }).state, STUDY_HISTORY_ACCESS_STATES.LOCKED)
  assert.equal(getStudyHistoryAccessDecision({
    accessPolicy,
    currentDate,
    periodStart: new Date(2026, 7, 1)
  }).state, STUDY_HISTORY_ACCESS_STATES.AVAILABLE)
})

test('Plus and legacy-unlocked policies reveal old history without changing dates', () => {
  const currentDate = new Date(2026, 7, 2, 12, 0)
  for (const accessPolicy of [
    policy(PLUS_ENTITLEMENT_STATES.PLUS),
    createPlusAccessPolicy({ entitlementState: PLUS_ENTITLEMENT_STATES.FREE }),
    policy(PLUS_ENTITLEMENT_STATES.PAYMENT_PROBLEM)
  ]) {
    const decision = getStudyHistoryAccessDecision({
      accessPolicy,
      currentDate,
      periodStart: '2020-01-01'
    })
    assert.equal(decision.state, STUDY_HISTORY_ACCESS_STATES.AVAILABLE)
    assert.equal(decision.periodStartDateKey, '2020-01-01')
  }
})

test('older history fails closed while entitlement loads or is unavailable', () => {
  const currentDate = new Date(2026, 7, 2, 12, 0)
  const cases = [
    [PLUS_ENTITLEMENT_STATES.LOADING, STUDY_HISTORY_ACCESS_STATES.LOADING],
    [PLUS_ENTITLEMENT_STATES.UNAVAILABLE, STUDY_HISTORY_ACCESS_STATES.UNAVAILABLE]
  ]
  for (const [entitlementState, expected] of cases) {
    const accessPolicy = policy(entitlementState)
    assert.equal(getStudyHistoryAccessDecision({
      accessPolicy,
      currentDate,
      periodStart: '2026-01-01'
    }).state, expected)
    assert.equal(getStudyHistoryAccessDecision({
      accessPolicy,
      currentDate,
      periodStart: '2026-07-01'
    }).state, STUDY_HISTORY_ACCESS_STATES.AVAILABLE)
  }
})

test('invalid period starts are rejected instead of silently exposing data', () => {
  assert.throws(
    () => getStudyHistoryAccessDecision({ periodStart: 'not-a-date' }),
    /valid period start/
  )
})
