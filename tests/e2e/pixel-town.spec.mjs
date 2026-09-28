import { expect, test } from '../support/network-fixture.mjs'
const enabled = process.env.EDENIA_PIXEL_TOWN_ENABLED === 'true'
async function seed(page) {
  await page.waitForFunction(() => typeof window.defaultState === 'function')
  await page.evaluate(() => {
    const state = window.defaultState(4, [], 'light', [], 'en'),
      date = '2026-09-27T04:00:00.000Z'
    state.config.ankiEnabled = false
    Object.assign(state.onboarding, {
      introSeenAt: date,
      setupCompleted: true,
      setupCompletedAt: date,
      walkthroughCompleted: true,
      walkthroughCompletedAt: date
    })
    window.saveState(state, { backup: false, syncAnalytics: false })
  })
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
}
test('public and switch-off have zero experimental requests, including after an internal visit', async ({
  page
}) => {
  if (enabled) {
    await page.goto('/?internal_test=1')
    await seed(page)
  }
  const requests = []
  page.on('request', (r) => {
    if (r.url().includes('/pixel-town/')) requests.push(r.url())
  })
  await page.goto('/')
  await seed(page)
  await expect(page.locator('#cityMilestoneImage')).toHaveAttribute(
    'src',
    /images\/city/
  )
  expect(requests).toEqual([])
  expect(
    await page.evaluate(() => window.EDENIA_PIXEL_TOWN?.controller)
  ).toBeUndefined()
  if (!enabled) {
    await page.goto('/?internal_test=1')
    await seed(page)
    expect(requests).toEqual([])
  }
})
test('internal new artwork stays independent of legacy assets and presentation leaves study facts untouched', async ({
  page
}) => {
  test.skip(!enabled, 'Requires the enabled build')
  // A preference saved by the retired pause control must not disable animation.
  await page.addInitScript(() =>
    localStorage.setItem('edenia.pixelTown.motion', 'off')
  )
  const legacy = []
  page.on('request', (r) => {
    if (/images\/(city|photoshop)\//.test(r.url())) legacy.push(r.url())
  })
  await page.route('**/images/city/**', (r) => r.abort())
  await page.route('**/images/photoshop/**', (r) => r.abort())
  await page.goto('/?internal_test=1')
  await seed(page)
  await expect(page.locator('.pixel-town-canvas')).toBeVisible()
  const before = await page.evaluate(() =>
    localStorage.getItem('edenia_v1_internal_test')
  )
  for (const stage of [1, 2, 5, 8, 12]) {
    await page.evaluate(
      (stage) =>
        (document.getElementById('cityMilestoneImage').dataset.pixelStage =
          String(stage)),
      stage
    )
    await expect(page.locator('#cityMilestoneImage')).toHaveAttribute(
      'src',
      new RegExp(`${stage}-.*\\.png`)
    )
  }
  await expect(
    page.getByRole('button', { name: 'Town animation', exact: true })
  ).toHaveCount(0)
  await expect(page.locator('.pixel-town-canvas')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => window.EDENIA_PIXEL_TOWN.controller.pending.animation)
    )
    .toBe(true)
  expect(
    await page.evaluate(() => localStorage.getItem('edenia_v1_internal_test'))
  ).toBe(before)
  expect(legacy).toEqual([])
})
test('reduced motion, offscreen suspension, stale load cancellation and disposal', async ({
  page
}) => {
  test.skip(!enabled, 'Requires the enabled build')
  await page.goto('/?internal_test=1')
  await seed(page)
  await expect(page.locator('.pixel-town-canvas')).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.pixel-town-canvas')).toBeHidden()
  expect(
    await page.evaluate(
      () => window.EDENIA_PIXEL_TOWN.controller.pending.animation
    )
  ).toBe(false)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page
    .locator('.city-section')
    .evaluate((el) => (el.style.display = 'none'))
  await expect
    .poll(() =>
      page.evaluate(() => window.EDENIA_PIXEL_TOWN.controller.pending)
    )
    .toEqual({ animation: false, lighting: false, startup: false })
  await page.locator('.city-section').evaluate((el) => (el.style.display = ''))
  await expect(page.locator('.pixel-town-canvas')).toBeVisible()
  await page.evaluate(() => window.EDENIA_PIXEL_TOWN.controller.dispose())
  expect(
    await page.evaluate(() => window.EDENIA_PIXEL_TOWN.controller.pending)
  ).toEqual({ animation: false, lighting: false, startup: false })
  await expect(page.locator('.pixel-town-canvas')).toHaveCount(0)
})
test('blocked entry retains independent new still and full-scene phone framing', async ({
  page,
  pageDiagnostics
}) => {
  test.skip(!enabled, 'Requires the enabled build')
  await page.route('**/pixel-town/**/entry.js', (r) => r.abort())
  await page.goto('/?internal_test=1')
  await seed(page)
  await expect(page.locator('#cityMilestoneImage')).toHaveAttribute(
    'src',
    /pixel-town\/.*13-.*\.png/
  )
  expect(
    await page
      .locator('#cityMilestoneImage')
      .evaluate((img) => img.complete && img.naturalWidth === 768)
  ).toBe(true)
  const styles = await page.locator('#cityMilestoneImage').evaluate((img) => ({
    fit: getComputedStyle(img).objectFit,
    transform: getComputedStyle(img).transform
  }))
  expect(styles).toEqual({ fit: 'contain', transform: 'none' })
  expect(
    pageDiagnostics.every(
      (error) => error === 'console: Failed to load resource: net::ERR_FAILED'
    )
  ).toBe(true)
  pageDiagnostics.length = 0
})

