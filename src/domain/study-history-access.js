import {
  addDays,
  dateKeyToLocalDate,
  getWeekStart,
  toDateKey
} from '../core/date-keys.js'
import {
  FREE_PLUS_LIMITS,
  PLUS_ENTITLEMENT_STATES,
  PLUS_FEATURE_IDS
} from './plus-access-policy.js'

export const STUDY_HISTORY_ACCESS_STATES = Object.freeze({
  AVAILABLE: 'available',
  LOCKED: 'locked',
  LOADING: 'loading',
  UNAVAILABLE: 'unavailable'
})

function normalizeLocalDate(value) {
  if (typeof value === 'string') return dateKeyToLocalDate(value)
  return new Date(value)
}

export function getFreeStudyHistoryCutoff(
  currentDate = new Date(),
  historyWeeks = FREE_PLUS_LIMITS.studyHistoryWeeks
) {
  const normalizedWeeks = Number.isInteger(historyWeeks) && historyWeeks > 0
    ? historyWeeks
    : FREE_PLUS_LIMITS.studyHistoryWeeks
  return addDays(getWeekStart(currentDate), -(normalizedWeeks - 1) * 7)
}

export function getStudyHistoryAccessDecision({
  accessPolicy,
  currentDate = new Date(),
  periodStart
} = {}) {
  const normalizedStart = normalizeLocalDate(periodStart)
  if (Number.isNaN(normalizedStart.getTime())) {
    throw new TypeError('Study History access requires a valid period start')
  }

  const historyWeeks = accessPolicy?.limits?.studyHistoryWeeks
    || FREE_PLUS_LIMITS.studyHistoryWeeks
  const cutoff = getFreeStudyHistoryCutoff(currentDate, historyWeeks)
  const cutoffDateKey = toDateKey(cutoff)
  const periodStartDateKey = toDateKey(normalizedStart)

  if (
    periodStartDateKey >= cutoffDateKey
    || accessPolicy?.featureAccess?.[PLUS_FEATURE_IDS.COMPLETE_STUDY_HISTORY]
  ) {
    return Object.freeze({
      cutoffDateKey,
      periodStartDateKey,
      state: STUDY_HISTORY_ACCESS_STATES.AVAILABLE
    })
  }

  const entitlementState = accessPolicy?.effectiveEntitlementState
  const state = entitlementState === PLUS_ENTITLEMENT_STATES.LOADING
    ? STUDY_HISTORY_ACCESS_STATES.LOADING
    : entitlementState === PLUS_ENTITLEMENT_STATES.UNAVAILABLE
      ? STUDY_HISTORY_ACCESS_STATES.UNAVAILABLE
      : STUDY_HISTORY_ACCESS_STATES.LOCKED

  return Object.freeze({ cutoffDateKey, periodStartDateKey, state })
}
