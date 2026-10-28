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
  // Keep both directions above the phone header's expansion threshold. Its
  // collapse/expansion changes layout independently of the forwarded delta.
  // Wait for that scroll handler before setting a nonzero, stable origin.
  await page.evaluate(async () => {
    window.scrollTo(0, 80)
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    window.scrollTo(0, 80)
  })
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(80)
  const moveOverCanvas = async () => {
    const box = await frame.locator('#canvas').boundingBox()
    const viewportHeight = await page.evaluate(() => innerHeight)
    const header = await page.locator('.app-header').boundingBox()
    const top = Math.max(0, box.y, header.y + header.height)
    const bottom = Math.min(viewportHeight, box.y + box.height)
    expect(bottom - top).toBeGreaterThan(20)
    await page.mouse.move(box.x + box.width / 2, (top + bottom) / 2)
  }
  await moveOverCanvas()
  const surface = page.locator('#tinySwordsSurface')
  const initialSurfaceTop = (await surface.boundingBox()).y
  await page.mouse.wheel(0, 120)
  await expect.poll(async () => (await surface.boundingBox()).y)
    .toBeCloseTo(initialSurfaceTop - 120, 0)
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(200)
  expect(await camera()).toEqual(before)
  await moveOverCanvas()
  await page.mouse.wheel(90, 0)
  await page.waitForTimeout(300)
  expect(await camera()).toEqual(before)
  const beforeUpTop = (await surface.boundingBox()).y
  await page.mouse.wheel(0, -60)
  await expect.poll(async () => (await surface.boundingBox()).y).toBeCloseTo(beforeUpTop + 60, 0)
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(140)
  expect(await camera()).toEqual(before)
  await page.screenshot({path:test.info().outputPath('edenia-page-scroll.png')})
})
