import { clampNumber } from '../core/numbers.js'

export function normalizeVideoWatchCoverage(ranges, duration = null) {
  const maxSeconds = Number.isFinite(Number(duration)) && Number(duration) > 0
    ? Number(duration)
    : null
  const normalized = (Array.isArray(ranges) ? ranges : [])
    .filter(range => range && typeof range === 'object')
    .map(range => {
      const rawStart = Number(range.start)
      const rawEnd = Number(range.end)
      if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return null
      const start = maxSeconds === null
        ? Math.max(0, rawStart)
        : clampNumber(rawStart, 0, maxSeconds)
      const end = maxSeconds === null
        ? Math.max(0, rawEnd)
        : clampNumber(rawEnd, 0, maxSeconds)
      if (end <= start) return null
      return {
        start: Math.round(start * 1000) / 1000,
        end: Math.round(end * 1000) / 1000
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start || left.end - right.end)

  return normalized.reduce((merged, range) => {
    const previous = merged[merged.length - 1]
    if (!previous || range.start > previous.end + 0.001) {
      merged.push({ ...range })
      return merged
    }
    previous.end = Math.max(previous.end, range.end)
    return merged
  }, [])
}

export function getVideoWatchCoverageSeconds(ranges, duration = null) {
  return normalizeVideoWatchCoverage(ranges, duration)
    .reduce((total, range) => total + (range.end - range.start), 0)
}

export function addVideoWatchCoverageRange(
  ranges,
  start,
  end,
  duration = null
) {
  return normalizeVideoWatchCoverage([
    ...normalizeVideoWatchCoverage(ranges, duration),
    { start, end }
  ], duration)
}
