import { expect, test } from '../support/network-fixture.mjs'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Uses the integrated Godot build')

test('active PostHog replay receives visible island pixels and stops when recording stops', async ({ page }) => {
  test.setTimeout(90000)
  await page.route('**/tiny-swords-game/*/index.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
  await page.goto('./?internal_test=2')
  await page.evaluate(() => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at })
    state.config.ankiEnabled = false
    state.tinySwordsIsland = null
    localStorage.setItem('edenia_v1_internal_test_2', JSON.stringify(state))
  })
  await page.unroute('**/tiny-swords-game/*/index.html')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const surface = page.locator('#tinySwordsSurface')
  await surface.scrollIntoViewIfNeeded()
  await expect(surface).toHaveAttribute('data-game-state', 'ready', { timeout: 60000 })
  const game = page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  await game.waitForFunction(() => window.edeniaGameLevel >= 1)
  // Godot consumes the host's restore request; capture must not depend on it.
  await game.evaluate(() => { window.edeniaStudyReady = false })
  expect(await game.locator('#canvas').evaluate(canvas => canvas.style.backgroundImage)).toBe('')
  // Stub recording locally; no SDK request or synthetic event reaches PostHog.
  await page.evaluate(() => {
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = { sessionRecordingStarted: () => true }
  })
  await expect.poll(() => game.locator('#canvas').evaluate(canvas => canvas.style.backgroundImage)).toContain('data:image/webp')
  const firstFrame = await game.locator('#canvas').evaluate(canvas => canvas.style.backgroundImage)
  await expect.poll(() => game.locator('#canvas').evaluate(canvas => canvas.style.backgroundImage), { timeout: 5000 }).not.toBe(firstFrame)
  const frame = await game.locator('#canvas').evaluate(canvas => canvas.style.backgroundImage.match(/data:image\/webp;base64,([^"\)]+)/)[1])
  const image = await game.evaluate(async base64 => {
    const img = new Image()
    img.src = `data:image/webp;base64,${base64}`
    await img.decode()
    const probe = document.createElement('canvas')
    probe.width = img.width
    probe.height = img.height
    const ctx = probe.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data
    let colored = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 30 && pixels[i + 3] > 200) colored++
    }
    return { width: img.width, height: img.height, colored: colored / (img.width * img.height) }
  }, frame)
  expect(image.width).toBeLessThanOrEqual(960)
  expect(image.height).toBeLessThanOrEqual(540)
  expect(image.colored, 'replay contains the island and ocean rather than a blank WebGL buffer').toBeGreaterThan(0.3)
  // Once recording stops, gameplay can continue without new image mutations.
  await page.evaluate(() => { window.posthog.sessionRecordingStarted = () => false })
  await game.locator('#canvas').evaluate(canvas => {
    window.replayStyleChanges = 0
    const image = canvas.style.backgroundImage
    new MutationObserver(() => { if (canvas.style.backgroundImage !== image) window.replayStyleChanges++ }).observe(canvas, { attributes: true, attributeFilter: ['style'] })
  })
  await page.waitForTimeout(1200)
  expect(await game.evaluate(() => window.replayStyleChanges)).toBe(0)
})
