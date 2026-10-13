import { expect, test } from '../support/network-fixture.mjs'
import { readFile } from 'node:fs/promises'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Uses the integrated Godot build')

test('opt-in FPS experiment caps actual engine frames and survives host suspension', async ({ page }) => {
  test.setTimeout(120000)
  await page.route('**/tiny-swords-game/*/index.html*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
  await page.goto('./?internal_test=2&tiny_swords_fps=30')
  const island = JSON.parse(await readFile('tests/fixtures/tiny-swords-fps-island.json', 'utf8'))
  await page.evaluate(island => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at })
    state.config.ankiEnabled = false
    state.cityProgress = { maxLevelIndex: 9, experienceVersion: 1 }
    state.tinySwordsIsland = island
    localStorage.setItem('edenia_v1_internal_test_2', JSON.stringify(state))
  }, island)
  await page.unroute('**/tiny-swords-game/*/index.html*')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('#tinySwordsSurface').scrollIntoViewIfNeeded()
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 60000 })
  const game = page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  await game.waitForFunction(() => window.edeniaFrameTest && window.edeniaLastSavePersisted)
  expect(new URL(game.url()).searchParams.get('tiny_swords_fps')).toBe('30')
  expect(await game.evaluate(() => window.edeniaFrameTest.startComparison({ sampleMs: 2000, warmupMs: 1000 }))).toBe(true)
  await game.waitForFunction(() => window.edeniaFrameTest.getState().report, null, { timeout: 20000 })
  const report = await game.evaluate(() => window.edeniaFrameTest.getState().report)
  // Headless/software rendering may miss deadlines; it must still cap engine
  // frames rather than merely reporting the browser's unrestricted RAF rate.
  expect(report.trial.actualFps).toBeLessThanOrEqual(32)
  expect(report.control.actualFps).toBeLessThanOrEqual(62)
  expect(report.trial.frames).toBeGreaterThan(0)
  expect(report.trial.mainLoopWorkMsPerSecond).toBeGreaterThan(0)
  expect(report.movement.distancePixels).toBeGreaterThan(100)
  expect(report.directWalkRoutesEnabled).toBe(true)
  expect(report.boundedObstacleSearchEnabled).toBe(true)
  await page.evaluate(() => openSettings())
  await expect.poll(() => game.evaluate(() => window.edeniaPresentationSuspended)).toBe(true)
  await page.locator('#settingsCloseBtn').click()
  await expect.poll(() => game.evaluate(() => window.edeniaPresentationSuspended)).toBe(false)
  expect(await game.evaluate(() => window.edeniaFrameTest.getState().targetFps)).toBe(30)
  expect(await game.evaluate(() => window.edeniaFrameTest.startComparison({ sampleMs: 2000, warmupMs: 1000 }))).toBe(true)
  await game.waitForFunction(() => window.edeniaFrameTest.getState().report, null, { timeout: 20000 })
  expect(await game.evaluate(() => window.edeniaFrameTest.getState().report.trial.actualFps)).toBeLessThanOrEqual(32)
  expect(await game.evaluate(() => window.edeniaLagCapture.start(false))).toBe(true)
  await game.evaluate(() => window.edeniaFrameTestMotion('start-obstacles',2,2))
  expect(await game.evaluate(() => window.edeniaFrameTestMotionReady)).toBe(true)
  await game.waitForFunction(() => window.edeniaLagCapture.getState().navigationSearches>0,null,{timeout:15000})
  await game.evaluate(() => { window.edeniaLagCapture.mark(); window.edeniaLagCapture.stop(); window.edeniaFrameTestMotion('finish') })
  const reportDownload = page.waitForEvent('download')
  await game.evaluate(() => window.edeniaLagCapture.saveReport())
  const saved = await reportDownload
  const diagnostics = JSON.parse(await readFile(await saved.path(), 'utf8'))
  expect(diagnostics.frames.length).toBeGreaterThan(0)
  expect(diagnostics.probes.some(probe => probe.operation === 'obstacle-search')).toBe(true)
  expect(diagnostics.lagMarkers).toHaveLength(1)
  expect(diagnostics.environment.targetFps).toBe(30)
  expect(diagnostics.environment.release).toMatch(/tiny-swords-game/)
  expect(diagnostics).not.toHaveProperty('learnerProfile')
  await page.locator('#tinySwordsSurface').scrollIntoViewIfNeeded()
  await game.waitForFunction(() => !document.hidden && !window.edeniaPresentationSuspended)
  const recordingStarted = await game.evaluate(() => ({started:window.edeniaLagCapture.start(true),state:window.edeniaLagCapture.getState()}))
  expect(recordingStarted).toMatchObject({started:true,state:{active:true,recording:true}})
  await game.evaluate(() => window.edeniaFrameTestMotion('start'))
  await game.waitForTimeout(1600)
  await game.evaluate(() => { window.edeniaLagCapture.stop(); window.edeniaFrameTestMotion('finish') })
  await game.waitForFunction(() => window.edeniaLagCapture.getState().hasVideo)
  const videoDownload = page.waitForEvent('download')
  await game.evaluate(() => window.edeniaLagCapture.saveVideo())
  const clip = await videoDownload
  const base64 = (await readFile(await clip.path())).toString('base64')
  const decoded = await game.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), letter => letter.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], {type: 'video/webm'}))
    const video = document.createElement('video')
    video.muted = true
    const ready = new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject })
    video.src = url
    await ready
    const image = document.createElement('canvas')
    image.width = 64; image.height = 64
    const context = image.getContext('2d')
    const sample = () => { context.drawImage(video, 0, 0, 64, 64); return [...context.getImageData(0, 0, 64, 64).data] }
    await video.play()
    await new Promise(resolve => setTimeout(resolve, 150))
    const first = sample()
    await new Promise(resolve => setTimeout(resolve, 900))
    const second = sample()
    video.pause(); video.src = ''; URL.revokeObjectURL(url)
    return {colored: first.filter((value, index) => index % 4 !== 3 && value > 20).length / (64 * 64 * 3),
      changed: first.some((value, index) => value !== second[index])}
  }, base64)
  expect(decoded.colored).toBeGreaterThan(0.3)
  expect(decoded.changed).toBe(true)
  expect(await game.evaluate(() => Boolean(document.querySelector('#canvas').style.backgroundImage))).toBe(false)
  expect(await game.evaluate(() => window.edeniaLagCapture.start(false))).toBe(true)
  await page.evaluate(() => openSettings())
  await expect.poll(() => game.evaluate(() => window.edeniaLagCapture.getState().active)).toBe(false)
  await expect.poll(() => game.evaluate(() => window.edeniaLagCapture.getState().hasReport)).toBe(true)
  await page.locator('#settingsCloseBtn').click()
})
