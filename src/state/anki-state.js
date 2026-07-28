import {
  getAnkiDateKey,
  getCurrentAnkiDateKey,
  isValidTimestamp
} from '../core/date-keys.js'
import {
  normalizeAnkiCount,
  normalizeAnkiEnabled
} from './config-normalization.js'

export function isAnkiEnabled(state) {
  return normalizeAnkiEnabled(state?.config?.ankiEnabled)
}

export function getTrackedAnkiCounts(state, dateKey) {
  const day = state?.anki?.[dateKey] || {}
  return {
    reviewed: normalizeAnkiCount(day.reviewed),
    created: normalizeAnkiCount(day.created)
  }
}

export function normalizeAnkiTrackingConfig(state) {
  if (!state?.config) return false
  let changed = false
  state.config.ankiEnabled = normalizeAnkiEnabled(state.config.ankiEnabled)

  if (state.config.ankiDisabledAt && !isValidTimestamp(state.config.ankiDisabledAt)) {
    state.config.ankiDisabledAt = null
    changed = true
  }

  if (!state.config.ankiEnabled && !state.config.ankiDisabledAt) {
    state.config.ankiDisabledAt = new Date().toISOString()
    changed = true
  }

  if (state.config.ankiEnabled && state.config.ankiDisabledAt) {
    state.config.ankiDisabledAt = null
    changed = true
  }

  if (!state.config.ankiResumeBaselines || typeof state.config.ankiResumeBaselines !== 'object' || Array.isArray(state.config.ankiResumeBaselines)) {
    state.config.ankiResumeBaselines = {}
    changed = true
  }

  const pending = state.config.ankiPendingResumeBaseline
  if (pending && (typeof pending !== 'object' || Array.isArray(pending) || !pending.dateKey)) {
    state.config.ankiPendingResumeBaseline = null
    changed = true
  }

  return changed
}

export function setAnkiResumeBaselineFromStats(state, stats, createdAt = new Date().toISOString()) {
  if (!state?.config || !stats) return null
  const dateKey = stats.ankiDateKey || getAnkiDateKey(new Date(stats.fetchedAt || Date.now()))
  const tracked = getTrackedAnkiCounts(state, dateKey)
  if (!state.config.ankiResumeBaselines || typeof state.config.ankiResumeBaselines !== 'object' || Array.isArray(state.config.ankiResumeBaselines)) {
    state.config.ankiResumeBaselines = {}
  }
  state.config.ankiResumeBaselines[dateKey] = {
    rawReviewed: normalizeAnkiCount(stats.reviewedToday),
    rawCreated: normalizeAnkiCount(stats.newToday),
    trackedReviewed: tracked.reviewed,
    trackedCreated: tracked.created,
    createdAt
  }
  if (state.config.ankiPendingResumeBaseline?.dateKey === dateKey) state.config.ankiPendingResumeBaseline = null
  return state.config.ankiResumeBaselines[dateKey]
}

export function setPendingAnkiResumeBaseline(
  state,
  dateKey = getCurrentAnkiDateKey(),
  createdAt = new Date().toISOString()
) {
  if (!state?.config) return null
  const tracked = getTrackedAnkiCounts(state, dateKey)
  state.config.ankiPendingResumeBaseline = {
    dateKey,
    trackedReviewed: tracked.reviewed,
    trackedCreated: tracked.created,
    createdAt
  }
  return state.config.ankiPendingResumeBaseline
}

export function normalizeAnkiDateKeys(state) {
  if (!state?.anki || typeof state.anki !== 'object' || Array.isArray(state.anki)) return false
  let changed = false

  for (const [dateKey, day] of Object.entries({ ...state.anki })) {
    if (day?.source !== 'ankiconnect' || !day.loggedAt) continue
    const loggedAt = new Date(day.loggedAt)
    if (Number.isNaN(loggedAt.getTime())) continue

    const ankiDateKey = getAnkiDateKey(loggedAt)
    if (ankiDateKey === dateKey) continue

    const existing = state.anki[ankiDateKey]
    state.anki[ankiDateKey] = {
      reviewed: Math.max(existing?.reviewed || 0, day.reviewed || 0),
      created: Math.max(existing?.created || 0, day.created || 0),
      loggedAt: existing?.loggedAt && new Date(existing.loggedAt) > loggedAt ? existing.loggedAt : day.loggedAt,
      source: existing?.source || day.source
    }
    delete state.anki[dateKey]
    changed = true
  }

  return changed
}
