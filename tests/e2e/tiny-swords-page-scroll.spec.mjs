import { expect, test } from '../support/network-fixture.mjs'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true' && process.env.EDENIA_TEST_NORMAL_PORT !== '8037', 'Selected only by the required Tiny Swords integration suite')

test('wheel over Tiny Swords scrolls Edenia without moving the camera', async ({ page }) => {
  test.setTimeout(90000)
  // Initialize the disposable learner before starting the large game export.
  await page.route('**/tiny-swords-game/*/index.html*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Preview initialization</title>' }))
  await page.goto('./?internal_test=2', { waitUntil: 'load' })
  await expect(page.locator('.tiny-swords-frame')).toHaveCount(1)
  await page.evaluate(() => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    state.onboarding = { ...state.onboarding, introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at }
    state.config.ankiEnabled = false
    state.videos.lesson = { id: 'lesson', title: 'XP game test', duration: 7200, status: 'unwatched', watchProgress: [] }
    localStorage.setItem('edenia_v1_internal_test_2', JSON.stringify(state))
  })
  await page.unroute('**/tiny-swords-game/*/index.html*')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const frame = page.frameLocator('.tiny-swords-frame')
  await expect(frame.locator('#canvas')).toBeVisible()
  await expect(frame.locator('#status')).toBeHidden({ timeout: 60000 })
  const gameFrame = () => page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  await expect.poll(() => gameFrame()?.evaluate(() => window.edeniaGameLevel), { timeout: 30000 }).toBe(1)
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 30000 })
  const game = gameFrame()
  const camera = () => game.evaluate(() => ({x:window.edeniaCamera.x,y:window.edeniaCamera.y,zoom:window.edeniaCamera.zoom}))
  const before = await camera()
  // Wheel forwarding is a delta, including from a nonzero browser scroll origin.
  await page.evaluate(() => window.scrollTo(0, 2))
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(2)
  const box = await frame.locator('#canvas').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const surface = page.locator('#tinySwordsSurface')
  const initialSurfaceTop = (await surface.boundingBox()).y
  await page.mouse.wheel(0, 120)
  // Header collapse changes scrollY through native anchoring while the visible
  // content still moves by the forwarded wheel delta.
  await expect.poll(async () => (await surface.boundingBox()).y)
    .toBeCloseTo(initialSurfaceTop - 120, 0)
  const scrolledY = await page.evaluate(() => scrollY)
  expect(await camera()).toEqual(before)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 120)
  await page.mouse.wheel(90, 0)
  await page.waitForTimeout(300)
  expect(await camera()).toEqual(before)
  await page.mouse.wheel(0, -60)
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(scrolledY - 60)
  expect(await camera()).toEqual(before)
  await page.screenshot({path:test.info().outputPath('edenia-page-scroll.png')})
})
