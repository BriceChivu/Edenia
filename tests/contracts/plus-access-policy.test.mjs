import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPlusAccessPolicy,
  derivePlusAccessSimulation,
  FREE_PLUS_LIMITS,
  PLUS_ACCESS_SIMULATION_QUERY_PARAM,
  PLUS_ACCESS_SOURCES,
  PLUS_ACCESS_TIERS,
  PLUS_ENTITLEMENT_STATES,
  PLUS_FEATURE_IDS
} from '../../src/domain/plus-access-policy.js'

const FEATURE_IDS = Object.values(PLUS_FEATURE_IDS)

function assertEveryFeature(policy, expected) {
  assert.deepEqual(
    policy.featureAccess,
    Object.fromEntries(FEATURE_IDS.map(featureId => [featureId, expected]))
  )
}

test('Plus policy exposes the approved feature identifiers and Free limits', () => {
  assert.deepEqual(PLUS_FEATURE_IDS, {
    COMPLETE_STUDY_HISTORY: 'complete-study-history',
    ALL_STUDY_INSIGHTS: 'all-study-insights',
    UNLIMITED_TRACKED_CHANNELS: 'unlimited-tracked-channels'
  })
  assert.deepEqual(FREE_PLUS_LIMITS, {
    studyHistoryWeeks: 5,
    studyInsights: 5,
    trackedChannels: 5
  })
  assert.deepEqual(PLUS_ENTITLEMENT_STATES, {
    LOADING: 'loading',
    FREE: 'free',
    PLUS: 'plus',
    PAYMENT_PROBLEM: 'payment-problem',
    UNAVAILABLE: 'unavailable'
  })
  assert.equal(PLUS_ACCESS_SIMULATION_QUERY_PARAM, 'plus_access')
})

test('disabled Free restrictions preserve all-unlocked behavior for every entitlement state', () => {
  for (const entitlementState of Object.values(PLUS_ENTITLEMENT_STATES)) {
    const policy = createPlusAccessPolicy({ entitlementState })

    assert.equal(policy.freePlusEnabled, false)
    assert.equal(policy.checkoutEnabled, false)
    assert.equal(policy.entitlementState, entitlementState)
    assert.equal(policy.effectiveEntitlementState, entitlementState)
    assert.equal(policy.accessSource, PLUS_ACCESS_SOURCES.LEGACY_UNLOCKED)
    assert.equal(policy.allFeaturesUnlocked, true)
    assert.equal(policy.enforcesFreeLimits, false)
    assert.equal(
      policy.tier,
      [
        PLUS_ENTITLEMENT_STATES.PLUS,
        PLUS_ENTITLEMENT_STATES.PAYMENT_PROBLEM
      ].includes(entitlementState)
        ? PLUS_ACCESS_TIERS.PLUS
        : PLUS_ACCESS_TIERS.FREE
    )
    assertEveryFeature(policy, true)
    assert.deepEqual(policy.limits, {
      studyHistoryWeeks: null,
      studyInsights: null,
      trackedChannels: null
    })
  }
})

test('enabled Free restrictions honor Plus and payment-problem grace states', () => {
  for (const entitlementState of Object.values(PLUS_ENTITLEMENT_STATES)) {
    const policy = createPlusAccessPolicy({
      entitlementState,
      freePlusEnabled: true
    })
    const hasPlusEntitlement = [
      PLUS_ENTITLEMENT_STATES.PLUS,
      PLUS_ENTITLEMENT_STATES.PAYMENT_PROBLEM
    ].includes(entitlementState)

    assert.equal(policy.freePlusEnabled, true)
    assert.equal(policy.accessSource, PLUS_ACCESS_SOURCES.ENTITLEMENT)
    assert.equal(policy.allFeaturesUnlocked, hasPlusEntitlement)
    assert.equal(policy.enforcesFreeLimits, !hasPlusEntitlement)
    assert.equal(
      policy.tier,
      hasPlusEntitlement
        ? PLUS_ACCESS_TIERS.PLUS
        : PLUS_ACCESS_TIERS.FREE
    )
    assertEveryFeature(policy, hasPlusEntitlement)
    assert.deepEqual(
      policy.limits,
      hasPlusEntitlement
        ? {
            studyHistoryWeeks: null,
            studyInsights: null,
            trackedChannels: null
          }
        : FREE_PLUS_LIMITS
    )
  }
})

test('unknown entitlements fail closed only when Free restrictions are enabled', () => {
  const legacyPolicy = createPlusAccessPolicy({
    entitlementState: 'unexpected-state'
  })
  assert.equal(
    legacyPolicy.entitlementState,
    PLUS_ENTITLEMENT_STATES.UNAVAILABLE
  )
  assert.equal(legacyPolicy.allFeaturesUnlocked, true)

  const restrictedPolicy = createPlusAccessPolicy({
    entitlementState: 'unexpected-state',
    freePlusEnabled: true
  })
  assert.equal(
    restrictedPolicy.entitlementState,
    PLUS_ENTITLEMENT_STATES.UNAVAILABLE
  )
  assert.equal(restrictedPolicy.enforcesFreeLimits, true)
  assertEveryFeature(restrictedPolicy, false)
})

