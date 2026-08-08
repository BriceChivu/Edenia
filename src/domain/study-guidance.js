import {
  addDays,
  dateKeyToLocalDate,
  getWeekStart,
  toDateKey
} from '../core/date-keys.js'

export const STUDY_GUIDANCE_VERSION = 1
export const STUDY_GUIDANCE_LOOKBACK_DAYS = 42

const MAX_COMPLETE_WEEKS = 4
const MIN_COMPLETE_WEEKS = 2
const MIN_OPPORTUNITY_SUCCESSES = 2
const MIN_COMPARISON_SECONDS = 15 * 60
const MIN_COMPARISON_RATIO = 0.25

function median(values) {
  const sorted = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function normalizeDateKey(value) {
  const dateKey = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return ''
  const date = dateKeyToLocalDate(dateKey)
  return Number.isFinite(date.getTime()) && toDateKey(date) === dateKey
    ? dateKey
    : ''
}

function normalizeStudyDays(studyDays, referenceDateKey) {
  const days = new Map()
  ;(Array.isArray(studyDays) ? studyDays : []).forEach(day => {
    const dateKey = normalizeDateKey(day?.dateKey)
    if (!dateKey || dateKey > referenceDateKey) return
    const current = days.get(dateKey) || {
      dateKey,
      videoSeconds: 0
    }
    current.videoSeconds += Math.max(0, Math.round(Number(day?.videoSeconds) || 0))
    days.set(dateKey, current)
  })
  return days
}

function getWeekStartKey(dateKey) {
  return toDateKey(getWeekStart(dateKeyToLocalDate(dateKey)))
}

function getWeekDayKeys(weekStartKey) {
  const start = dateKeyToLocalDate(weekStartKey)
  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(start, index)))
}

function getWeekSummary(days, weekStartKey, lastDayOffset = 6) {
  const dateKeys = getWeekDayKeys(weekStartKey).slice(0, lastDayOffset + 1)
  return dateKeys.reduce((summary, dateKey) => {
    const day = days.get(dateKey)
    if (!day) return summary
    summary.videoSeconds += day.videoSeconds
    if (day.videoSeconds > 0) summary.videoDays += 1
    return summary
  }, {
    weekStartKey,
    videoSeconds: 0,
    videoDays: 0
  })
}

function getCompleteWeekStarts(days, referenceDateKey) {
  const firstVideoDateKey = Array.from(days.values())
    .filter(day => day.videoSeconds > 0)
    .map(day => day.dateKey)
    .sort()[0]
  if (!firstVideoDateKey) return []

  const currentWeekStartKey = getWeekStartKey(referenceDateKey)
  const firstVideoDate = dateKeyToLocalDate(firstVideoDateKey)
  let eligibleStart = getWeekStart(firstVideoDate)
  if (firstVideoDate.getDay() !== 1) eligibleStart = addDays(eligibleStart, 7)

  const starts = []
  while (toDateKey(eligibleStart) < currentWeekStartKey) {
    starts.push(toDateKey(eligibleStart))
    eligibleStart = addDays(eligibleStart, 7)
  }
  return starts.slice(-MAX_COMPLETE_WEEKS)
}

function getTypicalActiveDaySeconds(days, referenceDateKey) {
  const referenceDate = dateKeyToLocalDate(referenceDateKey)
  const lookbackStartKey = toDateKey(addDays(
    referenceDate,
    -(STUDY_GUIDANCE_LOOKBACK_DAYS - 1)
  ))
  return median(Array.from(days.values())
    .filter(day => (
      day.dateKey >= lookbackStartKey
      && day.dateKey <= referenceDateKey
      && day.videoSeconds > 0
    ))
    .map(day => day.videoSeconds))
}

function getFriendlyMinutes(seconds) {
  const rawMinutes = Math.max(1, Number(seconds) / 60)
  const rounded = Math.round(rawMinutes / 5) * 5
  return Math.max(10, Math.min(30, rounded || 10))
}

