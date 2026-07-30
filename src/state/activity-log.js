import { isValidTimestamp } from '../core/date-keys.js'
import { t } from '../i18n/runtime.js'

export const ACTIVITY_LOG_LIMIT = 500
export const ACTIVITY_LOG_DEDUPE_WINDOW_MS = 30 * 60_000

export function makeActivityLogId() {
  const now = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `${now}-${random}`
}

export function normalizeActivityLogState(state) {
  if (!state) return false
  const existing = Array.isArray(state.activityLog) ? state.activityLog : []
  const normalized = existing
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => {
      const createdAt = isValidTimestamp(entry.createdAt) ? entry.createdAt : new Date().toISOString()
      const normalizedEntry = {
        id: typeof entry.id === 'string' && entry.id ? entry.id : makeActivityLogId(),
        createdAt,
        actor: entry.actor === 'auto' ? 'auto' : 'user',
        type: typeof entry.type === 'string' && entry.type ? entry.type : 'general',
        status: ['success', 'warn', 'error', 'info'].includes(entry.status) ? entry.status : 'info',
        title: typeof entry.title === 'string' && entry.title ? entry.title : t('settings.activity.title'),
        detail: typeof entry.detail === 'string' ? entry.detail : ''
      }
      if (entry.meta && typeof entry.meta === 'object' && !Array.isArray(entry.meta)) {
        normalizedEntry.meta = entry.meta
      }
      return normalizedEntry
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, ACTIVITY_LOG_LIMIT)

  const changed = !Array.isArray(state.activityLog) || JSON.stringify(state.activityLog) !== JSON.stringify(normalized)
  state.activityLog = normalized
  return changed
}

export function appendActivityLog(state, entry = {}) {
  if (!state) return null
  normalizeActivityLogState(state)
  const nextEntry = {
    id: makeActivityLogId(),
    createdAt: isValidTimestamp(entry.createdAt) ? entry.createdAt : new Date().toISOString(),
    actor: entry.actor === 'auto' ? 'auto' : 'user',
    type: typeof entry.type === 'string' && entry.type ? entry.type : 'general',
    status: ['success', 'warn', 'error', 'info'].includes(entry.status) ? entry.status : 'info',
    title: typeof entry.title === 'string' && entry.title ? entry.title : t('settings.activity.title'),
    detail: typeof entry.detail === 'string' ? entry.detail : ''
  }
  if (entry.meta && typeof entry.meta === 'object' && !Array.isArray(entry.meta)) {
    nextEntry.meta = entry.meta
  }

  const previousMatch = state.activityLog.find(item =>
    item.type === nextEntry.type &&
    item.status === nextEntry.status &&
    item.detail === nextEntry.detail
  )
  if (
    previousMatch &&
    isValidTimestamp(previousMatch.createdAt) &&
    new Date(nextEntry.createdAt).getTime() - new Date(previousMatch.createdAt).getTime() < ACTIVITY_LOG_DEDUPE_WINDOW_MS
  ) {
    return null
  }

  state.activityLog.unshift(nextEntry)
  if (state.activityLog.length > ACTIVITY_LOG_LIMIT) {
    state.activityLog.splice(ACTIVITY_LOG_LIMIT)
  }
  return nextEntry
}
