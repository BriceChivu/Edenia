import assert from 'node:assert/strict'
import test from 'node:test'
import { buildHistoryChartData, chartDayFromKey, chartDateKey, groupHistoryChartDays,
  visibleHistoryChartBuckets, clampHistoryChartRange } from '../../src/features/study-history/chart-data.js'
import { normalizeVideoWatchProgress } from '../../src/domain/video-watch-progress.js'
import { normalizeHistoryView } from '../../src/state/default-state.js'

const read = video => normalizeVideoWatchProgress(video.watchProgress)
const day = chartDayFromKey
const build = (state, options = {}) => buildHistoryChartData(state, {
  todayKey: '2026-10-14', getVideoEntries: read, ...options
})

test('Chart uses recorded Study days, earned XP and retained historical Anki even when disabled', () => {
  const data = build({ config: { ankiEnabled: false }, videos: { v: { watchProgress: [
    { watchedAt: '2026-10-14T01:00:00Z', studyDay: '2026-10-12', seconds: 180, experienceSeconds: 90 },
    { watchedAt: '2026-10-12T01:00:00Z', studyDay: '2026-10-12', seconds: 600 }
  ] } }, anki: { '2026-10-12': { reviewed: 50, created: 6, experienceReviews: 7 } } })
  const row = data.days.find(row => row.day === day('2026-10-12'))
  assert.deepEqual(row, { day: day('2026-10-12'), video: 1.5, anki: 7, seconds: 780, reviews: 50, hasExperience: true })
  assert.equal(data.days.at(-1).video, 0)
})

test('Legacy facts retain raw tooltip activity without inventing earned XP; gaps are zero', () => {
  const data = build({ videos: { v: { watchProgress: [{ watchedAt: '2026-10-10T12:00:00Z', seconds: 3600 }] } },
    anki: { '2026-10-10': { reviewed: 100, created: 20 } } })
  const row = data.days.find(row => row.day === day('2026-10-10'))
  assert.equal(row.video + row.anki, 0)
  assert.equal(row.hasExperience, false)
  assert.equal(row.seconds, 3600)
  assert.equal(row.reviews, 100)
  assert.equal(data.days.length, 30)
  assert.equal(data.days.at(-1).video + data.days.at(-1).anki, 0)
})

test('Restricted or future facts cannot affect chart bounds, marks, totals or overview input', () => {
  const base = { anki: { '2026-10-12': { reviewed: 2, experienceReviews: 2 } } }
  const hidden = structuredClone(base)
  hidden.anki['2020-01-01'] = { reviewed: 999999, experienceReviews: 999999 }
  hidden.anki['2026-10-15'] = { reviewed: 999999, experienceReviews: 999999 }
  hidden.videos = { v: { watchProgress: [{ watchedAt: '2020-01-01T01:00:00Z', seconds: 600, experienceSeconds: 600 }] } }
  assert.deepEqual(build(hidden, { cutoffKey: '2026-09-14' }), build(base, { cutoffKey: '2026-09-14' }))
})

test('Calendar grouping includes Monday weeks, leap days and calendar year boundaries', () => {
  const data = build({ anki: {
    '2023-12-31': { reviewed: 1, experienceReviews: 1 },
    '2024-01-01': { reviewed: 2, experienceReviews: 2 },
    '2024-02-29': { reviewed: 3, experienceReviews: 3 }
  } }, { todayKey: '2024-03-01' })
  const weeks = groupHistoryChartDays(data.days, 'week')
  assert.equal(weeks.find(row => row.start === day('2023-12-25')).anki, 1)
  assert.equal(weeks.find(row => row.start === day('2024-01-01')).anki, 2)
  const months = groupHistoryChartDays(data.days, 'month')
  assert.equal(months.find(row => row.start === day('2024-02-01')).end, day('2024-03-01'))
  assert.equal(months.find(row => row.start === day('2024-02-01')).anki, 3)
  assert.equal(groupHistoryChartDays(data.days, 'year').find(row => row.start === day('2024-01-01')).anki, 5)
})

test('Partial calendar buckets count only the visible days, and adjacent ranges reconcile', () => {
  const data = build({ anki: { '2026-10-01': { reviewed: 20, experienceReviews: 20 },
    '2026-10-12': { reviewed: 7, experienceReviews: 7 } } })
  const groups = groupHistoryChartDays(data.days, 'month')
  const later = visibleHistoryChartBuckets(groups, data, day('2026-10-10'), data.end)
  assert.equal(later.length, 1)
  assert.equal(later[0].anki, 7)
  assert.equal(later[0].clipStart, day('2026-10-10'))
  const earlier = visibleHistoryChartBuckets(groups, data, data.start, day('2026-10-10'))
  assert.equal(earlier.reduce((sum, row) => sum + row.anki, 0) + later[0].anki, 27)
})

test('Viewport never passes history bounds or zooms through itself; date ordinals reject invalid dates', () => {
  const bounds = { start: 10, end: 100 }
  assert.deepEqual(clampHistoryChartRange(105, 110, bounds), { start: 95, end: 100 })
  assert.deepEqual(clampHistoryChartRange(-100, 500, bounds), bounds)
  assert.deepEqual(clampHistoryChartRange(40, 39, bounds), { start: 40, end: 43 })
  assert.equal(day('2026-02-30'), null)
  assert.equal(day(null), null)
  assert.equal(chartDateKey(day('2024-02-29')), '2024-02-29')
})

test('Saved Chart selection requires the internal trial gate', () => {
  assert.equal(normalizeHistoryView('chart', false, true), 'chart')
  assert.equal(normalizeHistoryView('chart', false), 'summary')
  assert.equal(normalizeHistoryView('chart', true), 'heatmap')
})
