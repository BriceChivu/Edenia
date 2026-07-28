import {
  dateKeyToLocalDate,
  isValidTimestamp,
  toDateKey
} from '../core/date-keys.js'

export function getEdeniaProfileCreatedAt(state) {
  if (isValidTimestamp(state?.onboarding?.setupCompletedAt)) return state.onboarding.setupCompletedAt
  if (isValidTimestamp(state?.learnerProfile?.createdAt)) return state.learnerProfile.createdAt
  return null
}

export function isValidEdeniaDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const date = dateKeyToLocalDate(value)
  return Number.isFinite(date.getTime()) && toDateKey(date) === value
}

export function normalizeNoAnkiFrequentUserPromptState(state) {
  if (!state) return false
  const existing = state.noAnkiFrequentUserPrompt
  const source = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}
  const profileCreatedAt = getEdeniaProfileCreatedAt(state)
  const profileCreatedAtMs = profileCreatedAt ? new Date(profileCreatedAt).getTime() : null
  const profileDateKey = profileCreatedAt ? toDateKey(new Date(profileCreatedAt)) : null
  const watchedVideoDateKeys = new Set()

  const addDateKey = dateKey => {
    if (!isValidEdeniaDateKey(dateKey)) return
    if (profileDateKey && dateKey < profileDateKey) return
    watchedVideoDateKeys.add(dateKey)
  }
  const addWatchedTimestamp = timestamp => {
    if (!isValidTimestamp(timestamp)) return
    const watchedAtMs = new Date(timestamp).getTime()
    if (profileCreatedAtMs !== null && watchedAtMs < profileCreatedAtMs) return
    addDateKey(toDateKey(new Date(timestamp)))
  }

  ;(Array.isArray(source.watchedVideoDateKeys) ? source.watchedVideoDateKeys : []).forEach(addDateKey)
  Object.values(state.videos || {}).forEach(video => addWatchedTimestamp(video?.watchedAt))
  ;(Array.isArray(state.activityLog) ? state.activityLog : [])
    .filter(entry => entry?.type === 'video-status' && entry.meta?.status === 'watched')
    .forEach(entry => addWatchedTimestamp(entry.createdAt))

  const response = ['yes', 'not-interested'].includes(source.response) ? source.response : null
  const normalized = {
    watchedVideoDateKeys: [...watchedVideoDateKeys].sort(),
    response,
    respondedAt: response && isValidTimestamp(source.respondedAt) ? source.respondedAt : null
  }
  const changed = JSON.stringify(source) !== JSON.stringify(normalized)
  state.noAnkiFrequentUserPrompt = normalized
  return changed
}

export function recordNoAnkiFrequentUserWatchedDate(state, watchedAt) {
  if (!state || !isValidTimestamp(watchedAt)) return
  normalizeNoAnkiFrequentUserPromptState(state)
  const profileCreatedAt = getEdeniaProfileCreatedAt(state)
  if (!profileCreatedAt || new Date(watchedAt) < new Date(profileCreatedAt)) return
  const dateKey = toDateKey(new Date(watchedAt))
  if (!isValidEdeniaDateKey(dateKey)) return
  state.noAnkiFrequentUserPrompt.watchedVideoDateKeys = [
    ...new Set([...state.noAnkiFrequentUserPrompt.watchedVideoDateKeys, dateKey])
  ].sort()
}

export function hasRecordedAnkiDataSinceProfileCreation(state) {
  const profileCreatedAt = getEdeniaProfileCreatedAt(state)
  if (!profileCreatedAt) return false
  const profileCreatedAtMs = new Date(profileCreatedAt).getTime()
  const profileDateKey = toDateKey(new Date(profileCreatedAt))

  return Object.entries(state?.anki || {}).some(([dateKey, day]) => {
    if (!day || typeof day !== 'object') return false
    if (isValidTimestamp(day.loggedAt)) return new Date(day.loggedAt).getTime() >= profileCreatedAtMs
    return isValidEdeniaDateKey(dateKey) && dateKey >= profileDateKey
  })
}
