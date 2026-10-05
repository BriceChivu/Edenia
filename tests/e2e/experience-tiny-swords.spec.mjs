import { expect, test } from '../support/network-fixture.mjs'

test('local Tiny Swords receives claimed study levels and grants each inventory reward once', async ({ page }) => {
  test.setTimeout(180000)
  // This local export has no PWA. Stub the browser's registration lookup during frame teardown.
  await page.addInitScript(() => { if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'getRegistration', { value: async () => undefined }) })
  // Initialize the disposable learner before starting the large game export.
  await page.route('**/tiny-swords-xp-game/index.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Preview initialization</title>' }))
  await page.goto('/', { waitUntil: 'load' })
  test.skip(await page.locator('.tiny-swords-frame').count() === 0, 'Requires the explicit local Godot integration build')
  await page.evaluate(() => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    state.onboarding = { ...state.onboarding, introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at }
    state.config.ankiEnabled = false
    state.videos.lesson = { id: 'lesson', title: 'XP game test', duration: 7200, status: 'unwatched', watchProgress: [] }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.unroute('**/tiny-swords-xp-game/index.html')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const frame = page.frameLocator('.tiny-swords-frame')
  await expect(frame.locator('#canvas')).toBeVisible()
  await expect(frame.locator('#status')).toBeHidden({ timeout: 60000 })
  const gameFrame = () => page.frames().find(frame => frame.url().includes('/tiny-swords-xp-game/index.html'))
  await expect.poll(() => gameFrame()?.evaluate(() => window.edeniaGameLevel), { timeout: 30000 }).toBe(1)
  const camera = () => gameFrame().evaluate(() => { const {x,y,zoom,width,height} = window.edeniaCamera || {}; return {x,y,zoom,width,height} })
  await expect.poll(async () => (await camera())?.zoom).toBeCloseTo(0.8)
  const initialCamera = await camera()
  const controls = page.locator('.tiny-swords-camera-controls')
  await expect(controls.locator('button')).toHaveCount(3)
  await expect(page.getByRole('button', { name: /^Pan / })).toHaveCount(0)
  await expect(controls.locator('button.city-image-btn svg.city-image-icon')).toHaveCount(3)
  const wrapBounds = await page.locator('.city-image-wrap').boundingBox()
  const controlBounds = await controls.boundingBox()
  expect(controlBounds.x - wrapBounds.x).toBeLessThan(15)
  expect(wrapBounds.y + wrapBounds.height - controlBounds.y - controlBounds.height).toBeLessThan(15)
  const buttonOpacities = () => controls.locator('button').evaluateAll(buttons => buttons.map(button => getComputedStyle(button).opacity))
  await page.mouse.move(wrapBounds.x + wrapBounds.width / 2, wrapBounds.y + wrapBounds.height / 2)
  await expect.poll(buttonOpacities).toEqual(['0.38', '0.38', '0.38'])
  await controls.locator('[data-city-zoom-action="in"]').hover()
  await expect.poll(buttonOpacities).toEqual(['0.38', '0.38', '1'])
  for (const button of await controls.locator('button').all()) {
    await button.hover()
    await expect(button).toHaveCSS('cursor', /data:image\/png;base64/)
    await page.mouse.down()
    await expect(button).toHaveCSS('cursor', /data:image\/png;base64/)
    await page.mouse.up()
    await expect(button).toHaveCSS('cursor', /data:image\/png;base64/)
  }
  const backgrounds = await controls.locator('button').evaluateAll(buttons => buttons.map(button => getComputedStyle(button, innerWidth <= 480 ? '::before' : null).backgroundColor))
  expect(backgrounds).toEqual(['rgba(255, 255, 255, 0.64)', 'rgba(255, 255, 255, 0.64)', 'rgba(255, 255, 255, 0.64)'])
  await page.mouse.move(wrapBounds.x + wrapBounds.width / 2, wrapBounds.y + wrapBounds.height / 2)
  await page.screenshot({ path: test.info().outputPath('camera-controls.png') })
  async function dragCamera(dx = 45, dy = 20) {
    const bounds = await frame.locator('#canvas').boundingBox()
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.mouse.down()
    await page.mouse.move(bounds.x + bounds.width / 2 + dx, bounds.y + bounds.height / 2 + dy, { steps: 8 })
    await page.mouse.up()
  }
  const pawn = () => gameFrame().evaluate(() => [window.edeniaCamera.pawnX, window.edeniaCamera.pawnY])
  const initialPawn = await pawn()
  await page.mouse.move(wrapBounds.x + wrapBounds.width / 2, wrapBounds.y + wrapBounds.height / 2)
  // Cursor checks click all camera buttons; wait for their queued commands.
  await page.getByRole('button', { name: 'Reset view', exact: true }).click()
  await expect.poll(camera).toEqual(initialCamera)
  const scrollBounds = await frame.locator('#canvas').boundingBox()
  await page.mouse.move(scrollBounds.x + scrollBounds.width / 2, scrollBounds.y + scrollBounds.height / 2)
  const beforeScroll = await camera()
  const parentScroll = await page.evaluate(() => [scrollX, scrollY])
  await page.mouse.wheel(70, 80)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(parentScroll[1])
  expect(await camera()).toEqual(beforeScroll)
  await page.evaluate(() => window.scrollTo(0, 0))
  expect(await pawn()).toEqual(initialPawn)
  await page.getByRole('button', { name: 'Reset view', exact: true }).click()
  await expect.poll(camera).toEqual(initialCamera)
  await dragCamera()
  await expect.poll(async () => (await camera()).x).toBeLessThan(initialCamera.x)
  await expect.poll(async () => (await camera()).y).toBeLessThan(initialCamera.y)
  expect(await pawn()).toEqual(initialPawn)
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect.poll(async () => (await camera()).zoom).toBeCloseTo(0.7)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect.poll(async () => (await camera()).zoom).toBeCloseTo(0.8)
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
  await expect.poll(() => gameFrame()?.evaluate(() => window.edeniaGameLevel), { timeout: 30000 }).toBe(1)
  await page.locator('#levelUpButton').press('Enter')
  await expect.poll(() => gameFrame()?.evaluate(() => window.edeniaGameLevel)).toBe(2)
  await expect(controls).toBeHidden()
  // Godot's known 0.7-second celebration entrance must finish before visual capture.
  await page.waitForTimeout(800)
  await page.screenshot({ path: test.info().outputPath('level-two-celebration.png') })
  const reward2 = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')).tinySwordsIsland)
  expect(reward2.stock.stairs).toBe(1)
  expect(reward2.stock.meadow + reward2.stock.gold).toBe(3)
  // A reload closes the celebration and restores the same earned inventory.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect.poll(() => gameFrame()?.evaluate(() => window.edeniaGameLevel), { timeout: 60000 }).toBe(2)
  // Existing build launcher and placement still use transformed world coordinates.
  await dragCamera(-40, -15)
  await expect.poll(async () => (await camera()).x).toBeGreaterThan(initialCamera.x)
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect.poll(async () => (await camera()).zoom).toBeCloseTo(0.7)
  const canvas = frame.locator('#canvas')
  const bounds = await canvas.boundingBox()
  await canvas.click({ position: { x: bounds.width - 36, y: bounds.height - 32 } })
  await dragCamera(15, 10)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')).tinySwordsIsland)).toEqual(reward2)
  expect(await pawn()).toEqual(initialPawn)
  // Opening inventory clears selection; explicitly choose Ground.
  await canvas.click({ position: { x: bounds.width - 179, y: bounds.height - 32 } })
  const view = await camera()
  await canvas.click({ position: {
    x: ((672 - view.x) * view.zoom + view.width / 2) * bounds.width / view.width,
    y: ((208 - view.y) * view.zoom + view.height / 2) * bounds.height / view.height
  } })
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')).tinySwordsIsland.stock.meadow)).toBe(reward2.stock.meadow - 1)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect.poll(() => gameFrame()?.evaluate(() => window.edeniaGameLevel), { timeout: 60000 }).toBe(2)
  await watch(1800)
  await page.locator('#levelUpButton').press('Enter')
  await expect.poll(() => gameFrame()?.evaluate(() => window.edeniaGameLevel)).toBe(3)
  const reward3 = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')).tinySwordsIsland)
  expect(reward3.stock.stairs).toBe(2)
  expect(reward3.stock.tree).toBe(1)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect.poll(() => gameFrame()?.evaluate(() => window.edeniaGameLevel), { timeout: 60000 }).toBe(3)
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')).tinySwordsIsland)
  expect(restored).toEqual(reward3)
  // Load a raised spawn through the real persistence adapter, then click water.
  const raised = structuredClone(restored)
  const home = raised.tiles.find(tile => tile[0] === 0 && tile[1] === 0)
  home[2] = 'high_meadow'
  home[6] = 64
  await page.evaluate(layout => { const state = loadState(); state.tinySwordsIsland = layout; return saveImportedState(state) }, raised)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect.poll(() => gameFrame()?.evaluate(() => window.edeniaGameLevel), { timeout: 60000 }).toBe(3)
  const highPawn = await pawn()
  async function clickWater() {
    const view = await camera()
    const bounds = await frame.locator('#canvas').boundingBox()
    await frame.locator('#canvas').click({position:{
      x: ((400 - view.x) * view.zoom + view.width / 2) * bounds.width / view.width,
      y: ((208 - view.y) * view.zoom + view.height / 2) * bounds.height / view.height
    }})
  }
  await clickWater()
  await page.waitForTimeout(500)
  expect(await pawn()).toEqual(highPawn)
  expect(await gameFrame().evaluate(() => window.edeniaCamera.waterPhase)).toBe(0)
  await page.evaluate(layout => { const state = loadState(); state.tinySwordsIsland = layout; return saveImportedState(state) }, restored)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect.poll(() => gameFrame()?.evaluate(() => window.edeniaGameLevel), { timeout: 60000 }).toBe(3)
  await clickWater()
  await expect.poll(() => gameFrame().evaluate(() => window.edeniaCamera.waterPhase)).toBeGreaterThan(0)
  await expect.poll(() => gameFrame().evaluate(() => window.edeniaCamera.waterPhase), {timeout:10000}).toBe(0)
  const respawn = await pawn()
  expect(restored.tiles.filter(tile => tile[2] !== 'stairs').some(tile =>
    respawn[0] === 544 + tile[0] * 64 && respawn[1] === 208 + tile[1] * 64
  )).toBe(true)
})