function getOpportunity({ days, completeWeekStarts, referenceDateKey }) {
  const referenceDate = dateKeyToLocalDate(referenceDateKey)
  const currentDay = days.get(referenceDateKey)
  const candidates = Array.from({ length: 7 }, (_, offset) => {
    const weekdayIndex = (offset + 1) % 7
    const successfulSeconds = completeWeekStarts
      .map(weekStartKey => {
        const dayKey = getWeekDayKeys(weekStartKey)[offset]
        return days.get(dayKey)?.videoSeconds || 0
      })
      .filter(seconds => seconds > 0)
    const successfulWeeks = successfulSeconds.length
    const daysUntil = (weekdayIndex - referenceDate.getDay() + 7) % 7
    return {
      weekdayIndex,
      successfulWeeks,
      observedWeeks: completeWeekStarts.length,
      activeRate: successfulWeeks / completeWeekStarts.length,
      daysUntil,
      suggestedMinutes: getFriendlyMinutes(median(successfulSeconds))
    }
  }).filter(candidate => (
    candidate.successfulWeeks >= MIN_OPPORTUNITY_SUCCESSES
    && candidate.activeRate <= 0.75
    && !(candidate.daysUntil === 0 && (currentDay?.videoSeconds || 0) > 0)
  ))

  candidates.sort((left, right) => (
    left.daysUntil - right.daysUntil
    || left.activeRate - right.activeRate
    || left.weekdayIndex - right.weekdayIndex
  ))
  const opportunity = candidates[0]
  if (!opportunity) return null
  return opportunity
}

export function buildStudyGuidance({
  studyDays = [],
  referenceDateKey
} = {}) {
  const normalizedReferenceDateKey = normalizeDateKey(referenceDateKey)
  if (!normalizedReferenceDateKey) return null

  const days = normalizeStudyDays(studyDays, normalizedReferenceDateKey)
  const completeWeekStarts = getCompleteWeekStarts(
    days,
    normalizedReferenceDateKey
  )
  if (completeWeekStarts.length < MIN_COMPLETE_WEEKS) return null

  const referenceDate = dateKeyToLocalDate(normalizedReferenceDateKey)
  const currentWeekStartKey = getWeekStartKey(normalizedReferenceDateKey)
  const currentDayOffset = (referenceDate.getDay() + 6) % 7
  const completeWeeks = completeWeekStarts.map(weekStartKey => (
    getWeekSummary(days, weekStartKey)
  ))
  const matchedWeeks = completeWeekStarts.map(weekStartKey => (
    getWeekSummary(days, weekStartKey, currentDayOffset)
  ))
  const currentWeek = getWeekSummary(days, currentWeekStartKey, currentDayOffset)
  const usualWeekSeconds = median(completeWeeks.map(week => week.videoSeconds))
  const usualWeekActiveDays = Math.round(median(
    completeWeeks.map(week => week.videoDays)
  ))
  const usualThroughTodaySeconds = median(
    matchedWeeks.map(week => week.videoSeconds)
  )
  const typicalActiveDaySeconds = getTypicalActiveDaySeconds(
    days,
    normalizedReferenceDateKey
  )
  const opportunity = getOpportunity({
    days,
    completeWeekStarts,
    referenceDateKey: normalizedReferenceDateKey
  })
  const comparisonDeltaSeconds = currentWeek.videoSeconds - usualThroughTodaySeconds
  const comparisonRatio = usualThroughTodaySeconds > 0
    ? Math.abs(comparisonDeltaSeconds) / usualThroughTodaySeconds
    : 0
  const comparisonDirection = (
    Math.abs(comparisonDeltaSeconds) >= MIN_COMPARISON_SECONDS
    && comparisonRatio >= MIN_COMPARISON_RATIO
  )
    ? comparisonDeltaSeconds > 0 ? 'above' : 'below'
    : 'similar'
  const type = opportunity ? 'extra-day' : 'weekly-check-in'

  return Object.freeze({
    id: `${normalizedReferenceDateKey}:${type}${opportunity ? `:${opportunity.weekdayIndex}` : ''}`,
    type,
    version: STUDY_GUIDANCE_VERSION,
    referenceDateKey: normalizedReferenceDateKey,
    confidence: completeWeekStarts.length >= MAX_COMPLETE_WEEKS
      ? 'strong'
      : 'emerging',
    completeWeeks: completeWeekStarts.length,
    currentWeekSeconds: currentWeek.videoSeconds,
    currentWeekActiveDays: currentWeek.videoDays,
    usualWeekSeconds,
    usualWeekActiveDays,
    usualThroughTodaySeconds,
    typicalActiveDaySeconds,
    comparisonDeltaSeconds,
    comparisonDirection,
    weekdayIndex: opportunity?.weekdayIndex ?? null,
    successfulWeekdayCount: opportunity?.successfulWeeks || 0,
    observedWeekdayCount: opportunity?.observedWeeks || 0,
    suggestedMinutes: opportunity?.suggestedMinutes
      || getFriendlyMinutes(typicalActiveDaySeconds / 2)
  })
}
