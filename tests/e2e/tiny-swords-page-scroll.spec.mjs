import { expect, test } from '../support/network-fixture.mjs'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true' && process.env.EDENIA_TEST_NORMAL_PORT !== '8037', 'Selected only by the required Tiny Swords integration suite')

test('wheel over Tiny Swords scrolls Edenia without moving the camera', async ({ page }) => {
  test.setTimeout(90000)
  // Initialize the disposable learner before starting the large game export.
  await page.route('**/tiny-swords-game/*/index.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Preview initialization</title>' }))
  await page.goto('./', { waitUntil: 'load' })
  await expect(page.locator('.tiny-swords-frame')).toHaveCount(1)
  await page.evaluate(() => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    state.onboarding = { ...state.onboarding, introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at }
    state.config.ankiEnabled = false
    state.videos.lesson = { id: 'lesson', title: 'XP game test', duration: 7200, status: 'unwatched', watchProgress: [] }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.unroute('**/tiny-swords-game/*/index.html')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const frame = page.frameLocator('.tiny-swords-frame')
  await expect(frame.locator('#canvas')).toBeVisible()
  await expect(frame.locator('#status')).toBeHidden({ timeout: 60000 })
  const gameFrame = () => page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  await expect.poll(() => gameFrame()?.evaluate(() => window.edeniaGameLevel), { timeout: 30000 }).toBe(1)
  const game = gameFrame()
  const camera = () => game.evaluate(() => ({x:window.edeniaCamera.x,y:window.edeniaCamera.y,zoom:window.edeniaCamera.zoom}))
  const before = await camera()
  const box = await frame.locator('#canvas').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 120)
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(120)
  expect(await camera()).toEqual(before)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 120)
  await page.mouse.wheel(90, 0)
  await page.waitForTimeout(300)
  expect(await camera()).toEqual(before)
  await page.mouse.wheel(0, -60)
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(60)
  expect(await camera()).toEqual(before)
  await page.screenshot({path:test.info().outputPath('edenia-page-scroll.png')})
})
