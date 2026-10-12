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
  expect(await game.evaluate(() => window.edeniaFrameTest.startComparison({ sampleMs: 1000, warmupMs: 1000 }))).toBe(true)
  await game.waitForFunction(() => window.edeniaFrameTest.getState().report, null, { timeout: 15000 })
  const report = await game.evaluate(() => window.edeniaFrameTest.getState().report)
  // Headless/software rendering may miss deadlines; it must still cap engine
  // frames rather than merely reporting the browser's unrestricted RAF rate.
  expect(report.trial.actualFps).toBeLessThanOrEqual(32)
  expect(report.control.actualFps).toBeLessThanOrEqual(62)
  expect(report.trial.frames).toBeGreaterThan(0)
  expect(report.trial.mainLoopWorkMsPerSecond).toBeGreaterThan(0)
  expect(report.movement.distancePixels).toBeGreaterThan(100)
  expect(report.directWalkRoutesEnabled).toBe(true)
  await page.evaluate(() => openSettings())
  await expect.poll(() => game.evaluate(() => window.edeniaPresentationSuspended)).toBe(true)
  await page.locator('#settingsCloseBtn').click()
  await expect.poll(() => game.evaluate(() => window.edeniaPresentationSuspended)).toBe(false)
  expect(await game.evaluate(() => window.edeniaFrameTest.getState().targetFps)).toBe(30)
  await game.evaluate(() => window.edeniaFrameTest.startComparison({ sampleMs: 1000, warmupMs: 1000 }))
  await game.waitForFunction(() => window.edeniaFrameTest.getState().report, null, { timeout: 15000 })
  expect(await game.evaluate(() => window.edeniaFrameTest.getState().report.trial.actualFps)).toBeLessThanOrEqual(32)
})
