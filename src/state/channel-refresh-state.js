import { isValidTimestamp } from '../core/date-keys.js'

export function normalizeChannelRefreshState(state) {
  if (!state) return false
  let changed = false
  const existing = state.channelRefreshes && typeof state.channelRefreshes === 'object' && !Array.isArray(state.channelRefreshes)
    ? state.channelRefreshes
    : {}
  const legacyLastFetched = isValidTimestamp(state.lastFetched) ? state.lastFetched : null
  const channelIds = new Set((state.config?.channels || []).map(channel => channel.id).filter(Boolean))
  const normalized = {}

  channelIds.forEach(channelId => {
    const entry = existing[channelId]
    const lastFetchedAt = isValidTimestamp(entry?.lastFetchedAt)
      ? entry.lastFetchedAt
      : legacyLastFetched
    const lastFailedAt = isValidTimestamp(entry?.lastFailedAt) ? entry.lastFailedAt : null
    const lastError = typeof entry?.lastError === 'string' ? entry.lastError : null
    if (lastFetchedAt) {
      normalized[channelId] = {
        lastFetchedAt,
        lastError,
        lastFailedAt
      }
    } else if (entry) {
      normalized[channelId] = {
        lastFetchedAt: null,
        lastError,
        lastFailedAt
      }
    }
  })

  if (JSON.stringify(existing) !== JSON.stringify(normalized)) changed = true
  if ('lastFetched' in state) changed = true
  state.channelRefreshes = normalized
  delete state.lastFetched
  return changed
}
