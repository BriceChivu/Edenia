import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { observeAnkiExperience } from '../../src/domain/experience.js'
import { getTrackedAnkiCounts } from '../../src/state/anki-state.js'
import { normalizeAnkiCount } from '../../src/state/config-normalization.js'
import { preparePortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const start = source.indexOf('async function syncAnkiStatsToState(')
const end = source.indexOf('\nfunction setText(', start)
assert.ok(start > 0 && end > start)
const dateKey = '2026-10-08'
const previousAt = '2026-10-08T10:00:00.000Z'
const fetchedAt = '2026-10-08T10:05:00.000Z'

function harness({ signedIn = true, initialDay = true } = {}) {
  const state = {
    config: { channels: [] }, videos: {}, activityLog: [],
    anki: initialDay ? { [dateKey]: {
      reviewed: 3, created: 2, experienceReviews: 3, experienceWatermark: 3,
      loggedAt: previousAt, source: 'ankiconnect', rawReviewed: 3, rawCreated: 2
    } } : {}
  }
  const saves = []
  const context = vm.createContext({
    learnerProfileLifecycleAuthority: signedIn ? {} : null,
    loadState: () => state,
    getPortableProfileSnapshot: value => JSON.stringify(preparePortableLearnerProfileEnvelope(value).profile),
    getAnkiDateKey: () => dateKey, getCurrentAnkiDateKey: () => dateKey,
    normalizeAnkiCount, observeAnkiExperience, getTrackedAnkiCounts,
    appendActivityLog: (value, entry) => value.activityLog.push(entry),
    trackEdeniaEvent() {}, syncStreak() {},
    saveState: (value, options = {}) => {
      saves.push({ profile: preparePortableLearnerProfileEnvelope(value).profile, options })
      return true
    },
    renderHeader() {}, renderAnalytics() {}, getWeeklyStats: () => ({}),
    getCurrentCityScore: () => 0, renderCity() {}, t: key => key
  })
  vm.runInContext(source.slice(start, end), context)
  return { state, saves, sync: (stats = {}, options = { silent: true }) =>
    context.syncAnkiStatsToState({ reviewedToday: 3, newToday: 2, dueCards: 10,
      fetchedAt, ankiDateKey: dateKey, ...stats }, options) }
}

test('an identical automatic Anki observation preserves portable progress and saves only locally', async () => {
  const h = harness()
  const before = preparePortableLearnerProfileEnvelope(h.state).profile
  assert.equal(await h.sync(), true)
  assert.equal(h.saves.length, 1)
  assert.equal(h.saves[0].options.syncCloud, false)
  assert.deepEqual(h.saves[0].profile, before)
  assert.equal(h.state.activityLog.length, 0)
  assert.equal(h.state.anki[dateKey].loggedAt, previousAt)
})

test('new reviews still persist their observation, activity and XP to the cloud', async () => {
  const h = harness()
  await h.sync({ reviewedToday: 4 })
  assert.equal(h.saves.length, 1)
  assert.notEqual(h.saves[0].options.syncCloud, false)
  assert.equal(h.saves[0].profile.anki[dateKey].reviewed, 4)
  assert.equal(h.state.anki[dateKey].experienceReviews, 4)
  assert.equal(h.state.anki[dateKey].loggedAt, fetchedAt)
  assert.equal(h.state.activityLog.length, 1)
})

test('cloud observation timestamps and changed due-card counts do not manufacture Study facts', async () => {
  const h = harness()
  const day = h.state.anki[dateKey]
  day.observedAt = day.loggedAt
  delete day.loggedAt
  const before = preparePortableLearnerProfileEnvelope(h.state).profile
  await h.sync({ dueCards: 200 })
  assert.deepEqual(h.saves[0].profile, before)
  assert.equal(h.saves[0].options.syncCloud, false)
})

test('unchanged polls retain device resume baselines in their local save', async () => {
  const h = harness()
  h.state.config.ankiPendingResumeBaseline = {
    dateKey, trackedReviewed: 3, trackedCreated: 2, createdAt: previousAt
  }
  await h.sync()
  assert.equal(h.saves[0].options.syncCloud, false)
  assert.equal(h.state.config.ankiPendingResumeBaseline, null)
  assert.equal(h.state.config.ankiResumeBaselines[dateKey].rawReviewed, 3)
})

test('manual and accountless unchanged refreshes retain their diagnostics', async () => {
  for (const [signedIn, silent] of [[true, false], [false, true]]) {
    const h = harness({ signedIn })
    await h.sync({}, { silent })
    assert.equal(h.saves.length, 1)
    assert.notEqual(h.saves[0].options.syncCloud, false)
    assert.equal(h.state.activityLog.length, 1)
    assert.equal(h.state.anki[dateKey].loggedAt, fetchedAt)
  }
})

test('the first observation retains its XP watermark and reaches the cloud', async () => {
  const h = harness({ initialDay: false })
  await h.sync({ reviewedToday: 0, newToday: 0 })
  assert.notEqual(h.saves[0].options.syncCloud, false)
  assert.equal(h.state.anki[dateKey].experienceWatermark, 0)
  await h.sync({ reviewedToday: 1, newToday: 0 })
  assert.equal(h.state.anki[dateKey].experienceReviews, 1)
})
