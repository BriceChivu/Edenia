import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'

test.skip(process.env.EDENIA_TEST_PUBLIC_ISLAND !== 'true', 'Requires the explicit public-page build')

async function configure(page, { game = false, indexedDb = false } = {}) {
  await page.route('**/config.local.js*', route => route.fulfill({ contentType: 'text/javascript',
    body: `window.EDENIA_CONFIG=${JSON.stringify({ tinySwordsPublicEnabled: true, tinySwordsEnabled: game,
      accountFeaturesRollout: 'off', learnerProfileLifecycleEnabled: false,
      indexedDbProfileEnabled: indexedDb, indexedDbBackupsEnabled: indexedDb })}` }))
}
async function seed(page, { island = null, locale = 'en' } = {}) {
  await page.evaluate(({ island, locale }) => {
    const at = new Date().toISOString()
    const state = defaultState(4, [], 'light', [], locale)
    state.config.ankiEnabled = false
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true, setupCompletedAt: at,
      walkthroughCompleted: true, walkthroughCompletedAt: at, levelUpGuidanceShownAt: at })
    state.cityProgress = { maxLevelIndex: 11, pendingLevelIndex: null, scoringVersion: 7 }
    state.videos.lesson = { id: 'lesson', title: 'Preserved lesson', duration: 3600, status: 'watched', watchedAt: at,
      watchProgress: [{ watchedAt: at, seconds: 3600 }] }
    state.anki = { '2026-10-07': { reviewed: 90, created: 3, loggedAt: at } }
    state.townEconomy = { version: 1, mode: 'legacy', rewards: {}, purchases: { 'garden-flower-1': 0 } }
    state.tinySwordsIsland = island
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    localStorage.setItem('edenia_v1_internal_test_2', JSON.stringify({ ...state, videos: { tester: { title: 'Tester only' } } }))
    localStorage.setItem('edenia_v1_backups', JSON.stringify([{ id: 'before', createdAt: at, reason: 'before transition', state }]))
  }, { island, locale })
}

