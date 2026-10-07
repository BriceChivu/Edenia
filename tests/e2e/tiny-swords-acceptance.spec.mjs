import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Uses the integrated Godot build')

// Bounded acceptance of the browser/game boundary. Physical devices remain a
// separate evidence requirement; these viewport projects are emulation.
test('developed island loads compressed, remains usable, and releases keyboard focus', async ({ page, request }, testInfo) => {
  test.setTimeout(120000)
  await page.route('**/tiny-swords-game/*/index.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Initialize</title>' }))
  await page.goto('./?internal_test=2')
  const island = JSON.parse(await readFile('tests/fixtures/tiny-swords-populated-island.json', 'utf8'))
  island.carried_wood += island.house_bundle
  island.house_bundle = 0
  await page.evaluate(island => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at, levelUpGuidanceShownAt: at })
    state.config.ankiEnabled = false
    state.cityProgress = { maxLevelIndex: 6, experienceVersion: 1 }
    state.tinySwordsIsland = island
    state.videos.lesson = { id: 'lesson', title: 'Retained study', duration: 3600, status: 'partial', watchProgress: [{ watchedAt: at, seconds: 900, experienceSeconds: 900 }] }
    localStorage.setItem('edenia_v1_internal_test_2', JSON.stringify(state))
  }, island)
  await page.unroute('**/tiny-swords-game/*/index.html')
  const responses = []
  page.on('response', response => {
    if (/\/index\.(wasm|pck)\.br$/.test(response.url())) responses.push(response)
  })
  await page.addInitScript(() => {
    window.islandLoadingProgress = []
    addEventListener('message', event => {
      if (event.origin === location.origin && event.data?.type === 'edenia-game-loading-progress') {
        window.islandLoadingProgress.push(event.data)
      }
    })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 60000 })
  const readyMs = await page.evaluate(() => performance.now())
  const game = page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  const expectedBytes = await game.evaluate(() => Object.values(window.edeniaGameAssets.files).reduce((sum, asset) => sum + asset.bytes, 0))
  const downloadProgress = await page.evaluate(() => window.islandLoadingProgress)
  expect(downloadProgress.some(item => item.current > 0)).toBe(true)
  expect(downloadProgress.every(item => item.total === expectedBytes && item.current <= item.total)).toBe(true)
  await expect(page.locator('#tinySwordsLoadProgress')).toBeHidden()
  await expect.poll(() => game.evaluate(() => window.edeniaLastSavePersisted)).toBe(true)
  const release = await (await request.get(new URL('release.json', game.url()).href)).json()
  const transfer = await Promise.all(responses.map(async response => ({
    asset: new URL(response.url()).pathname.split('/').at(-1),
    encoding: await response.headerValue('content-encoding'),
    bytes: Number(await response.headerValue('content-length'))
  })))
  expect(transfer.map(item => item.asset).sort()).toEqual(['index.pck.br', 'index.wasm.br'])
  for (const asset of transfer) {
    // Explicit Brotli artifacts work even without HTTP Content-Encoding.
    expect(asset.encoding).toBeNull()
    expect(asset.bytes).toBeGreaterThan(0)
  }
  // Desktop HTTP compression negotiation is evidence independent of viewport.
  for (const encoding of ['br', 'gzip']) {
    const response = await request.head(new URL(`../../tiny-swords-engine/${release.engineHash}/index.wasm`, game.url()).href, { headers: { 'Accept-Encoding': encoding } })
    expect(response.headers()['content-encoding']).toBe(encoding)
  }
  const canvas = game.locator('#canvas')
  const box = await canvas.boundingBox()
  const initial = await page.evaluate(() => loadState().tinySwordsIsland)
  const isTouch = testInfo.project.use.hasTouch
  if (isTouch) {
    const touch = await page.context().newCDPSession(page)
    const before = await game.evaluate(() => window.edeniaCamera.x)
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
    for (let step = 1; step <= 5; step++) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x - step * 8, y: point.y - step * 2 }] })
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => game.evaluate(() => window.edeniaCamera.x)).toBeGreaterThan(before)
    await touch.detach()
  }
  if (isTouch) await page.touchscreen.tap(box.x + box.width - 36, box.y + box.height - 32)
  else await canvas.click({ position: { x: box.width - 36, y: box.height - 32 } })
  await expect.poll(() => game.evaluate(() => window.edeniaCamera.editing)).toBe(true)
  // The high-level strip includes Ground, Stairs, Tree, Sheep, Chicken,
  // Pick up and Undo. Sheep is available even in the narrow viewport.
  const sheep = { x: box.width - 274 - 67 + 184 + 16, y: box.height - 44 }
  if (isTouch) await page.touchscreen.tap(box.x + sheep.x, box.y + sheep.y)
  else await canvas.click({ position: sheep })
  await page.screenshot({ path: testInfo.outputPath('developed-inventory.png') })
  await canvas.focus()
  await page.keyboard.press('Tab')
  await page.screenshot({ path: testInfo.outputPath('keyboard-focus.png') })
  await page.keyboard.press('Escape')
  await expect.poll(() => game.evaluate(() => window.edeniaCamera.editing)).toBe(false)
  await page.keyboard.press('Escape')
  const reset = page.getByRole('button', { name: 'Reset view', exact: true })
  await expect(reset).toBeFocused()
  await expect(page.locator('#tinySwordsInputHelp')).toHaveCount(0)
  await expect(page.locator('#cityLevelProgress')).toHaveAttribute('aria-valuenow', '315')
  await expect(page.locator('#cityCurrentLevel')).toHaveText('Level 7')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => game.evaluate(() => window.edeniaReducedMotion)).toBe(true)
  await expect(reset).toHaveCSS('transition-duration', '0s')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => game.evaluate(() => window.edeniaReducedMotion)).toBe(false)
  // Offscreen and covered suspension must retain the same engine and island.
  // Give the short synthetic desktop feed enough page scroll to fully cover it.
  await page.evaluate(() => {
    const runway = document.createElement('div')
    runway.style.height = '120vh'
    document.querySelector('#mainApp').append(runway)
  })
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => game.evaluate(() => window.edeniaPresentationSuspended)).toBe(true)
  await page.locator('#tinySwordsSurface').scrollIntoViewIfNeeded()
  await expect.poll(() => game.evaluate(() => window.edeniaPresentationSuspended)).toBe(false)
  await page.evaluate(() => openSettings())
  await expect.poll(() => game.evaluate(() => window.edeniaPresentationSuspended)).toBe(true)
  await page.locator('#settingsCloseBtn').click()
  await expect.poll(() => game.evaluate(() => window.edeniaPresentationSuspended)).toBe(false)
  // Exercise the retained feed/player with the existing external-service stub.
  await page.evaluate(() => openVideoPlayer('lesson'))
  await expect(page.locator('.video-player-overlay')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.video-player-overlay')).toBeHidden()
  expect(page.frames().includes(game)).toBe(true)
  const saved = await page.evaluate(() => loadState().tinySwordsIsland)
  expect(saved.tiles).toEqual(initial.tiles)
  expect(saved.stock).toEqual(initial.stock)
  const evidence = {
    recordedAt: new Date().toISOString(), project: testInfo.project.name,
    viewport: testInfo.project.use.viewport, physicalDevice: false,
    userAgent: await page.evaluate(() => navigator.userAgent), release,
    navigationToReadyMs: readyMs, transfer,
    progressAccessibility: await page.locator('#cityLevelProgress').ariaSnapshot(),
    canvasAccessibility: await canvas.ariaSnapshot()
  }
  await testInfo.attach('acceptance.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' })
})
