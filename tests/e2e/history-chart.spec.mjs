import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'
import { createPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'
import { canonicalizeJson, sha256Base64UrlSync } from '../../src/state/portable-state.js'

const now = new Date('2026-10-14T04:00:00Z')
const trial = 'edenia_v1_auth_trial_v1'
const origin = 'https://chart-fixture.supabase.co'
const fixture = JSON.parse(await readFile(new URL('../fixtures/learner-profile/profile-ready-trial-smoke.json', import.meta.url), 'utf8'))
const owner = fixture.session.user.id
const profileId = '223e4567-e89b-42d3-a456-426614174001'
const projects = new Set(['desktop-standard', 'tablet-portrait', 'phone-standard', 'phone-small', 'webkit-trial-desktop', 'webkit-trial-phone'])

async function seedChart(page, { free = false } = {}) {
  const anki = {}, watchProgress = []
  for (let i = 0; i < 450; i++) {
    const stamp = new Date(+now - i * 86_400_000)
    const key = stamp.toISOString().slice(0, 10)
    anki[key] = { reviewed: 10 + i % 20, experienceReviews: 10 + i % 20 }
    watchProgress.push({ watchedAt: stamp.toISOString(), studyDay: key, seconds: 600 + i % 300, experienceSeconds: 600 + i % 300 })
  }
  anki['2020-01-01'] = { reviewed: 999999, experienceReviews: 999999 }
  const at = '2026-10-01T04:00:00Z'
  const island = JSON.parse(await readFile(new URL('../fixtures/tiny-swords-populated-island.json', import.meta.url), 'utf8'))
  let envelope = (await createPortableLearnerProfileEnvelope({
    config: { locale: 'en', ankiEnabled: false, channels: [], weeklyGoalHours: 4 }, anki,
    videos: { chart: { id: 'chart', title: 'Chart fixture', duration: 1200, watchProgressTracked: true, watchProgress } },
    learnerProfile: { languages: ['french'], level: 'beginner', createdAt: at, updatedAt: at },
    onboarding: { introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at, levelUpGuidanceShownAt: at, islandAnnouncementSeenAt: at },
    cityProgress: { maxLevelIndex: 6, experienceVersion: 1 }, tinySwordsIsland: island
  })).envelope
  let revision = 1
  const commits = []
  await page.route('**/config.local.js*', route => route.fulfill({ contentType: 'text/javascript', body: `window.EDENIA_CONFIG=${JSON.stringify({
    authTrialEnabled: true, tinySwordsEnabled: false, tinySwordsPublicEnabled: false,
    accountFeaturesRollout: 'off', learnerProfileLifecycleEnabled: false, indexedDbProfilesEnabled: false,
    indexedDbBackupsEnabled: false, studyGuidanceEnabled: false, freePlusEnabled: free,
    supabaseUrl: origin, supabasePublishableKey: 'synthetic-key'
  })}` }))
  await page.addInitScript(({ trial, owner, profileId, envelope, session }) => {
    if (sessionStorage.getItem('chart-fixture-installed')) return
    localStorage.setItem(trial, JSON.stringify(envelope.profile))
    localStorage.setItem(trial + '_plus_auth_v1', JSON.stringify(session))
    localStorage.setItem(trial + '_learner_profile_access_v1', JSON.stringify({ version: 1, ownerId: owner, profileId, generation: 1, revision: 1, activatedAt: Date.now(), activationId: null, onboardingFinalizationPending: false }))
    localStorage.setItem(trial + '_learner_profile_sync_v1', JSON.stringify({ version: 1, ownerId: owner, profileId, generation: 1, acceptedRevision: 1, pending: null, queued: null }))
    sessionStorage.setItem('chart-fixture-installed', '1')
  }, { trial, owner, profileId, envelope, session: fixture.session })
  await page.route(origin + '/**', async route => {
    const path = new URL(route.request().url()).pathname
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'authorization,apikey,x-client-info,content-type' }
    const reply = json => route.fulfill({ json, headers })
    const identity = () => ({ profile_id: profileId, generation: 1, revision })
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/auth/v1/user') return reply(fixture.session.user)
    if (path === '/auth/v1/token') return reply(fixture.session)
    if (path === '/rest/v1/learner_profile_heads') return reply({ user_id: owner, ...identity() })
    if (path === '/rest/v1/rpc/resolve_my_learner_profile') return reply([{ status: 'profile_ready', created: false, ...identity(), envelope }])
    if (path.endsWith('/commit_my_learner_profile') || path.endsWith('/commit_my_learner_profile_handoff')) {
      const args = route.request().postDataJSON()
      commits.push(args)
      envelope = args.p_envelope
      revision = args.p_base_revision + 1
      return reply([{ status: 'accepted', ...identity(), base_revision: args.p_base_revision, payload_sha256: envelope.integrity.payloadSha256,
        request_sha256: sha256Base64UrlSync(canonicalizeJson({ baseRevision: args.p_base_revision, envelope, generation: 1,
          operationId: args.p_operation_id, ownerId: owner, profileId })) }])
    }
    if (path.endsWith('/read_my_latest_learner_profile_reset')) return reply([{ status: 'none' }])
    return reply([])
  })
  await page.goto('./?internal_test=1' + (free ? '&plus_access=free' : ''))
  await expect(page.locator('#mainApp')).toBeVisible()
  await page.locator('[data-history-view="chart"]').click()
  const chart = page.locator('#historyChartView')
  await expect(chart).toBeVisible()
  await expect(chart).toHaveAttribute('data-chart-unit', 'day')
  return { chart, commits }
}

async function span(chart) { return Number(await chart.getAttribute('data-chart-span')) }

test.beforeEach(async ({ page }, info) => {
  test.skip(!projects.has(info.project.name))
  await page.clock.setFixedTime(now)
})

