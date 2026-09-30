import { expect, test } from '../support/network-fixture.mjs'

test('local Tiny Swords receives claimed study levels and grants each inventory reward once', async ({ page }) => {
  await page.goto('/')
  test.skip(await page.locator('.tiny-swords-frame').count() === 0, 'Requires the explicit local Godot integration build')
  await page.evaluate(() => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    state.onboarding = { ...state.onboarding, introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at }
    state.config.ankiEnabled = false
    state.videos.lesson = { id: 'lesson', title: 'XP game test', duration: 7200, status: 'unwatched', watchProgress: [] }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  const frame = page.frameLocator('.tiny-swords-frame')
  await expect(frame.locator('#canvas')).toBeVisible()
  await expect(frame.locator('#status')).toBeHidden({ timeout: 60000 })
  const gameFrame = () => page.frames().find(frame => frame.url().includes('/tiny-swords/index.html'))
  await expect.poll(() => gameFrame().evaluate(() => window.edeniaGameLevel)).toBe(1)
  async function watch(seconds) {
    await page.evaluate(seconds => {
      const state = loadState()
      addVideoShelfSessionProgress(state.videos.lesson, seconds, {}, new Date().toISOString())
      saveState(state)
      renderAll(state)
    }, seconds)
  }
  await watch(900)
  await expect(page.locator('#cityScore')).toHaveText('15')
  await expect.poll(() => gameFrame().evaluate(() => window.edeniaGameLevel)).toBe(1)
  await page.locator('#levelUpButton').press('Enter')
  await expect.poll(() => gameFrame().evaluate(() => window.edeniaGameLevel)).toBe(2)
  const reward2 = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_tiny_swords_xp_layout_v1')))
  expect(reward2.stock.stairs).toBe(1)
  expect(reward2.stock.meadow + reward2.stock.gold).toBe(3)
  // A reload closes the celebration and restores the same earned inventory.
  await page.reload()
  await expect.poll(() => gameFrame().evaluate(() => window.edeniaGameLevel), { timeout: 60000 }).toBe(2)
  await watch(1800)
  await page.locator('#levelUpButton').press('Enter')
  await expect.poll(() => gameFrame().evaluate(() => window.edeniaGameLevel)).toBe(3)
  const reward3 = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_tiny_swords_xp_layout_v1')))
  expect(reward3.stock.stairs).toBe(2)
  expect(reward3.stock.tree).toBe(1)
  await page.reload()
  await expect.poll(() => gameFrame().evaluate(() => window.edeniaGameLevel), { timeout: 60000 }).toBe(3)
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_tiny_swords_xp_layout_v1')))
  expect(restored).toEqual(reward3)
})
