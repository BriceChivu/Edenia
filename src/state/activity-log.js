import { budgetRecentEntries } from './storage-budget.js'
import { isValidTimestamp } from '../core/date-keys.js'
import { t } from '../i18n/runtime.js'

export const ACTIVITY_LOG_LIMIT = 500
export const ACTIVITY_LOG_BYTE_LIMIT = 128 * 1024
export const ACTIVITY_LOG_DEDUPE_WINDOW_MS = 30 * 60_000

// Activity entries have immutable IDs. Independent additions can be combined,
// but edits, clearing and reordering existing history still require a choice.
export function mergeActivityLogAdditions(base, desired, current) {
  const valid = entries => Array.isArray(entries) && entries.every(entry => entry
    && typeof entry.id === 'string' && entry.id && isValidTimestamp(entry.createdAt))
    && new Set(entries.map(entry => entry.id)).size === entries.length
  if (![base, desired, current].every(valid)) return null
  const baselineIds = new Set(base.map(entry => entry.id))
  function additions(entries) {
    const firstExisting = entries.findIndex(entry => baselineIds.has(entry.id))
    const count = firstExisting === -1 ? entries.length : firstExisting
    if (!count) return null
    const retained = entries.slice(count)
    if (JSON.stringify(retained) !== JSON.stringify(base.slice(0, retained.length))) return null
    return { added: entries.slice(0, count), retained: retained.length }
  }
  const left = additions(desired)
  const right = additions(current)
  if (!left || !right) return null
  const merged = new Map()
  for (const entry of [...right.added, ...left.added]) {
    if (merged.has(entry.id) && JSON.stringify(merged.get(entry.id)) !== JSON.stringify(entry)) return null
    merged.set(entry.id, entry)
  }
  const entries = [...merged.values(), ...base.slice(0, Math.min(left.retained, right.retained))]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, ACTIVITY_LOG_LIMIT)
  return budgetRecentEntries(entries, { maxBytes: ACTIVITY_LOG_BYTE_LIMIT })
}

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

  const bounded = budgetRecentEntries(normalized, { maxBytes: ACTIVITY_LOG_BYTE_LIMIT })
  const changed = !Array.isArray(state.activityLog) || JSON.stringify(state.activityLog) !== JSON.stringify(bounded)
  state.activityLog = bounded
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
  state.activityLog = budgetRecentEntries(state.activityLog, { maxBytes: ACTIVITY_LOG_BYTE_LIMIT })
  return nextEntry
}