test('Market navigator groups earned XP and supports smooth pan, wheel, axis stretch and range handles', async ({ page }, info) => {
  const { chart, commits } = await seedChart(page)
  await expect(chart).not.toContainText('Drag handles')
  await expect(chart.locator('.history-chart-detail')).toContainText('Video')
  const colors = await chart.evaluate(el => {
    const style = getComputedStyle(el)
    return { video: style.getPropertyValue('--chart-video').trim(), anki: style.getPropertyValue('--chart-anki').trim() }
  })
  expect(colors).toEqual({ video: '#159bd3', anki: '#747b83' })
  await chart.locator('[data-chart-unit="month"]').click()
  await expect(chart).toHaveAttribute('data-chart-unit', 'month')
  await chart.locator('[data-chart-unit="day"]').click()
  await chart.locator('[data-chart-mode="line"]').filter({ hasText: 'Line' }).click()
  await expect(chart).toHaveAttribute('data-chart-mode', 'line')
  await chart.locator('[data-chart-mode="bar"]').filter({ hasText: 'Bar' }).click()
  const plot = chart.locator('.history-chart-plot')
  await plot.scrollIntoViewIfNeeded()
  const rect = await plot.boundingBox()
  const before = await chart.getAttribute('data-chart-start')
  const initialSpan = await span(chart)
  const count = commits.length
  await page.mouse.move(rect.x + rect.width * .5, rect.y + 100)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width * .5 + 75, rect.y + 100, { steps: 12 })
  await page.mouse.up()
  await expect.poll(() => chart.getAttribute('data-chart-start')).not.toBe(before)
  await page.mouse.move(rect.x + rect.width * .5, rect.y + rect.height - 24)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width * .5 + 65, rect.y + rect.height - 24, { steps: 12 })
  await page.mouse.up()
  await expect.poll(() => span(chart)).toBeLessThan(initialSpan)
  const axisSpan = await span(chart)
  await page.mouse.move(rect.x + rect.width * .6, rect.y + 100)
  if (info.project.name === 'webkit-trial-phone') await chart.locator('[data-chart-zoom="out"]').click()
  else await page.mouse.wheel(0, 130)
  await expect.poll(() => span(chart)).toBeGreaterThan(axisSpan)
  const handle = chart.locator('[data-chart-edge="start"]')
  const handleBefore = await span(chart)
  await handle.focus()
  await handle.press('ArrowLeft')
  await expect.poll(() => span(chart)).toBeGreaterThan(handleBefore)
  const target = await chart.locator('[data-chart-edge="end"] .history-chart-handle').boundingBox()
  const brushBefore = await span(chart)
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x - 18, target.y + target.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect.poll(() => span(chart)).toBeLessThan(brushBefore)
  expect(commits.length).toBe(count)
  const dimensions = await chart.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth,
    documentWidth: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }))
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width)
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport)
  await chart.screenshot({ path: info.outputPath('market-navigator.png') })
})

test('Touch pan and two-finger pinch keep their captured surface and respond without cloud writes', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium')
  const { chart, commits } = await seedChart(page)
  await chart.scrollIntoViewIfNeeded()
  const rect = await chart.locator('.history-chart-plot').boundingBox()
  const cdp = await context.newCDPSession(page)
  const x = rect.x + rect.width * .45, y = rect.y + 110
  const before = await chart.getAttribute('data-chart-start'), initialSpan = await span(chart), count = commits.length
  const touch = async points => cdp.send('Input.dispatchTouchEvent', { type: points.length ? 'touchMove' : 'touchEnd', touchPoints: points })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
  for (let i = 1; i <= 12; i++) await touch([{ x: x + i * 4, y, id: 1 }])
  await touch([])
  await expect.poll(() => chart.getAttribute('data-chart-start')).not.toBe(before)
  await chart.locator('[data-chart-zoom="latest"]').click()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 20, y, id: 1 }, { x: x + 20, y, id: 2 }] })
  for (let i = 1; i <= 10; i++) await touch([{ x: x - 20 - i * 3, y, id: 1 }, { x: x + 20 + i * 3, y, id: 2 }])
  await touch([])
  await expect.poll(() => span(chart)).toBeLessThan(initialSpan * .8)
  expect(commits.length).toBe(count)
  const scrollBefore = await page.evaluate(() => scrollY)
  const dateBefore = await chart.getAttribute('data-chart-start')
  const fresh = await chart.locator('.history-chart-plot').boundingBox()
  const scrollX = fresh.x + fresh.width * .5, scrollY = fresh.y + 145
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: scrollX, y: scrollY, id: 3 }] })
  for (let i = 1; i <= 8; i++) await touch([{ x: scrollX, y: scrollY - i * 8, id: 3 }])
  await touch([])
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore)
  expect(await chart.getAttribute('data-chart-start')).toBe(dateBefore)
  await cdp.detach()
})

test('Free history excludes old activity and dates from all Chart output', async ({ page }) => {
  const { chart } = await seedChart(page, { free: true })
  await chart.locator('[data-chart-unit="year"]').click()
  await expect(chart).toHaveAttribute('data-chart-start', '2026-09-14')
  await expect(chart).not.toContainText('999,999')
  await expect(chart.locator('.history-chart-access')).toBeVisible()
  await expect(chart.locator('.history-chart-access')).toHaveText('View complete history')
})

test('Chart is excluded from the public and mode-2 surfaces', async ({ page }) => {
  for (const query of ['', '?internal_test=2']) {
    await page.goto('./' + query)
    await expect(page.locator('[data-history-view="heatmap"]')).toBeAttached()
    await expect(page.locator('[data-history-view="chart"]')).not.toBeVisible()
    await expect(page.locator('#historyChartView')).not.toBeVisible()
  }
})
