import { expect, test } from '../support/network-fixture.mjs'

for (const affected of [false, true]) {
  test(`${affected ? 'affected' : 'untouched'} profile retains historical points and town progress after reload`, async ({ page }) => {
    await page.goto('./')
    await page.evaluate(affected => {
      const state = defaultState(4, [], 'light', [], 'en')
      const at = new Date().toISOString()
      state.onboarding = { ...state.onboarding, introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at }
      state.config.ankiEnabled = false
      state.cityProgress = { maxLevelIndex: affected ? 0 : 2, pendingLevelIndex: null, scoringVersion: 7, ...(affected ? { experienceVersion: 1 } : {}) }
      state.videos.lesson = { id: 'lesson', title: 'Retained study lesson', duration: 18000, status: 'watched', watchedAt: at, watchProgress: [{ watchedAt: at, seconds: 16800, ...(affected ? { experienceSeconds: 300 } : {}) }] }
      localStorage.setItem('edenia_v1', JSON.stringify(state))
    }, affected)
    await page.reload()
    await expect(page.locator('#cityScore')).toHaveText('140')
    await expect(page.locator('#cityCurrentLevel')).toHaveText('Level 3')
    await expect(page.locator('#cityNextMilestonePoints')).toHaveText('230 pts')
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')).cityProgress)).toEqual({ maxLevelIndex: 2, pendingLevelIndex: null, scoringVersion: 7 })
    const facts = await page.evaluate(() => getTotalVideoWatchProgressSeconds(loadState().videos.lesson))
    expect(facts).toBe(16800)
    await page.reload()
    await expect(page.locator('#cityScore')).toHaveText('140')
    await expect(page.locator('#cityCurrentLevel')).toHaveText('Level 3')
  })
}

test('untouched profiles still claim newly earned town levels one at a time', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    state.onboarding = { ...state.onboarding, introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at }
    state.config.ankiEnabled = false
    state.videos.lesson = { id: 'lesson', title: 'New study', duration: 18000, status: 'watched', watchedAt: at, watchProgress: [{ watchedAt: at, seconds: 16800 }] }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await expect(page.locator('#cityCurrentLevel')).toHaveText('Level 1')
  await expect(page.locator('#levelUpButton')).toBeEnabled()
  await page.locator('#levelUpButton').click()
  await expect(page.locator('#cityCurrentLevel')).toHaveText('Level 2')
  await page.locator('#levelUpButton').click()
  await expect(page.locator('#cityCurrentLevel')).toHaveText('Level 3')
})
