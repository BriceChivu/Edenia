import { expect, test } from '../support/network-fixture.mjs'

test.skip(process.env.EDENIA_TEST_NORMAL_PORT !== '8037', 'Playground is available only on the dedicated developer origin')

test('playground upgrades, generates terrain, reloads supplies and restores a checkpoint without study XP', async ({ page, context }) => {
  test.setTimeout(180000)
  await page.addInitScript(() => { if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'getRegistration', { value: async () => undefined }) })
  await page.route('**/tiny-swords-game/*/index.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Initialize</title>' }))
  await page.goto('./', { waitUntil: 'load' })
  await expect(page.locator('.tiny-swords-frame')).toHaveCount(1)
  await page.evaluate(() => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    state.onboarding = { ...state.onboarding, introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at }
    state.config.ankiEnabled = false
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.unroute('**/tiny-swords-game/*/index.html')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const game = () => page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  const durable = () => page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')).tinySwordsIsland)
  let canvas = page.frameLocator('.tiny-swords-frame').locator('#canvas')
  await expect.poll(() => game()?.evaluate(() => window.edeniaGameLevel), { timeout: 60000 }).toBe(1)
  await expect.poll(() => game()?.evaluate(() => window.edeniaLastSavePersisted)).toBe(true)
  const startBounds = await canvas.boundingBox()
  await canvas.click({ position: { x: startBounds.width / 2, y: startBounds.height / 2 } })
  await expect.poll(async () => (await durable())?.island_started).toBe(true)
  await page.waitForTimeout(2200) // Wait for the first pawn's dust arrival.
  const initial = await durable()
  async function clickAt(right, top) {
    const bounds = await canvas.boundingBox()
    await canvas.click({ position: { x: bounds.width - right, y: top } })
  }
  // Godot scales this plain HUD to CSS pixels at every canvas size.
  await clickAt(72, 23) // Open playground.
  await clickAt(228, 82) // Level +1.
  await expect.poll(() => game()?.evaluate(() => window.edeniaGameLevel)).toBe(2)
  const bounds = await canvas.boundingBox()
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 + 114 } }) // Reward OK.
  await expect.poll(() => game()?.evaluate(() => window.edeniaCamera.editing)).toBe(true)
  await clickAt(72, 23)
  await clickAt(72, 146) // Restore the automatic level-one checkpoint.
  await expect.poll(async () => (await durable())?.level).toBe(1)
  await page.waitForTimeout(800) // More than the bridge polling interval; detect unwanted re-upgrade.
  const { island_started: _started, ...initialLayout } = initial
  expect((await durable()).playground_checkpoint.island).toEqual(initialLayout)
  await clickAt(228, 82)
  await expect.poll(() => game()?.evaluate(() => window.edeniaGameLevel)).toBe(2)
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 + 114 } })
  await expect.poll(() => game()?.evaluate(() => window.edeniaCamera.editing)).toBe(true)
  await clickAt(72, 23)
  await clickAt(228, 114) // Random terrain.
  await expect.poll(async () => (await durable())?.tiles.length).toBeGreaterThan(5)
  await clickAt(72, 82) // Supplies.
  await expect.poll(async () => (await durable())?.playground_grants?.ground).toBeGreaterThan(0)
  const generated = await durable()
  await clickAt(72, 178) // Level -1; preserve unlocked terrain and supplies.
  await expect.poll(() => game()?.evaluate(() => window.edeniaGameLevel)).toBe(1)
  await page.waitForTimeout(500)
  expect(await durable()).toEqual(generated)
  await clickAt(228, 82) // Replay Level 2.
  await expect.poll(() => game()?.evaluate(() => window.edeniaGameLevel)).toBe(2)
  await expect(page.locator('.tiny-swords-camera-controls')).toBeHidden()
  await page.waitForTimeout(400) // Finish the reward popup entrance before capture.
  await page.screenshot({ path: test.info().outputPath('level-two-replay.png') })
  expect(await durable()).toEqual(generated)
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 + 114 } })
  await expect.poll(() => game()?.evaluate(() => window.edeniaCamera.editing)).toBe(true)
  await clickAt(72, 23)
  await page.screenshot({ path: test.info().outputPath('playground.png') })
  await clickAt(228, 146) // Explicitly save generated terrain and supplies.
  await expect.poll(async () => (await durable())?.playground_checkpoint?.island?.tiles).toEqual(generated.tiles)
  const savedCheckpoint = await durable()
  await expect(page.locator('#cityScore')).toHaveText('0')
  expect(await page.evaluate(() => loadState().cityProgress.maxLevelIndex)).toBe(0)
  // Bypass the HTTP cache, matching a hard refresh rather than an ordinary reload.
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await cdp.detach()
  await expect.poll(() => game()?.evaluate(() => window.edeniaGameLevel), { timeout: 60000 }).toBe(2)
  await expect.poll(() => game()?.evaluate(() => window.edeniaLastSavePersisted)).toBe(true)
  expect(await durable()).toEqual(savedCheckpoint)
  await clickAt(72, 23)
  await clickAt(228, 178) // Fresh island changes the current state after reload.
  await expect.poll(async () => (await durable())?.tiles.length).toBe(5)
  await clickAt(72, 146) // Restore the durable checkpoint.
  await expect.poll(durable).toEqual(savedCheckpoint)
  // No unload write can reach the host while it is unavailable. A new page
  // must restore the checkpoint from durable browser storage on return.
  const url = page.url()
  await context.setOffline(true)
  await page.close()
  await context.setOffline(false)
  page = await context.newPage()
  canvas = page.frameLocator('.tiny-swords-frame').locator('#canvas')
  await page.addInitScript(() => { if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'getRegistration', { value: async () => undefined }) })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await expect.poll(() => game()?.evaluate(() => window.edeniaGameLevel), { timeout: 60000 }).toBe(2)
  await expect.poll(() => game()?.evaluate(() => window.edeniaLastSavePersisted)).toBe(true)
  expect(await durable()).toEqual(savedCheckpoint)
  await clickAt(72, 23)
  await clickAt(228, 178)
  await expect.poll(async () => (await durable())?.tiles.length).toBe(5)
  await clickAt(72, 146)
  await expect.poll(durable).toEqual(savedCheckpoint)
})
