import { isValidTimestamp } from '../core/date-keys.js'
import { clampNumber } from '../core/numbers.js'

export const STUDY_INSIGHT_LOOKBACK_DAYS = 42
export const STUDY_INSIGHT_TIME_WINDOWS = [
  { id: 'morning', startHour: 5, endHour: 12 },
  { id: 'afternoon', startHour: 12, endHour: 17 },
  { id: 'evening', startHour: 17, endHour: 22 },
  { id: 'night', startHour: 22, endHour: 5 }
]
export const STUDY_INSIGHT_VARIANT_COUNT = 2

const STUDY_INSIGHT_TYPES = [
  'weekly-summary',
  'preferred-window',
  'morning-opportunity',
  'reliable-weekday',
  'weekend-opportunity',
  'momentum-up',
  'momentum-reset',
  'routine-reset',
  'routine-return',
  'anki-fallback',
  'steady-process'
]

export function isStudyInsightsEnabled() {
  return true
}

// These are automatically generated summaries, not the underlying study facts.
// Keep the newest observation per key, as normalization does, without turning
// different rendering times into a learner-facing progress choice.
export function mergeStudyInsightHistoryChanges(base, desired, current) {
  const valid = entries => Array.isArray(entries) && entries.every(entry => entry
    && typeof entry === 'object' && !Array.isArray(entry)
    && typeof entry.key === 'string' && isValidTimestamp(entry.recordedAt))
  if (![base, desired, current].every(valid)) return null
  const prior = new Map(base.map(entry => [entry.key, entry]))
  const left = new Map(desired.map(entry => [entry.key, entry]))
  const right = new Map(current.map(entry => [entry.key, entry]))
  const merged = []
  for (const key of new Set([...prior.keys(), ...left.keys(), ...right.keys()])) {
    const before = prior.get(key)
    const a = left.get(key)
    const b = right.get(key)
    if (before && (!a || !b)) {
      const remaining = a || b
      if (remaining && JSON.stringify(remaining) !== JSON.stringify(before)) return null
      continue
    }
    const entries = [a, b].filter(Boolean)
    entries.sort((x, y) => new Date(y.recordedAt) - new Date(x.recordedAt)
      || JSON.stringify(y).localeCompare(JSON.stringify(x)))
    const chosen = { ...entries[0] }
    const first = [...entries, ...(before ? [before] : [])]
      .map(entry => isValidTimestamp(entry.firstRecordedAt) ? entry.firstRecordedAt : entry.recordedAt)
      .sort((x, y) => new Date(x) - new Date(y))[0]
    chosen.firstRecordedAt = first
    merged.push(chosen)
  }
  return merged.sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt) || a.key.localeCompare(b.key))
}

export function normalizeStudyInsightConfig(state) {
  if (!state?.config) return false
  const existing = state.config.studyInsights && typeof state.config.studyInsights === 'object' && !Array.isArray(state.config.studyInsights)
    ? state.config.studyInsights
    : {}
  const legacyVariantCounts = new Map()
  const history = (Array.isArray(existing.history) ? existing.history : [])
    .filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map(entry => {
      const type = STUDY_INSIGHT_TYPES.includes(entry.type)
        ? entry.type
        : null
      const windowId = STUDY_INSIGHT_TIME_WINDOWS.some(window => window.id === entry.windowId)
        ? entry.windowId
        : null
      if (!entry.key || !type || !isValidTimestamp(entry.recordedAt)) return null
      const recordedAt = new Date(entry.recordedAt).toISOString()
      const firstRecordedAt = isValidTimestamp(entry.firstRecordedAt)
        && new Date(entry.firstRecordedAt) <= new Date(recordedAt)
        ? new Date(entry.firstRecordedAt).toISOString()
        : recordedAt
      return {
        key: String(entry.key).slice(0, 140),
        insightId: String(entry.insightId || '').slice(0, 80),
        type,
        variant: Number.isInteger(entry.variant)
          ? clampNumber(entry.variant, 0, STUDY_INSIGHT_VARIANT_COUNT - 1)
          : null,
        windowId,
        weekdayIndex: Number.isInteger(entry.weekdayIndex) && entry.weekdayIndex >= 0 && entry.weekdayIndex <= 6
          ? entry.weekdayIndex
          : null,
        percent: clampNumber(Math.round(Number(entry.percent) || 0), 0, 100),
        comparisonPercent: Math.max(0, Math.round(Number(entry.comparisonPercent) || 0)),
        recentMinutes: Math.max(0, Math.round(Number(entry.recentMinutes) || 0)),
        previousMinutes: Math.max(0, Math.round(Number(entry.previousMinutes) || 0)),
        suggestedMinutes: clampNumber(Math.round(Number(entry.suggestedMinutes) || 0), 1, 180),
        gapDays: Math.max(0, Math.round(Number(entry.gapDays) || 0)),
        activeDays: Math.max(0, Math.round(Number(entry.activeDays) || 0)),
        ankiDays: Math.max(0, Math.round(Number(entry.ankiDays) || 0)),
        reviewedCards: Math.max(0, Math.round(Number(entry.reviewedCards) || 0)),
        ankiCreated: Math.max(0, Math.round(Number(entry.ankiCreated) || 0)),
        totalSeconds: Math.max(0, Math.round(Number(entry.totalSeconds) || 0)),
        videoCount: Math.max(0, Math.round(Number(entry.videoCount) || 0)),
        topVideoTitle: String(entry.topVideoTitle || '').slice(0, 180),
        topVideoSeconds: Math.max(0, Math.round(Number(entry.topVideoSeconds) || 0)),
        channelBreakdown: (Array.isArray(entry.channelBreakdown) ? entry.channelBreakdown : [])
          .filter(channel => channel && typeof channel === 'object' && !Array.isArray(channel) && channel.name)
          .map(channel => ({
            name: String(channel.name).slice(0, 100),
            seconds: Math.max(0, Math.round(Number(channel.seconds) || 0))
          }))
          .filter(channel => channel.seconds > 0)
          .slice(0, 5),
        observationDays: clampNumber(Math.round(Number(entry.observationDays) || 0), 0, STUDY_INSIGHT_LOOKBACK_DAYS),
        firstRecordedAt,
        recordedAt
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))
    .filter((entry, index, entries) => entries.findIndex(candidate => candidate.key === entry.key) === index)
    .map(entry => {
      if (entry.variant !== null) return entry
      const count = legacyVariantCounts.get(entry.insightId) || 0
      legacyVariantCounts.set(entry.insightId, count + 1)
      return { ...entry, variant: count % STUDY_INSIGHT_VARIANT_COUNT }
    })
  const normalized = {
    enabled: true,
    collapsed: existing.collapsed === true,
    history
  }
  const changed = JSON.stringify(existing) !== JSON.stringify(normalized)
  state.config.studyInsights = normalized
  return changed
}
