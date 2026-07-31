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

export function isStudyInsightsEnabled(state) {
  return state?.config?.studyInsights?.enabled !== false
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
        recordedAt: new Date(entry.recordedAt).toISOString()
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
    enabled: existing.enabled !== false,
    collapsed: existing.collapsed === true,
    history
  }
  const changed = JSON.stringify(existing) !== JSON.stringify(normalized)
  state.config.studyInsights = normalized
  return changed
}
