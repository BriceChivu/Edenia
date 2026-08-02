import {
  FREE_PLUS_LIMITS,
  PLUS_ENTITLEMENT_STATES,
  PLUS_FEATURE_IDS
} from './plus-access-policy.js'

export const STUDY_INSIGHT_ACCESS_STATES = Object.freeze({
  AVAILABLE: 'available',
  LOCKED: 'locked',
  LOADING: 'loading',
  UNAVAILABLE: 'unavailable'
})

function getRestrictedAccessState(accessPolicy) {
  if (
    accessPolicy?.effectiveEntitlementState
    === PLUS_ENTITLEMENT_STATES.LOADING
  ) {
    return STUDY_INSIGHT_ACCESS_STATES.LOADING
  }
  if (
    accessPolicy?.effectiveEntitlementState
    === PLUS_ENTITLEMENT_STATES.UNAVAILABLE
  ) {
    return STUDY_INSIGHT_ACCESS_STATES.UNAVAILABLE
  }
  return STUDY_INSIGHT_ACCESS_STATES.LOCKED
}

function getFirstRecordedAt(entry) {
  const value = entry?.firstRecordedAt || entry?.recordedAt
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY
}

function getFreeInsightKeys(history, limit) {
  return new Set(
    history
      .map((entry, index) => ({ entry, index }))
      .sort((left, right) => (
        getFirstRecordedAt(left.entry) - getFirstRecordedAt(right.entry)
        || String(left.entry?.key || '').localeCompare(
          String(right.entry?.key || '')
        )
        || left.index - right.index
      ))
      .slice(0, limit)
      .map(({ entry }) => String(entry?.key || ''))
      .filter(Boolean)
  )
}

export function getStudyInsightArchiveAccess({
  accessPolicy,
  history = []
} = {}) {
  const entries = Array.isArray(history) ? history : []
  if (
    accessPolicy?.featureAccess?.[PLUS_FEATURE_IDS.ALL_STUDY_INSIGHTS]
  ) {
    return Object.freeze({
      accessibleEntries: Object.freeze([...entries]),
      restrictedEntries: Object.freeze([]),
      restrictedState: STUDY_INSIGHT_ACCESS_STATES.AVAILABLE
    })
  }

  const configuredLimit = accessPolicy?.limits?.studyInsights
  const limit = Number.isInteger(configuredLimit) && configuredLimit >= 0
    ? configuredLimit
    : FREE_PLUS_LIMITS.studyInsights
  const freeKeys = getFreeInsightKeys(entries, limit)
  const accessibleEntries = entries.filter(entry => (
    freeKeys.has(String(entry?.key || ''))
  ))
  const restrictedEntries = entries.filter(entry => (
    !freeKeys.has(String(entry?.key || ''))
  ))

  return Object.freeze({
    accessibleEntries: Object.freeze(accessibleEntries),
    restrictedEntries: Object.freeze(restrictedEntries),
    restrictedState: restrictedEntries.length
      ? getRestrictedAccessState(accessPolicy)
      : STUDY_INSIGHT_ACCESS_STATES.AVAILABLE
  })
}

export function getStudyInsightAccessDecision({
  accessPolicy,
  history = [],
  insightKey
} = {}) {
  const key = String(insightKey || '')
  const archive = getStudyInsightArchiveAccess({ accessPolicy, history })
  if (archive.accessibleEntries.some(entry => String(entry?.key || '') === key)) {
    return STUDY_INSIGHT_ACCESS_STATES.AVAILABLE
  }
  if (archive.restrictedEntries.some(entry => String(entry?.key || '') === key)) {
    return archive.restrictedState
  }
  return accessPolicy?.featureAccess?.[PLUS_FEATURE_IDS.ALL_STUDY_INSIGHTS]
    ? STUDY_INSIGHT_ACCESS_STATES.AVAILABLE
    : getRestrictedAccessState(accessPolicy)
}
