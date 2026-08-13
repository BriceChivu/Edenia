import { isValidTimestamp } from '../core/date-keys.js'

export const ONBOARDING_VERSION = 2
export const STARTER_FEED_CHANNEL_LIMIT = 5

const STARTER_FEED_STATUSES = new Set([
  'idle',
  'pending',
  'running',
  'complete',
  'partial',
  'failed'
])

function normalizeCatalogIds(value, allowedIds = null) {
  const ids = Array.isArray(value)
    ? [...new Set(value.map(String).map(id => id.trim()).filter(Boolean))]
    : []
  const filtered = allowedIds
    ? ids.filter(id => allowedIds.has(id))
    : ids
  return filtered.slice(0, STARTER_FEED_CHANNEL_LIMIT)
}

function normalizeCount(value) {
  return Math.max(0, Math.floor(Number(value) || 0))
}

export function createPendingStarterFeed(catalogIds, queuedAt = new Date().toISOString()) {
  const normalizedCatalogIds = normalizeCatalogIds(catalogIds)
  if (!normalizedCatalogIds.length) return createIdleStarterFeed()
  return {
    status: 'pending',
    catalogIds: normalizedCatalogIds,
    processedCatalogIds: [],
    failedCatalogIds: [],
    addedChannelCount: 0,
    mergedVideoCount: 0,
    skippedShortCount: 0,
    queuedAt: isValidTimestamp(queuedAt) ? queuedAt : null,
    startedAt: null,
    completedAt: null
  }
}

function createIdleStarterFeed() {
  return {
    status: 'idle',
    catalogIds: [],
    processedCatalogIds: [],
    failedCatalogIds: [],
    addedChannelCount: 0,
    mergedVideoCount: 0,
    skippedShortCount: 0,
    queuedAt: null,
    startedAt: null,
    completedAt: null
  }
}

function normalizeStarterFeed(existing) {
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    return createIdleStarterFeed()
  }
  const catalogIds = normalizeCatalogIds(existing.catalogIds)
  if (!catalogIds.length) return createIdleStarterFeed()

  const allowedIds = new Set(catalogIds)
  const processedCatalogIds = normalizeCatalogIds(existing.processedCatalogIds, allowedIds)
  const processedIds = new Set(processedCatalogIds)
  const failedCatalogIds = normalizeCatalogIds(existing.failedCatalogIds, processedIds)
  const hasIncompleteChannels = processedCatalogIds.length < catalogIds.length
  let status = STARTER_FEED_STATUSES.has(existing.status) ? existing.status : 'pending'
  if (status === 'idle' || (hasIncompleteChannels && ['complete', 'partial', 'failed'].includes(status))) {
    status = 'pending'
  }

  return {
    status,
    catalogIds,
    processedCatalogIds,
    failedCatalogIds,
    addedChannelCount: normalizeCount(existing.addedChannelCount),
    mergedVideoCount: normalizeCount(existing.mergedVideoCount),
    skippedShortCount: normalizeCount(existing.skippedShortCount),
    queuedAt: isValidTimestamp(existing.queuedAt) ? existing.queuedAt : null,
    startedAt: isValidTimestamp(existing.startedAt) ? existing.startedAt : null,
    completedAt: ['complete', 'partial', 'failed'].includes(status) && isValidTimestamp(existing.completedAt)
      ? existing.completedAt
      : null
  }
}

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
    accountStepReachedAt: !setupCompleted && isValidTimestamp(existing.accountStepReachedAt)
      ? existing.accountStepReachedAt
      : null,
    setupCompleted,
    setupCompletedAt,
    walkthroughCompleted,
    walkthroughCompletedAt: walkthroughCompleted
      ? (isValidTimestamp(existing.walkthroughCompletedAt) ? existing.walkthroughCompletedAt : (isValidTimestamp(existing.completedAt) ? existing.completedAt : null))
      : null,
    levelUpGuidanceShownAt: isValidTimestamp(existing.levelUpGuidanceShownAt) ? existing.levelUpGuidanceShownAt : null,
    recommendationsAppliedAt: isValidTimestamp(existing.recommendationsAppliedAt) ? existing.recommendationsAppliedAt : null,
    starterFeed: normalizeStarterFeed(existing.starterFeed)
  }
  const changed = JSON.stringify(existing) !== JSON.stringify(normalized)
  state.onboarding = normalized
  return changed
}
