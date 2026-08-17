import { isValidTimestamp } from '../core/date-keys.js'
import { clampNumber } from '../core/numbers.js'

function isValidStudyDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const [year, month, day] = String(value).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

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
      if (!watchedAt || seconds < 1) return null
      const id = typeof entry.id === 'string' && entry.id.trim()
        ? entry.id.trim()
        : null
      const studyDay = isValidStudyDay(entry.studyDay)
        ? entry.studyDay
        : null
      return {
        ...(id ? { id } : {}),
        ...(studyDay ? { studyDay } : {}),
        watchedAt,
        seconds
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.watchedAt) - new Date(b.watchedAt))
}