test('profile replacement recreates the island, resets it, and blocks a rejected snapshot', async ({ page }) => {
  test.setTimeout(180000)
  await page.addInitScript(() => { if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'getRegistration', { value: async () => undefined }) })
  await page.route('**/tiny-swords-xp-game/index.html', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Initialize</title>'}))
  await page.goto('/', {waitUntil:'load'})
  test.skip(await page.locator('.tiny-swords-frame').count() === 0, 'Requires the explicit local Godot integration build')
  const { readFile } = await import('node:fs/promises')
  const island = JSON.parse(await readFile('tests/fixtures/tiny-swords-populated-island.json','utf8'))
  await page.evaluate(island => {
    const state = defaultState(4, [], 'light', [], 'en')
    state.tinySwordsIsland = island
    const at = new Date().toISOString()
    state.onboarding = {...state.onboarding,introSeenAt:at,setupCompleted:true,setupCompletedAt:at,walkthroughCompleted:true,walkthroughCompletedAt:at}
    localStorage.setItem('edenia_v1',JSON.stringify(state))
  }, island)
  await page.unroute('**/tiny-swords-xp-game/index.html')
  await page.reload({waitUntil:'domcontentloaded'})
  const game = () => page.frames().find(frame => frame.url().includes('/tiny-swords-xp-game/index.html'))
  const durable = () => page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')).tinySwordsIsland)
  await expect.poll(() => game()?.evaluate(() => window.edeniaLastSavePersisted),{timeout:60000}).toBe(true)
  const populated = await durable()
  expect(populated.stock).toEqual(island.stock)
  expect(populated.house_bundle).toBe(6)
  expect(populated.tree_cut_remaining).toEqual(island.tree_cut_remaining)
  const oldFrame = game()
  await page.evaluate(() => {
    const state = loadState(); state.tinySwordsIsland = null; state.cityProgress = {maxLevelIndex:0}
    return saveImportedState(state)
  })
  await expect.poll(() => oldFrame.isDetached()).toBe(true)
  await expect.poll(() => game()?.evaluate(() => window.edeniaGameLevel),{timeout:60000}).toBe(1)
  await expect.poll(async () => (await durable())?.level).toBe(1)
  await page.reload({waitUntil:'domcontentloaded'})
  await expect.poll(() => game()?.evaluate(() => window.edeniaGameLevel),{timeout:60000}).toBe(1)
  // Existing profile replacement is also the adapter used by recovery/Undo.
  await page.evaluate(island => {const state=loadState();state.tinySwordsIsland=island;return saveImportedState(state)},populated)
  await expect.poll(() => game()?.evaluate(() => window.edeniaGameLevel),{timeout:60000}).toBe(7)
  const rejected = {...populated,version:999}
  await page.evaluate(island => {const state=loadState();state.tinySwordsIsland=island;return saveImportedState(state)},rejected)
  await expect(page.locator('.tiny-swords-save-status')).toHaveText(/could not be restored/,{timeout:60000})
  await expect(page.locator('.tiny-swords-save-status')).toBeVisible()
  expect(await durable()).toEqual(rejected)
})
