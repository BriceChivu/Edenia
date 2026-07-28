import { isValidTimestamp } from '../core/date-keys.js'

export const ONBOARDING_VERSION = 2

export function normalizeOnboardingState(state) {
  if (!state) return false
  const existing = state.onboarding && typeof state.onboarding === 'object' && !Array.isArray(state.onboarding)
    ? state.onboarding
    : {}
  const legacyCompleted = existing.completed === true
  const setupCompleted = existing.setupCompleted === true || legacyCompleted
  const walkthroughCompleted = existing.walkthroughCompleted === true || legacyCompleted
  const setupCompletedAt = setupCompleted
    ? (isValidTimestamp(existing.setupCompletedAt) ? existing.setupCompletedAt : (isValidTimestamp(existing.completedAt) ? existing.completedAt : null))
    : null
  const normalized = {
    version: Number.isInteger(existing.version) ? existing.version : ONBOARDING_VERSION,
    introSeenAt: isValidTimestamp(existing.introSeenAt) ? existing.introSeenAt : setupCompletedAt,
    setupCompleted,
    setupCompletedAt,
    walkthroughCompleted,
    walkthroughCompletedAt: walkthroughCompleted
      ? (isValidTimestamp(existing.walkthroughCompletedAt) ? existing.walkthroughCompletedAt : (isValidTimestamp(existing.completedAt) ? existing.completedAt : null))
      : null,
    levelUpGuidanceShownAt: isValidTimestamp(existing.levelUpGuidanceShownAt) ? existing.levelUpGuidanceShownAt : null,
    recommendationsAppliedAt: isValidTimestamp(existing.recommendationsAppliedAt) ? existing.recommendationsAppliedAt : null
  }
  const changed = JSON.stringify(existing) !== JSON.stringify(normalized)
  state.onboarding = normalized
  return changed
}
