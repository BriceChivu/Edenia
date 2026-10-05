import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { initializeExperience, observeAnkiExperience, historyExperience } from '../../src/domain/experience.js'
import { normalizeVideoWatchProgress } from '../../src/domain/video-watch-progress.js'
import { getCityLevelIndex } from '../../src/features/city/model.js'
import { preparePortableLearnerProfileEnvelope, reconcilePortableAnkiDays } from '../../src/state/portable-learner-profile.js'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
function appFunction(name, next, dependencies) {
  const text = source.slice(source.indexOf(`function ${name}(`), source.indexOf(`\nfunction ${next}(`))
  return new Function(...Object.keys(dependencies), `${text}; return ${name}`)(...Object.values(dependencies))
}
const liveWatch = appFunction('addVideoShelfSessionProgress', 'trackVideoShelfWatchCoverage', {
  normalizeVideoWatchProgress, isValidTimestamp: value => Number.isFinite(Date.parse(value))
})
const historyBucket = appFunction('createHistoryBucket', 'getStudyHistory', {})
const dateKey = date => date.toISOString().slice(0, 10)
const history = appFunction('getStudyHistoryBetween', 'renderHistoryWatchedCell', {
  createHistoryBucket: historyBucket, getVideoWatchProgressEntries: video => normalizeVideoWatchProgress(video.watchProgress, video.duration),
  toDateKey: dateKey, normalizeAnkiCount: value => Math.max(0, Number(value) || 0),
  getHistoryDayPoints: historyExperience, t: value => value
})

test('XP migration resets earned town levels once and preserves all historical study facts', () => {
  const state = { cityProgress: { maxLevelIndex: 11 }, videos: { legacy: { status: 'watched', duration: 3600 } }, anki: { '2026-09-29': { reviewed: 90 } } }
  const facts = JSON.stringify({ videos: state.videos, anki: state.anki })
  assert.equal(initializeExperience(state), true)
  assert.equal(state.cityProgress.maxLevelIndex, 0)
  assert.equal(JSON.stringify({ videos: state.videos, anki: state.anki }), facts)
  state.cityProgress.maxLevelIndex = 1
  assert.equal(initializeExperience(state), false)
  assert.equal(state.cityProgress.maxLevelIndex, 1)
})

test('live seconds across sessions reach exactly 15 and 45 XP; legacy and undo cannot mint XP', () => {
  const at = '2026-09-30T01:00:00.000Z'
  let video = { duration: 4000, watchProgress: [{ watchedAt: at, seconds: 1200 }] }
  const before = structuredClone(video)
  let session = {}
  liveWatch(video, 420, session, '2026-09-30T02:00:00.000Z')
  video = JSON.parse(JSON.stringify(video))
  session = {}
  liveWatch(video, 480, session, '2026-09-30T03:00:00.000Z')
  const score = value => historyExperience({ experienceSeconds: value.watchProgress.reduce((sum, fact) => sum + (fact.experienceSeconds || 0), 0) })
  assert.equal(score(video), 15)
  assert.equal(getCityLevelIndex(score(video)), 1)
  const after = structuredClone(video)
  assert.equal(score(before), 0) // undo restores unmarked facts
  assert.equal(score(after), 15) // repeated redo restores the same facts
  liveWatch(video, 1800, {}, '2026-09-30T04:00:00.000Z')
  assert.equal(score(video), 45)
  assert.equal(getCityLevelIndex(score(video)), 2)
  assert.equal(getCityLevelIndex(10000), 2)
})

test('one new Anki review equals one watched minute and uses the same level thresholds', () => {
  assert.equal(historyExperience({ experienceReviews: 1 }), historyExperience({ experienceSeconds: 60 }))
  assert.equal(getCityLevelIndex(historyExperience({ experienceReviews: 15 })), 1)
  assert.equal(getCityLevelIndex(historyExperience({ experienceReviews: 45 })), 2)
})

test('Anki first cumulative observation is a baseline; resync, old days, and counter rollback do not mint XP', () => {
  const first = observeAnkiExperience({ reviewed: 30 }, 100)
  assert.equal(first.experienceReviews, 0)
  const next = observeAnkiExperience(first, 103)
  assert.equal(historyExperience(next), 3)
  assert.deepEqual(observeAnkiExperience(next, 103), next)
  const rollback = observeAnkiExperience(next, 20)
  assert.equal(observeAnkiExperience(rollback, 103).experienceReviews, 3)
  assert.equal(observeAnkiExperience(next, 200, { eligible: false }).experienceReviews, 3)
  assert.equal(observeAnkiExperience({ reviewed: 1000 }, 1000).experienceReviews, 0)
})

test('history keeps old activity as unmarked, combines new XP without changing streak facts', () => {
  const state = { videos: { v: { id: 'v', duration: 1000, watchProgress: [
    { watchedAt: '2026-09-29T01:00:00Z', seconds: 600 },
    { watchedAt: '2026-09-30T01:00:00Z', seconds: 900, experienceSeconds: 900 }
  ] } }, anki: { '2026-09-29': { reviewed: 60 }, '2026-09-30': { reviewed: 63, experienceReviews: 3 } } }
  const rows = history(state, new Date('2026-09-01'), new Date('2026-10-01')).rows
  assert.equal(rows[0].secondsWatched, 900)
  assert.equal(rows[0].ankiReviewed, 63)
  assert.equal(historyExperience(rows[0]), 18)
  assert.equal(rows[1].hasExperience, false)
  assert.equal(rows[1].secondsWatched, 600)
  assert.equal(rows[1].ankiReviewed, 60)
  assert.equal(historyExperience(rows[1]), 0)
  assert.match(source, /filter\(row => getHistoryDayRawPoints\(row\) >= MIN_DAILY_STREAK_POINTS\)/)
})

test('portable profiles retain XP provenance and cumulative Anki watermark without awarding old imports', () => {
  const state = { config: {}, videos: { v: { id: 'v', duration: 900, watchProgress: [{ watchedAt: '2026-09-30T01:00:00Z', seconds: 900, experienceSeconds: 900 }] } }, anki: { '2026-09-30': { reviewed: 103, experienceReviews: 3, experienceWatermark: 103 } }, cityProgress: { maxLevelIndex: 1, experienceVersion: 1 } }
  const prepared = preparePortableLearnerProfileEnvelope(state)
  const profile = prepared.profile || prepared.envelope?.profile
  assert.ok(profile)
  assert.equal(profile.videos.v.watchProgress[0].experienceSeconds, 900)
  assert.equal(profile.anki['2026-09-30'].experienceWatermark, 103)
  assert.equal(profile.cityProgress.experienceVersion, 1)
  assert.equal(reconcilePortableAnkiDays(profile.anki, profile.anki)['2026-09-30'].experienceReviews, 3)
})


test('XP migration accepts the host scoring version and is stable on reload', () => {
  const state = { cityProgress: { maxLevelIndex: 5, scoringVersion: 7 } }
  assert.equal(initializeExperience(state, 7), true)
  assert.equal(state.cityProgress.scoringVersion, 7)
  assert.equal(initializeExperience(state, 7), false)
})
