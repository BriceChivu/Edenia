import { expect, test } from '../support/network-fixture.mjs'

async function waitForApp(page) {
  await page.waitForFunction(() => typeof defaultState === 'function')
}
async function config(page, enabled = true, indexedDb = false, accounts = 'off') {
  await page.route('**/config.local.js*', route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.EDENIA_CONFIG={tinySwordsEnabled:${enabled},accountFeaturesRollout:'${accounts}',learnerProfileLifecycleEnabled:true,indexedDbProfileEnabled:${indexedDb},indexedDbBackupsEnabled:${indexedDb},legacyProgressMigrationEnabled:true}`
  }))
}
async function seed(page, key, title) {
  await page.evaluate(({ key, title }) => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at })
    state.config.ankiEnabled = false
    state.videos.lesson = { id: 'lesson', title, duration: 3600, status: 'partial', watchProgress: [{ watchedAt: at, seconds: 600, experienceSeconds: 600 }] }
    localStorage.setItem(key, JSON.stringify(state))
  }, { key, title })
}
const retained = page => page.evaluate(() => ({
  storage: Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.includes('internal_test_2'))),
  cookies: document.cookie.split('; ').filter(cookie => !cookie.startsWith('edenia_config_internal_test_2=')).sort()
}))

test('ordinary, mode 1, unsupported values and sandbox never request game runtime assets', async ({ page }) => {
  await config(page)
  const gameRequests = []
  page.on('request', request => {
    if (request.url().includes('/tiny-swords-game/')) gameRequests.push(request.url())
  })
  for (const query of ['', '?internal_test=1', '?internal_test=3', '?internal_test=02', '?internal_test=true']) {
    await page.goto(`./${query}`)
    await waitForApp(page)
    await expect(page.locator('#cityMilestoneImage')).toHaveCount(1)
    await expect(page.locator('#cityTimeWaveform')).toHaveCount(1)
    expect(await page.evaluate(() => getCityLevelIndex(15))).toBe(0)
    expect(await page.evaluate(() => getFeedbackAssetVersion())).toBeTruthy()
    await expect(page.locator('.tiny-swords-frame')).toHaveCount(0)
  }
  await page.goto('http://localhost:8001/?sandbox=1&internal_test=2')
  await waitForApp(page)
  await expect(page.locator('#cityMilestoneImage')).toHaveCount(1)
  expect(gameRequests).toEqual([])
})

test('fresh tester onboarding, URL cleanup, navigation and reload retain mode 2', async ({ page }) => {
  await config(page, false, false, 'public')
  await page.goto('./?internal_test=2&account=1&extra=cleanup')
  await expect(page.locator('#introTrailer')).toBeVisible()
  await page.locator('[data-intro-finish-action="finish"]:visible').first().click()
  await page.locator('[data-language-id="other"]').click()
  await page.locator('[data-personalized-onboarding-action="continue-language"]').click()
  await page.locator('[data-personalized-onboarding-action="finish"]').click()
  await expect(page).toHaveURL(/\?internal_test=2$/)
  await expect(page.locator('#mainApp')).toBeVisible()
  await page.evaluate(() => {
    const state = loadState()
    state.onboarding.walkthroughCompleted = true
    return saveState(state)
  })
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  await page.evaluate(() => openSettings())
  await expect(page.locator('#settingsPanel')).toBeVisible()
  expect(new URL(page.url()).searchParams.get('internal_test')).toBe('2')
  const appUrl = page.url()
  await page.goto(new URL('plus/?internal_test=2', appUrl).href)
  await expect(page).toHaveURL(appUrl)
  await expect(page.locator('#mainApp')).toBeVisible()
  expect(await page.evaluate(() => ACCOUNT_FEATURES_ENABLED)).toBe(false)
  expect(await page.evaluate(() => LEGACY_PROGRESS_MIGRATION_ENABLED)).toBe(false)
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key === 'edenia_v1' || key === 'edenia_v1_internal_test'))).toEqual([])
})

for (const indexedDb of [false, true]) {
  test(`tester portable import, settings, backups and reset preserve the source modes (${indexedDb ? 'IndexedDB' : 'localStorage'})`, async ({ page }) => {
    await config(page, false)
    await page.goto('./')
    await waitForApp(page)
    await expect(page.locator('#introTrailer')).toBeVisible()
    await seed(page, 'edenia_v1', 'Source lesson')
    await seed(page, 'edenia_v1_internal_test', 'Mode 1 lesson')
    await page.evaluate(() => {
      localStorage.setItem('edenia_v1_backups', '[]')
      localStorage.setItem('edenia_v1_internal_test_backups', '[]')
      localStorage.setItem('edenia_tiny_swords_xp_layout_v1', '{"level":9}')
      document.cookie = 'edenia_config=normal-marker; path=/'
      document.cookie = 'edenia_config_internal_test=mode-one-marker; path=/'
    })
    const original = await retained(page)
    // Export through the source mode's actual portable profile writer.
    const serialized = await page.evaluate(async () => (await createPortableLearnerProfileEnvelope(JSON.parse(localStorage.getItem('edenia_v1')))).serialized)
    expect(JSON.parse(serialized).profile.videos.lesson.title).toBe('Source lesson')
    await page.unroute('**/config.local.js*')
    await config(page, false, indexedDb)
    await page.goto('./?internal_test=2')
    await waitForApp(page)
    await expect(page.locator('#introTrailer')).toBeVisible()
    expect(await page.evaluate(() => Object.keys(loadState()?.videos || {}))).toEqual([])
    expect(await retained(page)).toEqual(original)
    await page.evaluate(async () => {
      const state = loadState()
      const at = new Date().toISOString()
      Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at })
      state.config.ankiEnabled = false
      await saveState(state)
    })
    await page.reload()
    await expect(page.locator('#mainApp')).toBeVisible()
    await page.evaluate(() => {
      const input = document.getElementById('syncFileInput')
      openSettings()
      beginSettingsSyncImportInteraction(input)
    })
    await page.locator('#syncFileInput').setInputFiles({ name: 'source-profile.json', mimeType: 'application/json', buffer: Buffer.from(serialized) })
    await expect.poll(() => page.evaluate(() => loadState()?.videos?.lesson?.title)).toBe('Source lesson')
    expect(await page.evaluate(() => loadState().videos.lesson.watchProgress[0].seconds)).toBe(600)
    await page.evaluate(async () => {
      const state = loadState()
      state.config.theme = 'dark'
      await saveState(state)
    })
    expect(await retained(page)).toEqual(original)
    expect(await page.evaluate(() => getStateBackupEntries().length)).toBeGreaterThan(0)
    await page.reload()
    await waitForApp(page)
    await expect(page.locator('#mainApp')).toBeVisible()
    expect(await page.evaluate(() => loadState().videos.lesson.title)).toBe('Source lesson')
    expect(await page.evaluate(() => loadState().config.theme)).toBe('dark')
    await page.evaluate(async () => {
      openSettings()
      // Reset must accept an already verified, identical checkpoint backup.
      await createVerifiedStateBackup('tester checkpoint', { force: true, returnExisting: true })
    })
    await page.locator('[data-settings-reset-confirm-action="show"]').click()
    await page.locator('[data-settings-reset-confirm-action="confirm"]').click()
    await expect(page.locator('#introTrailer')).toBeVisible()
    await waitForApp(page)
    expect(await page.evaluate(() => loadState()?.tinySwordsIsland ?? null)).toBe(null)
    expect(await retained(page)).toEqual(original)
    expect(new URL(page.url()).searchParams.get('internal_test')).toBe('2')
    if (indexedDb) {
      const names = await page.evaluate(async () => (await indexedDB.databases()).map(database => database.name))
      expect(names).toContain('edenia_v1_internal_test_2_profiles_indexed_db_v1')
      expect(names).toContain('edenia_state_backups_v1_internal_test_2')
    }
    for (const [query, title] of [['', 'Source lesson'], ['?internal_test=1', 'Source lesson']]) {
      await page.goto(`./${query}`)
      await expect(page.locator('#mainApp')).toBeVisible()
      expect(await page.evaluate(() => loadState().videos.lesson.title)).toBe(title)
      await expect(page.locator('.tiny-swords-frame')).toHaveCount(0)
    }
    await page.goto('./?internal_test=2')
    await expect(page.locator('#introTrailer')).toBeVisible()
    expect(await page.evaluate(() => Object.keys(loadState().videos))).toEqual([])
  })
}
