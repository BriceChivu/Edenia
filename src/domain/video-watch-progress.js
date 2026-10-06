import { isValidTimestamp } from '../core/date-keys.js'
import { clampNumber } from '../core/numbers.js'

export function normalizeVideoWatchProgress(progress, duration = null) {
  const entries = Array.isArray(progress) ? progress : []
  const maxSeconds = Number.isFinite(Number(duration)) && Number(duration) > 0
    ? Math.floor(Number(duration))
    : null

  return entries
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => {
      const watchedAt = isValidTimestamp(entry.watchedAt) ? entry.watchedAt : null
      const rawSeconds = Math.floor(Number(entry.seconds || 0))
      const seconds = maxSeconds === null
        ? Math.max(0, rawSeconds)
        : clampNumber(rawSeconds, 0, maxSeconds)
      if (!watchedAt || seconds <= 0) return null
      return {
        watchedAt,
        seconds,
        ...(entry.experienceSeconds === undefined ? {} : {
          experienceSeconds: clampNumber(Math.floor(Number(entry.experienceSeconds) || 0), 0, seconds)
        }),
        ...(typeof entry.studyDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.studyDay) ? { studyDay: entry.studyDay } : {})
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.watchedAt) - new Date(b.watchedAt))
}
