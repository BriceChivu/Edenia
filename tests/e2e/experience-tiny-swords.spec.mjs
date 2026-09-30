import { expect, test } from '../support/network-fixture.mjs'

test('local Tiny Swords receives claimed study levels and grants each inventory reward once', async ({ page }) => {
  test.setTimeout(60000)
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
  const camera = () => gameFrame().evaluate(() => { const {x,y,zoom,width,height} = window.edeniaCamera || {}; return {x,y,zoom,width,height} })
  await expect.poll(async () => (await camera())?.zoom).toBeCloseTo(0.85)
  const initialCamera = await camera()
  const controls = page.locator('.tiny-swords-camera-controls')
  await expect(controls.locator('button')).toHaveCount(3)
  await expect(page.getByRole('button', { name: /^Pan / })).toHaveCount(0)
  await expect(controls.locator('button.city-image-btn svg.city-image-icon')).toHaveCount(3)
  const wrapBounds = await page.locator('.city-image-wrap').boundingBox()
  const controlBounds = await controls.boundingBox()
  expect(controlBounds.x - wrapBounds.x).toBeLessThan(15)
  expect(wrapBounds.y + wrapBounds.height - controlBounds.y - controlBounds.height).toBeLessThan(15)
  async function dragCamera(dx = 45, dy = 20) {
    const bounds = await frame.locator('#canvas').boundingBox()
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.mouse.down()
    await page.mouse.move(bounds.x + bounds.width / 2 + dx, bounds.y + bounds.height / 2 + dy, { steps: 8 })
    await page.mouse.up()
  }
  const pawn = () => gameFrame().evaluate(() => [window.edeniaCamera.pawnX, window.edeniaCamera.pawnY])
  const initialPawn = await pawn()
  await dragCamera()
  await expect.poll(async () => (await camera()).x).toBeLessThan(initialCamera.x)
  await expect.poll(async () => (await camera()).y).toBeLessThan(initialCamera.y)
  expect(await pawn()).toEqual(initialPawn)
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect.poll(async () => (await camera()).zoom).toBeCloseTo(0.75)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect.poll(async () => (await camera()).zoom).toBeCloseTo(0.85)
  await page.getByRole('button', { name: 'Reset view', exact: true }).click()
  await expect.poll(camera).toEqual(initialCamera)
  const walkBounds = await frame.locator('#canvas').boundingBox()
  await frame.locator('#canvas').click({ position: {
    x: ((608 - initialCamera.x) * initialCamera.zoom + initialCamera.width / 2) * walkBounds.width / initialCamera.width,
    y: ((208 - initialCamera.y) * initialCamera.zoom + initialCamera.height / 2) * walkBounds.height / initialCamera.height
  } })
  await expect.poll(async () => (await pawn())[0]).toBeGreaterThan(initialPawn[0] + 20)
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
  await expect(controls).toBeHidden()
  // Godot's known 0.7-second celebration entrance must finish before visual capture.
  await page.waitForTimeout(800)
  await page.screenshot({ path: test.info().outputPath('level-two-celebration.png') })
  const reward2 = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_tiny_swords_xp_layout_v1')))
  expect(reward2.stock.stairs).toBe(1)
  expect(reward2.stock.meadow + reward2.stock.gold).toBe(3)
  // A reload closes the celebration and restores the same earned inventory.
  await page.reload()
  await expect.poll(() => gameFrame().evaluate(() => window.edeniaGameLevel), { timeout: 60000 }).toBe(2)
  // Existing build launcher and placement still use transformed world coordinates.
  await dragCamera(-40, -15)
  await expect.poll(async () => (await camera()).x).toBeGreaterThan(initialCamera.x)
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect.poll(async () => (await camera()).zoom).toBeCloseTo(0.75)
  const canvas = frame.locator('#canvas')
  const bounds = await canvas.boundingBox()
  await canvas.click({ position: { x: bounds.width - 65, y: bounds.height - 30 } })
  await dragCamera(15, 10)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_tiny_swords_xp_layout_v1')))).toEqual(reward2)
  expect(await pawn()).toEqual(initialPawn)
  const view = await camera()
  await canvas.click({ position: {
    x: ((672 - view.x) * view.zoom + view.width / 2) * bounds.width / view.width,
    y: ((208 - view.y) * view.zoom + view.height / 2) * bounds.height / view.height
  } })
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('edenia_tiny_swords_xp_layout_v1')).stock.meadow)).toBe(reward2.stock.meadow - 1)
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
