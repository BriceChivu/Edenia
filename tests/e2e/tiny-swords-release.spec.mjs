import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Selected by the required Tiny Swords integration suite')

test('versioned export loads under the hosted base path and disable/re-enable preserves an island', async ({ page, request }) => {
  test.setTimeout(180000)
  let enabled = true
  const config = await readFile('_site/config.local.js', 'utf8')
  await page.route('**/config.local.js?*', route => route.fulfill({
    contentType: 'text/javascript',
    body: config + `\nwindow.EDENIA_CONFIG.tinySwordsEnabled = ${enabled};`
  }))
  const failures = []
  const gameRequests = []
  page.on('response', response => {
    if (response.url().includes('/tiny-swords-game/')) {
      gameRequests.push(response.url())
      if (!response.ok()) failures.push(`${response.status()} ${response.url()}`)
    }
  })
  await page.route('**/tiny-swords-game/*/index.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Initialize</title>' }))
  await page.goto('./')
  await expect(page.locator('.tiny-swords-frame')).toHaveCount(1)
  const island = JSON.parse(await readFile('tests/fixtures/tiny-swords-populated-island.json', 'utf8'))
  await page.evaluate(island => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    state.onboarding = { ...state.onboarding, introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at }
    state.config.ankiEnabled = false
    state.tinySwordsIsland = island
    state.videos.lesson = { id: 'lesson', title: 'Retained study', duration: 3600, status: 'partial', watchProgress: [{ watchedAt: at, seconds: 900, experienceSeconds: 900 }] }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  }, island)
  await page.unroute('**/tiny-swords-game/*/index.html')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const game = () => page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  const canvas = page.frameLocator('.tiny-swords-frame').locator('#canvas')
  await expect(canvas).toBeVisible()
  await expect.poll(() => game()?.evaluate(() => window.edeniaLastSavePersisted), { timeout: 60000 }).toBe(true)
  const gameURL = new URL(game().url())
  expect(gameURL.pathname).toMatch(/^\/Edenia\/tiny-swords-game\/[a-f0-9]{64}\/index.html$/)
  const releaseURL = new URL('release.json', gameURL)
  const metadata = await (await request.get(releaseURL.href)).json()
  expect(gameURL.pathname).toContain(`/${metadata.version}/`)
  expect(metadata.godotVersion).toBe('4.7.2')
  for (const asset of ['index.wasm', 'index.pck', 'index.js', 'parent.js', 'Cursor_02.png',
    'notices/GODOT-LICENSE.txt', 'notices/GODOT-COPYRIGHT.txt', 'notices/MEDIEVALSHARP-OFL.txt', 'notices/ASSET-PROVENANCE.md']) {
    expect((await request.head(new URL(asset, gameURL).href)).ok(), asset).toBe(true)
  }
  expect(gameRequests.some(url => url.endsWith('/index.wasm'))).toBe(true)
  expect(gameRequests.some(url => url.endsWith('/index.pck'))).toBe(true)
  expect(gameRequests.every(url => new URL(url).pathname.startsWith(`/Edenia/tiny-swords-game/${metadata.version}/`))).toBe(true)
  expect(failures).toEqual([])
  const retained = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    return { island: state.tinySwordsIsland, videos: state.videos, progress: state.cityProgress }
  })
  enabled = false
  await page.reload()
  await expect(page.locator('.tiny-swords-frame')).toHaveCount(0)
  await expect(page.locator('#cityMilestoneImage')).toHaveCount(0)
  await expect(page.locator('#cityTimeWaveform')).toHaveCount(0)
  await expect(page.locator('#cityScore')).toHaveText('15')
  expect(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    return { island: state.tinySwordsIsland, videos: state.videos, progress: state.cityProgress }
  })).toEqual(retained)
  enabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.tiny-swords-frame')).toHaveCount(1)
  await expect.poll(() => game()?.evaluate(() => window.edeniaLastSavePersisted), { timeout: 60000 }).toBe(true)
  const reenabled = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1')))
  expect(reenabled.tinySwordsIsland.stock).toEqual(retained.island.stock)
  expect(reenabled.tinySwordsIsland.tiles).toEqual(retained.island.tiles)
  expect(reenabled.tinySwordsIsland.resources).toEqual(retained.island.resources)
  expect(reenabled.videos).toEqual(retained.videos)
  await page.screenshot({ path: test.info().outputPath('hosted-island.png') })
})