test('stale atlas completion after disposal cannot remount a scene', async ({
  page
}) => {
  test.skip(!enabled, 'Requires the enabled build')
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  await page.route('**/*-motion.png', async (route) => {
    await gate
    await route.continue().catch(() => {})
  })
  await page.goto('/?internal_test=1')
  await seed(page)
  await expect
    .poll(() =>
      page.evaluate(() => window.EDENIA_PIXEL_TOWN.controller.pending.startup)
    )
    .toBe(true)
  await page.evaluate(() => window.EDENIA_PIXEL_TOWN.controller.dispose())
  release()
  await page.waitForTimeout(100)
  await expect(page.locator('.pixel-town-canvas')).toHaveCount(0)
  expect(
    await page.evaluate(
      () => window.EDENIA_PIXEL_TOWN.controller.metrics.active
    )
  ).toBe(false)
})

test('missing or mixed animation assets retain new still without legacy fallback', async ({
  page
}) => {
  test.skip(!enabled, 'Requires the enabled build')
  await page.route('**/pixel-town/**/*.json', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ version: 'stale' })
    })
  )
  await page.goto('/?internal_test=1')
  await seed(page)
  await expect
    .poll(() =>
      page.evaluate(() => window.EDENIA_PIXEL_TOWN.controller.metrics.errors)
    )
    .toBeGreaterThan(0)
  await expect(page.locator('.pixel-town-canvas')).toBeHidden()
  expect(
    await page
      .locator('#cityMilestoneImage')
      .evaluate((img) => img.complete && img.naturalWidth === 768)
  ).toBe(true)
  expect(
    await page.evaluate(
      () => window.EDENIA_PIXEL_TOWN.controller.pending.startup
    )
  ).toBe(false)
})

