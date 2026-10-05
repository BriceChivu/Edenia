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
      return watchedAt && seconds > 0 ? { watchedAt, seconds } : null
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.watchedAt) - new Date(b.watchedAt))
}
