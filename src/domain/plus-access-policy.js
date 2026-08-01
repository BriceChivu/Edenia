export const PLUS_ACCESS_TIERS = Object.freeze({
  FREE: 'free',
  PLUS: 'plus'
})

export const PLUS_ENTITLEMENT_STATES = Object.freeze({
  LOADING: 'loading',
  FREE: 'free',
  PLUS: 'plus',
  PAYMENT_PROBLEM: 'payment-problem',
  UNAVAILABLE: 'unavailable'
})

export const PLUS_FEATURE_IDS = Object.freeze({
  COMPLETE_STUDY_HISTORY: 'complete-study-history',
  ALL_STUDY_INSIGHTS: 'all-study-insights',
  UNLIMITED_TRACKED_CHANNELS: 'unlimited-tracked-channels'
})

export const FREE_PLUS_LIMITS = Object.freeze({
  studyHistoryWeeks: 5,
  studyInsights: 5,
  trackedChannels: 5
})

export const PLUS_ACCESS_SOURCES = Object.freeze({
  ENTITLEMENT: 'entitlement',
  LEGACY_UNLOCKED: 'legacy-unlocked',
  SIMULATION: 'simulation'
})

export const PLUS_ACCESS_SIMULATION_QUERY_PARAM = 'plus_access'

const ENTITLEMENT_STATES = new Set(Object.values(PLUS_ENTITLEMENT_STATES))
const FEATURE_IDS = Object.values(PLUS_FEATURE_IDS)
const ACCESS_TIERS = new Set(Object.values(PLUS_ACCESS_TIERS))

function normalizeEntitlementState(value) {
  return ENTITLEMENT_STATES.has(value)
    ? value
    : PLUS_ENTITLEMENT_STATES.UNAVAILABLE
}

function normalizeSimulationTier(value) {
  return ACCESS_TIERS.has(value) ? value : null
}

function featureAccessMap(hasAccess) {
  return Object.freeze(Object.fromEntries(
    FEATURE_IDS.map(featureId => [featureId, hasAccess])
  ))
}

function accessLimits(hasUnrestrictedAccess) {
  if (hasUnrestrictedAccess) {
    return Object.freeze({
      studyHistoryWeeks: null,
      studyInsights: null,
      trackedChannels: null
    })
  }
  return FREE_PLUS_LIMITS
}

export function derivePlusAccessSimulation(
  locationLike,
  { isInternalTest = false, isLocalhost = false } = {}
) {
  if (!isInternalTest && !isLocalhost) return null

  const params = new URLSearchParams(locationLike?.search || '')
  return normalizeSimulationTier(
    params.get(PLUS_ACCESS_SIMULATION_QUERY_PARAM)
  )
}

export function createPlusAccessPolicy({
  entitlementState = PLUS_ENTITLEMENT_STATES.UNAVAILABLE,
  freePlusEnabled = false,
  plusCheckoutEnabled = false,
  simulatedTier = null
} = {}) {
  const normalizedEntitlementState = normalizeEntitlementState(
    entitlementState
  )
  const normalizedSimulationTier = normalizeSimulationTier(simulatedTier)
  const effectiveEntitlementState = normalizedSimulationTier
    || normalizedEntitlementState
  // The billing layer keeps payment problems in this state only during grace.
  const hasPlusEntitlement = [
    PLUS_ENTITLEMENT_STATES.PLUS,
    PLUS_ENTITLEMENT_STATES.PAYMENT_PROBLEM
  ].includes(effectiveEntitlementState)
  const tier = hasPlusEntitlement
    ? PLUS_ACCESS_TIERS.PLUS
    : PLUS_ACCESS_TIERS.FREE
  const restrictionsEnabled = freePlusEnabled === true
    || normalizedSimulationTier !== null
  const hasUnrestrictedAccess = !restrictionsEnabled
    || tier === PLUS_ACCESS_TIERS.PLUS

  return Object.freeze({
    accessSource: normalizedSimulationTier
      ? PLUS_ACCESS_SOURCES.SIMULATION
      : restrictionsEnabled
        ? PLUS_ACCESS_SOURCES.ENTITLEMENT
        : PLUS_ACCESS_SOURCES.LEGACY_UNLOCKED,
    allFeaturesUnlocked: hasUnrestrictedAccess,
    checkoutEnabled: plusCheckoutEnabled === true,
    effectiveEntitlementState,
    enforcesFreeLimits: restrictionsEnabled && !hasUnrestrictedAccess,
    entitlementState: normalizedEntitlementState,
    featureAccess: featureAccessMap(hasUnrestrictedAccess),
    freePlusEnabled: freePlusEnabled === true,
    limits: accessLimits(hasUnrestrictedAccess),
    simulatedTier: normalizedSimulationTier,
    tier
  })
}
