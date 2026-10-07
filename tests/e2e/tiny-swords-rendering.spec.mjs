import { createCanvas, loadImage } from '@napi-rs/canvas'
import { expect, test } from '../support/network-fixture.mjs'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Uses the integrated Godot build')
test.use({ deviceScaleFactor: 3, reducedMotion: 'reduce' })

test('Start text retains glyph detail and the canvas matches display density', async ({ page }, testInfo) => {
  test.setTimeout(90000)
  await page.route('**/tiny-swords-game/*/index.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
  await page.goto('./?internal_test=2')
  await page.evaluate(() => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at })
    state.config.ankiEnabled = false
    state.cityProgress = { maxLevelIndex: 0, experienceVersion: 1 }
    state.tinySwordsIsland = null
    localStorage.setItem('edenia_v1_internal_test_2', JSON.stringify(state))
  })
  await page.unroute('**/tiny-swords-game/*/index.html')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const surface = page.locator('#tinySwordsSurface')
  await surface.scrollIntoViewIfNeeded()
  await expect(surface).toHaveAttribute('data-game-state', 'ready', { timeout: 60000 })
  const game = page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  await game.waitForFunction(() => window.edeniaGameLevel === 1)
  const density = await game.evaluate(() => {
    const canvas = document.querySelector('#canvas')
    const rect = canvas.getBoundingClientRect()
    return { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height, dpr: devicePixelRatio }
  })
  expect(Math.abs(density.width - density.cssWidth * density.dpr)).toBeLessThanOrEqual(1)
  expect(Math.abs(density.height - density.cssHeight * density.dpr)).toBeLessThanOrEqual(1)

  const pixels = await game.locator('#canvas').screenshot()
  await testInfo.attach('start.png', { body: pixels, contentType: 'image/png' })
  const image = await loadImage(pixels)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  const scale = image.width / density.cssWidth
  const width = Math.round(80 * scale)
  const height = Math.round(22 * scale)
  // Inspect the white letters inside the centered button, excluding its border.
  // Enlarged low-resolution glyphs repeat identical rows; correctly rasterized
  // letters retain distinct rows. The original phone rendering scored ~0.57.
  const data = context.getImageData(Math.round(image.width / 2 - width / 2), Math.round(image.height / 2 - height / 2 - 4 * scale), width, height).data
  const rows = []
  for (let y = 0; y < height; y++) {
    let row = ''
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      row += data[offset] > 180 && data[offset + 1] > 200 && data[offset + 2] > 200 ? '1' : '0'
    }
    if (row.includes('1')) rows.push(row)
  }
  expect(rows.length, 'Start letters were rendered in the sampled area').toBeGreaterThan(10)
  expect(new Set(rows).size / rows.length, 'Glyph detail survives responsive UI scaling').toBeGreaterThan(0.85)
})