test('checkout activation remains independent from Free restriction activation', () => {
  const checkoutPilot = createPlusAccessPolicy({
    entitlementState: PLUS_ENTITLEMENT_STATES.FREE,
    plusCheckoutEnabled: true
  })
  assert.equal(checkoutPilot.checkoutEnabled, true)
  assert.equal(checkoutPilot.allFeaturesUnlocked, true)
  assert.equal(checkoutPilot.enforcesFreeLimits, false)

  const restrictedCheckout = createPlusAccessPolicy({
    entitlementState: PLUS_ENTITLEMENT_STATES.FREE,
    freePlusEnabled: true,
    plusCheckoutEnabled: true
  })
  assert.equal(restrictedCheckout.checkoutEnabled, true)
  assert.equal(restrictedCheckout.enforcesFreeLimits, true)

  const nonBooleanFlags = createPlusAccessPolicy({
    freePlusEnabled: 'true',
    plusCheckoutEnabled: 'true'
  })
  assert.equal(nonBooleanFlags.freePlusEnabled, false)
  assert.equal(nonBooleanFlags.checkoutEnabled, false)
  assert.equal(nonBooleanFlags.allFeaturesUnlocked, true)
})

test('Free and Plus simulation overrides access only in approved test environments', () => {
  const localFreeSimulation = derivePlusAccessSimulation(
    new URL('http://localhost:8000/?plus_access=free'),
    { isLocalhost: true }
  )
  const internalPlusSimulation = derivePlusAccessSimulation(
    new URL('https://edenia.example/?internal_test=1&plus_access=plus'),
    { isInternalTest: true }
  )
  const publicSimulation = derivePlusAccessSimulation(
    new URL('https://edenia.example/?plus_access=plus'),
    { isInternalTest: false, isLocalhost: false }
  )

  assert.equal(localFreeSimulation, PLUS_ACCESS_TIERS.FREE)
  assert.equal(internalPlusSimulation, PLUS_ACCESS_TIERS.PLUS)
  assert.equal(publicSimulation, null)

  const freePolicy = createPlusAccessPolicy({
    entitlementState: PLUS_ENTITLEMENT_STATES.PLUS,
    simulatedTier: localFreeSimulation
  })
  assert.equal(freePolicy.accessSource, PLUS_ACCESS_SOURCES.SIMULATION)
  assert.equal(freePolicy.simulatedTier, PLUS_ACCESS_TIERS.FREE)
  assert.equal(
    freePolicy.effectiveEntitlementState,
    PLUS_ENTITLEMENT_STATES.FREE
  )
  assert.equal(freePolicy.enforcesFreeLimits, true)
  assertEveryFeature(freePolicy, false)

  const plusPolicy = createPlusAccessPolicy({
    entitlementState: PLUS_ENTITLEMENT_STATES.FREE,
    freePlusEnabled: true,
    simulatedTier: internalPlusSimulation
  })
  assert.equal(plusPolicy.accessSource, PLUS_ACCESS_SOURCES.SIMULATION)
  assert.equal(plusPolicy.simulatedTier, PLUS_ACCESS_TIERS.PLUS)
  assert.equal(
    plusPolicy.effectiveEntitlementState,
    PLUS_ENTITLEMENT_STATES.PLUS
  )
  assert.equal(plusPolicy.allFeaturesUnlocked, true)
  assertEveryFeature(plusPolicy, true)
})

test('simulation requests use exact values and the first query value', () => {
  const environment = { isLocalhost: true }
  assert.equal(
    derivePlusAccessSimulation(
      { search: '?plus_access=free&plus_access=plus' },
      environment
    ),
    PLUS_ACCESS_TIERS.FREE
  )
  assert.equal(
    derivePlusAccessSimulation({ search: '?plus_access=FREE' }, environment),
    null
  )
  assert.equal(
    derivePlusAccessSimulation({ search: '?plus_access=unknown' }, environment),
    null
  )
  assert.equal(derivePlusAccessSimulation({ search: '' }, environment), null)

  const invalidSimulation = createPlusAccessPolicy({
    freePlusEnabled: false,
    simulatedTier: 'unknown'
  })
  assert.equal(invalidSimulation.simulatedTier, null)
  assert.equal(invalidSimulation.allFeaturesUnlocked, true)
})

test('policy results and their nested access data are immutable', () => {
  const policy = createPlusAccessPolicy({ freePlusEnabled: true })
  assert.equal(Object.isFrozen(policy), true)
  assert.equal(Object.isFrozen(policy.featureAccess), true)
  assert.equal(Object.isFrozen(policy.limits), true)
  assert.equal(Object.isFrozen(FREE_PLUS_LIMITS), true)
})