for (const indexedDb of [false, true]) {
  test(`returning public learner preserves production data and dismisses one announcement (${indexedDb ? 'IndexedDB' : 'localStorage'})`, async ({ page }) => {
    await configure(page)
    await page.goto('./')
    await expect(page.locator('#introTrailer')).toBeVisible()
    await expect(page.locator('#islandAnnouncement')).toBeHidden()
    await seed(page)
    const tester = await page.evaluate(() => localStorage.getItem('edenia_v1_internal_test_2'))
    await page.unroute('**/config.local.js*')
    await configure(page, { indexedDb })
    await page.reload()
    await expect(page.locator('#islandAnnouncement')).toBeVisible()
    const modal = page.locator('#islandAnnouncement')
    await expect(modal.locator('button')).toHaveCount(1)
    await expect(modal.getByRole('heading')).toHaveText('You can now interact with your island!')
    await expect(modal.locator('img')).toBeVisible()
    expect(await modal.locator('img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0)
    await expect(page.locator('#islandAnnouncementContinue')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator('#islandAnnouncementContinue')).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(page.locator('#islandAnnouncementContinue')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(modal).toBeVisible()
    expect(await page.locator('#mainApp').evaluate(node => node.inert)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (test.info().project.name.includes('phone')) await page.setViewportSize({ width: 320, height: 700 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const bounds = await page.locator('#islandAnnouncementContinue').boundingBox()
    const content = await page.locator('.island-announcement-body').boundingBox()
    if (test.info().project.name.includes('phone')) expect(bounds.width).toBeCloseTo(content.width - 44, 0)
    else expect(bounds.width).toBeLessThan(content.width / 2)
    await page.screenshot({ path: test.info().outputPath('approved-announcement.png') })
    await page.locator('#islandAnnouncementContinue').click()
    await expect(modal).toBeHidden()
    expect(await page.locator('#mainApp').evaluate(node => node.inert)).toBe(false)
    await expect(page.locator('[data-settings-shell-action="open"]')).toBeFocused()
    await expect(page.locator('#cityScore')).toHaveText('0')
    await expect(page.locator('#cityCurrentLevel')).toHaveText('Level 1')
    await expect(page.locator('#cityMilestoneImage')).toHaveCount(0)
    await expect(page.locator('#cityTimeWaveform')).toHaveCount(0)
    expect(await page.evaluate(() => ACCOUNT_FEATURES_ENABLED)).toBe(false)
    expect(await page.evaluate(() => ({ level: loadState().legacyCityProgress.maxLevelIndex,
      seconds: getTotalVideoWatchProgressSeconds(loadState().videos.lesson), reviews: loadState().anki['2026-10-07'].reviewed,
      flowers: loadState().townEconomy.purchases['garden-flower-1'] }))).toEqual({ level: 11, seconds: 3600, reviews: 90, flowers: 0 })
    expect(await page.evaluate(() => { const rows = getStudyHistoryBetween(loadState(), new Date('2026-01-01'), new Date('2027-01-01')).rows; return rows.reduce((sum, row) => sum + row.secondsWatched, 0) })).toBe(3600)
    const portable = await page.evaluate(async () => (await createPortableLearnerProfileEnvelope(loadState())).serialized)
    expect(JSON.parse(portable).profile.legacyCityProgress.maxLevelIndex).toBe(11)
    expect(JSON.parse(portable).profile.onboarding.islandAnnouncementSeenAt).toBeTruthy()
    expect(await page.evaluate(() => getStateBackupEntries().some(entry => entry.id === 'before'))).toBe(true)
    await page.reload()
    await expect(modal).toBeHidden()
    expect(await page.evaluate(() => localStorage.getItem('edenia_v1_internal_test_2'))).toBe(tester)
    await page.evaluate(async () => {
      const state = loadState()
      state.videos.lesson.watchProgress.push({ watchedAt: new Date().toISOString(), seconds: 900, experienceSeconds: 900 })
      await saveState(state)
      renderAll(state)
    })
    await expect(page.locator('#cityScore')).toHaveText('15')
    await page.locator('#levelUpButton').press('Enter')
    await expect(page.locator('#cityCurrentLevel')).toHaveText('Level 2')
    await page.reload()
    await expect(page.locator('#cityCurrentLevel')).toHaveText('Level 2')
    expect(await page.evaluate(() => loadState().legacyCityProgress.maxLevelIndex)).toBe(11)
  })
}

for (const dismissImmediately of [false, true]) {
  test(`announcement takes priority over queued level-up guidance (${dismissImmediately ? 'quick Continue' : 'keep open'})`, async ({ page }) => {
    await configure(page)
    await page.goto('./')
    await seed(page)
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('edenia_v1'))
      state.cityProgress = { maxLevelIndex: 0, experienceVersion: 1 }
      state.onboarding.levelUpGuidanceShownAt = null
      state.videos.lesson.watchProgress[0].experienceSeconds = 900
      localStorage.setItem('edenia_v1', JSON.stringify(state))
    })
    await page.reload()
    await expect(page.locator('#islandAnnouncement')).toBeVisible()
    if (dismissImmediately) await page.locator('#islandAnnouncementContinue').click()
    // Allow the existing delayed hint to run; Continue must not add a tutorial.
    await page.waitForTimeout(650)
    await expect(page.locator('.walkthrough-layer:not(.hidden)')).toHaveCount(0)
    if (!dismissImmediately) {
      await expect(page.locator('#islandAnnouncementContinue')).toBeFocused()
      await page.locator('#islandAnnouncementContinue').click()
    }
    await expect(page.locator('#islandAnnouncement')).toBeHidden()
    await expect(page.locator('.walkthrough-layer:not(.hidden)')).toHaveCount(0)
    await expect(page.locator('#cityScore')).toHaveText('15')
  })
}

test('localized announcement and fresh onboarding do not collide', async ({ page }) => {
  await configure(page)
  await page.goto('./')
  await page.getByRole('button', { name: 'Skip intro' }).click()
  await page.locator('[data-language-id="other"]').click()
  await page.locator('[data-personalized-onboarding-action="continue-language"]').click()
  await Promise.all([page.waitForNavigation(), page.locator('[data-personalized-onboarding-action="finish"]').click()])
  await page.evaluate(async () => { const state = loadState(); state.onboarding.walkthroughCompleted = true; await saveState(state) })
  await page.reload()
  await expect(page.locator('#islandAnnouncement')).toBeHidden()
  for (const [locale, title] of [['fr', 'Vous pouvez maintenant interagir avec votre île !'], ['es', '¡Ya puedes interactuar con tu isla!'],
    ['zh-Hant', '現在，你可以和自己的島嶼互動了！'], ['zh-Hans', '现在，你可以和自己的岛屿互动了！']]) {
    await seed(page, { locale })
    await page.reload()
    await expect(page.locator('#islandAnnouncementTitle')).toHaveText(title)
    await page.locator('#islandAnnouncementContinue').click()
    await expect(page.locator('#islandAnnouncement')).toBeHidden()
  }
})

test('public game failure and disable/re-enable keep study, saved island, claims and backups', async ({ page }) => {
  test.setTimeout(180000)
  const island = JSON.parse(await readFile('tests/fixtures/tiny-swords-populated-island.json', 'utf8'))
  await configure(page)
  await page.goto('./')
  await seed(page, { island })
  await page.evaluate(async () => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.cityProgress = { maxLevelIndex: 6, pendingLevelIndex: null, scoringVersion: 7, experienceVersion: 1 }
    state.onboarding.islandAnnouncementSeenAt = new Date().toISOString()
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.unroute('**/config.local.js*')
  await configure(page, { game: true, indexedDb: true })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect.poll(() => page.frames().find(f => f.url().includes('/tiny-swords-game/'))?.evaluate(() => window.edeniaLastSavePersisted), { timeout: 60000 }).toBe(true)
  // Establish the source-owned current save before testing disable/re-enable.
  // This old populated fixture receives Godot's existing reward/save migrations.
  await page.route('**/tiny-swords-game/*/index.html', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><script>parent.postMessage({type:'edenia-game-startup-failed'},location.origin)</script>` }))
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry island' })).toBeVisible()
  await page.evaluate(() => openSettings())
  await expect(page.locator('#settingsPanel')).toBeVisible()
  await page.evaluate(() => closeSettings())
  const retained = await page.evaluate(() => { const s = loadState(); return { island: s.tinySwordsIsland, claims: s.cityProgress.maxLevelIndex, videos: s.videos, backups: getStateBackupEntries().length } })
  await page.unroute('**/config.local.js*')
  await configure(page, { indexedDb: true })
  await page.reload()
  await expect(page.locator('.tiny-swords-frame')).toHaveCount(0)
  expect(await page.evaluate(() => { const s = loadState(); return { island: s.tinySwordsIsland, claims: s.cityProgress.maxLevelIndex, videos: s.videos, backups: getStateBackupEntries().length } })).toEqual(retained)
  await page.unroute('**/tiny-swords-game/*/index.html')
  await page.unroute('**/config.local.js*')
  await configure(page, { game: true, indexedDb: true })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect.poll(() => page.frames().find(f => f.url().includes('/tiny-swords-game/'))?.evaluate(() => window.edeniaLastSavePersisted), { timeout: 60000 }).toBe(true)
  const restored = await page.evaluate(() => loadState())
  expect(restored.tinySwordsIsland.stock).toEqual(retained.island.stock)
  expect(restored.tinySwordsIsland.resources).toEqual(retained.island.resources)
  expect(restored.cityProgress.maxLevelIndex).toBe(retained.claims)
  expect(restored.videos).toEqual(retained.videos)
  expect(new URL(page.frames().find(f => f.url().includes('/tiny-swords-game/')).url()).pathname).toMatch(/\/tiny-swords-game\/[a-f0-9]{64}\/index.html$/)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1_internal_test_2'))).toBeTruthy()
})

test('tester progress moves only through deliberate portable export and production file import', async ({ page }) => {
  await configure(page)
  await page.goto('./?internal_test=2')
  await page.evaluate(async () => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    state.config.ankiEnabled = false
    Object.assign(state.onboarding, { setupCompleted: true, introSeenAt: at, walkthroughCompleted: true, islandAnnouncementSeenAt: at })
    state.cityProgress = { maxLevelIndex: 1, experienceVersion: 1 }
    state.videos.imported = { id: 'imported', title: 'Deliberately imported tester lesson', duration: 900,
      status: 'partial', watchProgress: [{ watchedAt: at, seconds: 900, experienceSeconds: 900 }] }
    await saveState(state)
  })
  const serialized = await page.evaluate(async () => (await createPortableLearnerProfileEnvelope(loadState())).serialized)
  const tester = await page.evaluate(() => localStorage.getItem('edenia_v1_internal_test_2'))
  await page.goto('./')
  expect(await page.evaluate(() => loadState().videos.imported)).toBeUndefined()
  await seed(page)
  // seed adds a separate tester marker; retain the real tester export's durable source.
  await page.evaluate(raw => localStorage.setItem('edenia_v1_internal_test_2', raw), tester)
  await page.reload()
  await page.locator('#islandAnnouncementContinue').click()
  await expect(page.locator('#islandAnnouncement')).toBeHidden()
  await page.evaluate(() => { openSettings(); beginSettingsSyncImportInteraction(document.getElementById('syncFileInput')) })
  await page.locator('#syncFileInput').setInputFiles({ name: 'tester-export.json', mimeType: 'application/json', buffer: Buffer.from(serialized) })
  await expect.poll(() => page.evaluate(() => loadState().videos.imported?.title)).toBe('Deliberately imported tester lesson')
  await page.reload()
  await expect(page.locator('#cityCurrentLevel')).toHaveText('Level 2')
  await expect(page.locator('#cityScore')).toHaveText('15')
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1_internal_test_2'))).toBe(tester)
  expect(await page.evaluate(() => getStateBackupEntries().length)).toBeGreaterThan(0)
})
