import { toDateKey } from '../../core/date-keys.js'
import { experienceFromSeconds } from '../../domain/experience.js'

const DAY_MS = 86_400_000
export const HISTORY_CHART_UNITS = ['day', 'week', 'month', 'year']

export function chartDayFromKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const timestamp = Date.parse(`${key}T00:00:00Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === key
    ? timestamp / DAY_MS : null
}

export function chartDateKey(day) {
  return new Date(Math.floor(day) * DAY_MS).toISOString().slice(0, 10)
}

function count(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0
}

function emptyDay(day) {
  return { day, video: 0, anki: 0, seconds: 0, reviews: 0, hasExperience: false }
}

// Calendar ordinals retain the recorded Study day and avoid DST-sized days.
// Restricted facts never enter the series, its bounds, or the overview.
export function buildHistoryChartData(state, { todayKey, cutoffKey = null, getVideoEntries }) {
  const today = chartDayFromKey(todayKey)
  const cutoff = chartDayFromKey(cutoffKey)
  const records = new Map()
  function bucket(key) {
    const day = chartDayFromKey(key)
    if (day === null || day > today || (cutoff !== null && day < cutoff)) return null
    if (!records.has(day)) records.set(day, emptyDay(day))
    return records.get(day)
  }
  for (const video of Object.values(state?.videos || {})) {
    for (const entry of getVideoEntries(video)) {
      const date = new Date(entry.watchedAt)
      const key = chartDayFromKey(entry.studyDay) !== null
        ? entry.studyDay : Number.isFinite(+date) ? toDateKey(date) : null
      const row = bucket(key)
      if (!row) continue
      row.video += experienceFromSeconds(count(entry.experienceSeconds))
      row.seconds += count(entry.seconds)
      row.hasExperience ||= entry.experienceSeconds !== undefined
    }
  }
  for (const [key, entry] of Object.entries(state?.anki || {})) {
    const row = bucket(key)
    if (!row) continue
    row.anki += count(entry.experienceReviews)
    row.reviews += count(entry.reviewed)
    row.hasExperience ||= entry.experienceReviews !== undefined
  }
  let oldest = today - 29
  for (const recordedDay of records.keys()) oldest = Math.min(oldest, recordedDay)
  const start = cutoff === null ? oldest : Math.max(cutoff, oldest)
  const end = today + 1
  return {
    start, end,
    days: Array.from({ length: end - start }, (_, i) => records.get(start + i) || emptyDay(start + i))
  }
}

function periodStart(day, unit) {
  if (unit === 'day') return day
  const date = new Date(day * DAY_MS)
  if (unit === 'week') return day - (date.getUTCDay() + 6) % 7
  return Date.UTC(date.getUTCFullYear(), unit === 'month' ? date.getUTCMonth() : 0, 1) / DAY_MS
}

function periodEnd(start, unit) {
  if (unit === 'day') return start + 1
  if (unit === 'week') return start + 7
  const date = new Date(start * DAY_MS)
  return Date.UTC(date.getUTCFullYear() + (unit === 'year' ? 1 : 0),
    unit === 'month' ? date.getUTCMonth() + 1 : 0, 1) / DAY_MS
}

export function groupHistoryChartDays(days, unit) {
  const groups = []
  for (const row of days) {
    const start = periodStart(row.day, unit)
    let group = groups[groups.length - 1]
    if (!group || group.start !== start) {
      group = { ...emptyDay(start), start, end: periodEnd(start, unit) }
      groups.push(group)
    }
    for (const key of ['video', 'anki', 'seconds', 'reviews']) group[key] += row[key]
    group.hasExperience ||= row.hasExperience
  }
  return groups
}

// Partial weeks/months/years contain only the days actually in view.
export function visibleHistoryChartBuckets(groups, data, start, end) {
  const from = Math.max(data.start, Math.floor(start))
  const to = Math.min(data.end, Math.ceil(end))
  return groups.filter(group => group.start < to && group.end > from).map(group => {
    const clipStart = Math.max(from, group.start)
    const clipEnd = Math.min(to, group.end)
    if (clipStart === group.start && clipEnd === group.end) return { ...group, clipStart, clipEnd }
    const result = { ...emptyDay(group.start), start: group.start, end: group.end, clipStart, clipEnd }
    for (let day = clipStart; day < clipEnd; day++) {
      const row = data.days[day - data.start]
      for (const key of ['video', 'anki', 'seconds', 'reviews']) result[key] += row[key]
      result.hasExperience ||= row.hasExperience
    }
    return result
  })
}

export function clampHistoryChartRange(start, end, bounds) {
  const span = Math.min(bounds.end - bounds.start, Math.max(3, end - start))
  const from = Math.max(bounds.start, Math.min(start, bounds.end - span))
  return { start: from, end: from + span }
}
