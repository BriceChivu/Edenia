import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getStudyInsightAccessDecision,
  getStudyInsightArchiveAccess,
  STUDY_INSIGHT_ACCESS_STATES
} from '../../src/domain/study-insight-access.js'
import {
  createPlusAccessPolicy,
  PLUS_ENTITLEMENT_STATES
} from '../../src/domain/plus-access-policy.js'

function entry(index, overrides = {}) {
  const timestamp = new Date(Date.UTC(2026, 0, index + 1)).toISOString()
  return {
    key: `insight-${index}`,
    firstRecordedAt: timestamp,
    recordedAt: timestamp,
    ...overrides
  }
}

function policy(entitlementState, options = {}) {
  return createPlusAccessPolicy({
    entitlementState,
    freePlusEnabled: true,
    ...options
  })
}

test('Free keeps the first five lifetime insights and restricts every later one', () => {
  const history = Array.from({ length: 8 }, (_, index) => entry(index)).reverse()
  const before = structuredClone(history)
  const access = getStudyInsightArchiveAccess({
    accessPolicy: policy(PLUS_ENTITLEMENT_STATES.FREE),
    history
  })

  assert.deepEqual(
    access.accessibleEntries.map(candidate => candidate.key),
    ['insight-4', 'insight-3', 'insight-2', 'insight-1', 'insight-0']
  )
  assert.deepEqual(
    access.restrictedEntries.map(candidate => candidate.key),
    ['insight-7', 'insight-6', 'insight-5']
  )
  assert.equal(access.restrictedState, STUDY_INSIGHT_ACCESS_STATES.LOCKED)
  assert.deepEqual(history, before)
  assert.equal(Object.isFrozen(access), true)
  assert.equal(Object.isFrozen(access.accessibleEntries), true)
  assert.equal(Object.isFrozen(access.restrictedEntries), true)
})

test('first-recorded timestamps keep updated insights in their lifetime slots', () => {
  const updatedFirst = entry(0, {
    key: 'updated-first',
    recordedAt: '2026-12-01T00:00:00.000Z'
  })
  const history = [updatedFirst, ...Array.from(
    { length: 5 },
    (_, index) => entry(index + 1)
  ).reverse()]
  const access = getStudyInsightArchiveAccess({
    accessPolicy: policy(PLUS_ENTITLEMENT_STATES.FREE),
    history
  })

  assert.ok(access.accessibleEntries.includes(updatedFirst))
  assert.deepEqual(
    access.restrictedEntries.map(candidate => candidate.key),
    ['insight-5']
  )
})

test('Plus, payment grace, and disabled restrictions expose the complete archive', () => {
  const history = Array.from({ length: 8 }, (_, index) => entry(index)).reverse()
  const policies = [
    policy(PLUS_ENTITLEMENT_STATES.PLUS),
    policy(PLUS_ENTITLEMENT_STATES.PAYMENT_PROBLEM),
    createPlusAccessPolicy({ entitlementState: PLUS_ENTITLEMENT_STATES.FREE })
  ]

  for (const accessPolicy of policies) {
    const access = getStudyInsightArchiveAccess({ accessPolicy, history })
    assert.deepEqual(access.accessibleEntries, history)
    assert.deepEqual(access.restrictedEntries, [])
    assert.equal(
      access.restrictedState,
      STUDY_INSIGHT_ACCESS_STATES.AVAILABLE
    )
  }
})

test('loading and unavailable entitlements fail closed only after the first five', () => {
  const history = Array.from({ length: 6 }, (_, index) => entry(index)).reverse()
  for (const [entitlementState, expectedState] of [
    [PLUS_ENTITLEMENT_STATES.LOADING, STUDY_INSIGHT_ACCESS_STATES.LOADING],
    [PLUS_ENTITLEMENT_STATES.UNAVAILABLE, STUDY_INSIGHT_ACCESS_STATES.UNAVAILABLE]
  ]) {
    const accessPolicy = policy(entitlementState)
    const access = getStudyInsightArchiveAccess({ accessPolicy, history })
    assert.equal(access.accessibleEntries.length, 5)
    assert.deepEqual(
      access.restrictedEntries.map(candidate => candidate.key),
      ['insight-5']
    )
    assert.equal(access.restrictedState, expectedState)
    assert.equal(getStudyInsightAccessDecision({
      accessPolicy,
      history,
      insightKey: 'insight-0'
    }), STUDY_INSIGHT_ACCESS_STATES.AVAILABLE)
    assert.equal(getStudyInsightAccessDecision({
      accessPolicy,
      history,
      insightKey: 'insight-5'
    }), expectedState)
    assert.equal(getStudyInsightAccessDecision({
      accessPolicy,
      history,
      insightKey: 'not-recorded'
    }), expectedState)
  }
})

test('archive access tolerates invalid history and policy limits', () => {
  assert.deepEqual(getStudyInsightArchiveAccess(), {
    accessibleEntries: [],
    restrictedEntries: [],
    restrictedState: STUDY_INSIGHT_ACCESS_STATES.AVAILABLE
  })
  const history = [entry(0), entry(1)]
  const access = getStudyInsightArchiveAccess({
    accessPolicy: {
      featureAccess: {},
      limits: { studyInsights: 0 },
      effectiveEntitlementState: PLUS_ENTITLEMENT_STATES.FREE
    },
    history
  })
  assert.deepEqual(access.accessibleEntries, [])
  assert.deepEqual(access.restrictedEntries, history)
})
