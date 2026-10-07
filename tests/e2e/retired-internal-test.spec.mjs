import { expect, test } from '../support/network-fixture.mjs'

test('retired mode 1 opens ordinary Edenia without reading or changing its old profile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await page.route('**/config.local.js*', route => route.fulfill({
    contentType: 'text/javascript',
    body: 'window.EDENIA_CONFIG={accountFeaturesRollout:"internal",tinySwordsEnabled:true,studyGuidanceEnabled:false}'
  }))
  await page.goto('/')
  await page.waitForFunction(() => typeof window.defaultState === 'function')
  const retained = await page.evaluate(() => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const at = '2026-10-07T01:00:00.000Z'
    state.config.ankiEnabled = false
    state.config.weeklyGoalHours = 7
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at })
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    const entries = {
      edenia_v1_internal_test: '{retired-profile-bytes',
      edenia_v1_internal_test_backups: '[retired-backup-bytes',
      edenia_v1_internal_test_plus_auth_v1: 'retired-session-bytes',
      edenia_v1_internal_test_learner_profile_access_v1: 'retired-ownership-bytes'
    }
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
    document.cookie = 'edenia_config_internal_test=retired-marker; path=/'
    return entries
  })
  await page.addInitScript(() => {
    window.retiredModeReads = []
    const get = Storage.prototype.getItem
    Storage.prototype.getItem = function(key) {
      if (key.startsWith('edenia_v1_internal_test') && !key.startsWith('edenia_v1_internal_test_2')) window.retiredModeReads.push(key)
      return get.call(this, key)
    }
  })
  const gameRequests = []
  page.on('request', request => {
    if (request.url().includes('/tiny-swords-game/') || request.url().includes('/pixel-town/')) gameRequests.push(request.url())
  })
  await page.goto('/?internal_test=1&source=retired#study')
  await expect(page).toHaveURL(/\?source=retired#study$/)
  await expect(page.locator('#mainApp')).toBeVisible()
  expect(await page.evaluate(() => ({
    reads: window.retiredModeReads,
    accounts: ACCOUNT_FEATURES_ENABLED,
    guidance: STUDY_GUIDANCE_ENABLED,
    tester: window.EDENIA_INTERNAL_TEST,
    weeklyGoal: loadState().config.weeklyGoalHours
  }))).toEqual({ reads: [], accounts: false, guidance: false, tester: false, weeklyGoal: 7 })
  expect(gameRequests).toEqual([])
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('edenia_v1_internal_test'))))).toEqual(retained)
  expect(await page.evaluate(() => document.cookie)).toContain('edenia_config_internal_test=retired-marker')
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  expect(await page.evaluate(() => window.retiredModeReads)).toEqual([])
})
