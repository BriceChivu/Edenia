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
  await page
    .getByRole('button', { name: 'Town animation', exact: true })
    .click()
  await expect(page.locator('.pixel-town-canvas')).toBeHidden()
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
    /pixel-town\/.*1-.*\.png/
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
