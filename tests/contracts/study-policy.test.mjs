import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { historyExperience } from '../../src/domain/experience.js'
import { MIN_DAILY_STREAK_XP, qualifiesStudyDay } from '../../src/domain/study-policy.js'

const fixtures = JSON.parse(await readFile(new URL('../fixtures/study-qualification.json', import.meta.url)))

test('study policy is the same ten XP threshold for app and email', () => {
  assert.equal(MIN_DAILY_STREAK_XP, 10)
  for (const fixture of fixtures) {
    const points = historyExperience({ experienceSeconds: fixture.videoSeconds, experienceReviews: fixture.ankiReviews })
    assert.equal(qualifiesStudyDay(points), fixture.qualifies, fixture.name)
  }
  for (const invalid of [undefined, null, '10', NaN, Infinity, -1]) assert.equal(qualifiesStudyDay(invalid), false)
})

test('server policy fixtures are generated from the same qualification input', async () => {
  const source = await readFile(new URL('../../scripts/generate-reminder-policy-fixtures.mjs', import.meta.url), 'utf8')
  assert.match(source, /tests\/fixtures\/study-qualification\.json/)
  assert.match(source, /private\.reminder_study_threshold\(\)/)
})

test('browser eligibility asks for server recomputation without traversing study or island state', async () => {
  const app = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
  for (const path of ['src/app.js', 'compat/production/src/app.js']) {
    const source = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
    const body = source.slice(source.indexOf('function getAccountStudySnapshot('), source.indexOf('function prepareStateForBackup('))
    assert.doesNotMatch(body, /getStudyHistoryBetween|createReminderEligibilitySnapshot|\.videos|tinySwordsIsland|JSON\.stringify/)
    assert.match(body, /timezone/)
  }
  assert.match(app, /import \{ MIN_DAILY_STREAK_XP \} from '\.\/domain\/study-policy\.js'/)
})

test('retained production reader preserves earned XP without assigning it to legacy activity', async () => {
  const source = await readFile(new URL('../../compat/production/src/domain/video-watch-progress.js', import.meta.url), 'utf8')
  const normalize = new Function('isValidTimestamp', 'clampNumber',
    `${source.replace(/^import.*$/gm, '').replace('export function', 'function')}; return normalizeVideoWatchProgress`)(
    value => Number.isFinite(Date.parse(value)), (value, min, max) => Math.min(max, Math.max(min, value)))
  const [legacy, earned] = normalize([
    { watchedAt: '2026-10-26T00:00:00Z', seconds: 600 },
    { watchedAt: '2026-10-27T00:00:00Z', studyDay: '2026-10-26', seconds: 300, experienceSeconds: 300 }
  ])
  assert.equal(Object.hasOwn(legacy, 'experienceSeconds'), false)
  assert.equal(earned.experienceSeconds, 300)
  assert.equal(earned.studyDay, '2026-10-26')
  const app = await readFile(new URL('../../compat/production/src/app.js', import.meta.url), 'utf8')
  assert.match(app, /const MIN_DAILY_STREAK_POINTS = 5/)
})
