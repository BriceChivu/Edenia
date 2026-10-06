import { expect, test } from '../support/network-fixture.mjs'

test('legacy study remains visible and live watching reaches the first three XP levels across reloads', async ({ page }) => {
  await page.goto('/?internal_test=2')
  await page.evaluate(() => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    state.onboarding = { ...state.onboarding, introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at }
    state.config.ankiEnabled = false
    state.cityProgress.maxLevelIndex = 11
    state.videos.lesson = { id: 'lesson', title: 'XP test lesson', duration: 7200, status: 'watched', watchedAt: at, watchProgress: [{ watchedAt: at, seconds: 600 }] }
    localStorage.setItem('edenia_v1_internal_test_2', JSON.stringify(state))
  })
  await page.reload()
  await expect(page.locator('#cityScore')).toHaveText('0')
  await expect(page.locator('#cityCurrentLevel')).toHaveText('Level 1')
  await expect(page.locator('#historySummaryView')).toContainText('Experience')
  await expect(page.locator('#historySummaryView')).toContainText('—')
  const baseline = await page.evaluate(() => ({ streak: loadState().streak.current, seconds: getTotalVideoWatchProgressSeconds(loadState().videos.lesson) }))
  expect(baseline.seconds).toBe(600)
  expect(baseline.streak).toBe(1)
  await page.locator('[data-history-view="heatmap"]').click()
  const day = page.locator('[data-history-heatmap-action="tooltip"]').last()
  await expect(day).toHaveAttribute('data-points', '')
  await day.click()
  await expect(page.locator('#heatmapTooltip')).not.toContainText('XP')
  await page.locator('[data-history-view="summary"]').click()

  async function watch(seconds) {
    await page.evaluate(seconds => {
      const state = loadState()
      addVideoShelfSessionProgress(state.videos.lesson, seconds, {}, new Date().toISOString())
      saveState(state)
    }, seconds)
    await page.reload()
  }
  await watch(420)
  await expect(page.locator('#cityScore')).toHaveText('7')
  await watch(480)
  await expect(page.locator('#cityScore')).toHaveText('15')
  await page.locator('#levelUpButton').press('Enter')
  await expect(page.locator('#cityCurrentLevel')).toHaveText('Level 2')
  await watch(1800)
  await expect(page.locator('#cityScore')).toHaveText('45')
  await page.locator('#levelUpButton').press('Enter')
  await expect(page.locator('#cityCurrentLevel')).toHaveText('Level 3')
  await expect(page.locator('#cityFollowingLevel')).toHaveText('Level 4')
  const facts = await page.evaluate(() => ({ seconds: getTotalVideoWatchProgressSeconds(loadState().videos.lesson), xp: getCurrentCityScore(loadState()) }))
  expect(facts).toEqual({ seconds: 3300, xp: 45 })
})