test('fifty stage, light and mount cycles preserve state and release prior controllers', async ({
  page
}) => {
  test.skip(!enabled, 'Requires the enabled build')
  await page.goto('/?internal_test=1')
  await seed(page)
  const before = await page.evaluate(() =>
    localStorage.getItem('edenia_v1_internal_test')
  )
  for (let i = 0; i < 50; i++) {
    await page.evaluate(async (i) => {
      const town = window.EDENIA_PIXEL_TOWN
      town.controller.dispose()
      if (Object.values(town.controller.pending).some(Boolean))
        throw new Error('Disposed controller still pending')
      const { mountTown } = await import(
        new URL(town.base + 'entry.js', location.href)
      )
      const image = document.getElementById('cityMilestoneImage')
      image.dataset.pixelStage = String((i % 12) + 1)
      town.controller = mountTown({
        image,
        ...town,
        clock: () => new Date(2026, 8, 27, [6, 12, 18, 23][i % 4])
      })
    }, i)
    await expect
      .poll(() =>
        page.evaluate(() => window.EDENIA_PIXEL_TOWN.controller.metrics.active)
      )
      .toBe(true)
    await expect(page.locator('.pixel-town-canvas')).toHaveCount(1)
    expect(
      await page.evaluate(
        () => window.EDENIA_PIXEL_TOWN.controller.metrics.pixelBytes
      )
    ).toBeLessThan(64 * 1024 * 1024)
  }
  expect(
    await page.evaluate(() => localStorage.getItem('edenia_v1_internal_test'))
  ).toBe(before)
})

test('invisible onboarding scenery does not keep a lighting timer alive', async ({
  page
}) => {
  test.skip(!enabled, 'Requires the enabled build')
  await page.goto('/?internal_test=1')
  await seed(page)
  await page.evaluate(() => {
    const intro = document.getElementById('introTrailer')
    intro.classList.remove('hidden')
    intro.dataset.scene = '0'
  })
  await expect
    .poll(() =>
      page.evaluate(
        () => window.EDENIA_PIXEL_TOWN?.controller?.pending.lighting
      )
    )
    .toBe(false)
  await page.evaluate(
    () => (document.getElementById('introTrailer').dataset.scene = '2')
  )
  await expect
    .poll(() =>
      page.evaluate(() => window.EDENIA_PIXEL_TOWN.controller.pending.lighting)
    )
    .toBe(true)
  await page.evaluate(
    () => (document.getElementById('introTrailer').dataset.scene = '0')
  )
  await expect
    .poll(() =>
      page.evaluate(() => window.EDENIA_PIXEL_TOWN.controller.pending.lighting)
    )
    .toBe(false)
})

test('critical attributed slowdown restores the still and cannot resume a frozen player', async ({ page }) => {
  test.skip(!enabled, 'Requires the enabled build')
  await page.goto('/?internal_test=1')
  await seed(page)
  await expect(page.locator('.pixel-town-canvas')).toBeVisible()
  // Inject cost only inside the real town draw callback, not unrelated feed work.
  await page.evaluate(() => {
    const drawImage = CanvasRenderingContext2D.prototype.drawImage
    let last = 0
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (this.canvas.classList.contains('pixel-town-canvas') && performance.now() - last > 120) {
        last = performance.now()
        while (performance.now() - last < 60) { /* controlled town cost */ }
      }
      return drawImage.apply(this, args)
    }
  })
  await expect.poll(() => page.evaluate(() =>
    window.EDENIA_PIXEL_TOWN.controller.metrics.samples.some(s => s.cadence === 0)
  )).toBe(true)
  await expect(page.locator('.pixel-town-canvas')).toBeHidden()
  expect(await page.evaluate(() => window.EDENIA_PIXEL_TOWN.controller.metrics.active)).toBe(false)
  expect(await page.locator('#cityMilestoneImage').evaluate(img => img.complete && img.naturalWidth === 768)).toBe(true)
  await page.locator('.city-section').evaluate(el => { el.style.display = 'none' })
  await expect.poll(() => page.evaluate(() => window.EDENIA_PIXEL_TOWN.controller.pending.lighting)).toBe(false)
  await page.locator('.city-section').evaluate(el => { el.style.display = '' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('.pixel-town-canvas')).toBeHidden()
  expect(await page.evaluate(() => window.EDENIA_PIXEL_TOWN.controller.pending.animation)).toBe(false)
  expect(await page.evaluate(() => window.EDENIA_PIXEL_TOWN.controller.metrics.active)).toBe(false)
})
