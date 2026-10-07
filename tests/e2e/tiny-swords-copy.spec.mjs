import { expect, test } from '../support/network-fixture.mjs'
import { I18N, SUPPORTED_LOCALES } from '../../src/i18n/index.js'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Uses the integrated Godot build')


// Trailer/UI checks use the real media without starting an unrelated software
// WebGL engine. The locale/persistence test below still loads the real game.
async function openTrailer(page) {
  await page.route('**/tiny-swords-game/*/index.html*', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Island frame unused by trailer check</title>'
  }))
  await page.goto('./?internal_test=2')
}

test('trailer has no video bars and Continue matches the next onboarding screen', async ({ page }) => {
  await page.setViewportSize({ width: 804, height: 977 })
  await openTrailer(page)
  await page.evaluate(() => document.fonts.ready)
  const video = page.locator('#introIslandVideo')
  await expect.poll(() => video.evaluate(node => node.videoWidth), { timeout: 15000 }).toBeGreaterThan(0)
  const videoGap = await video.evaluate(node => {
    const rect = node.getBoundingClientRect()
    const ratio = node.videoWidth / node.videoHeight
    return Math.max(0, rect.height - rect.width / ratio, rect.width - rect.height * ratio)
  })
  expect(videoGap).toBeLessThan(1)
  const button = page.locator('#introStartBtn')
  await expect.poll(() => button.evaluate(node => Math.abs(
    node.getBoundingClientRect().height - parseFloat(getComputedStyle(node).minHeight)
  ))).toBeLessThan(0.5)
  const dimensions = node => {
    const rect = node.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }
  const before = await button.evaluate(dimensions)
  await button.click()
  const next = page.locator('[data-personalized-onboarding-action="continue-language"]')
  await expect(next).toBeVisible()
  const after = await next.evaluate(dimensions)
  expect(Math.abs(before.width - after.width)).toBeLessThan(1)
  expect(Math.abs(before.height - after.height)).toBeLessThan(1)
})

test.describe('Retina trailer scaling', () => {
  test.use({ deviceScaleFactor: 2 })

  test('video covers the physical display pixels without forced pixelated scaling', async ({ page }) => {
    await openTrailer(page)
    const video = page.locator('#introIslandVideo')
    await expect(video).toBeVisible()
    await expect.poll(() => video.evaluate(node => node.videoWidth), { timeout: 15000 }).toBeGreaterThan(0)
    const sample = await video.evaluate(node => ({
      sourceWidth: node.videoWidth,
      displayWidth: node.getBoundingClientRect().width * devicePixelRatio,
      rendering: getComputedStyle(node).imageRendering
    }))
    expect(sample.sourceWidth).toBeGreaterThanOrEqual(Math.ceil(sample.displayWidth))
    expect(sample.rendering).toBe('auto')
  })
})

test('island trailer plays one continuous sequence, restarts on return and stops on Skip', async ({ page }) => {
  await openTrailer(page)
  const trailer = page.locator('#introTrailer')
  const video = page.locator('#introIslandVideo')
  await expect(trailer).toBeVisible()
  await page.evaluate(() => setIntroTrailerScene(0))
  await expect(page.locator('[data-intro-scene="0"] h2')).toHaveText('Study and build your own island')
  await expect(page.locator('[data-intro-island-stage]')).toHaveCount(0)
  await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThan(0.3)
  expect(await video.evaluate(node => node.muted && node.playsInline)).toBe(true)
  expect(await video.evaluate(node => node.duration)).toBeCloseTo(19, 0)
  await expect(video).toHaveAttribute('src', /island(-phone)?\.mp4$/)
  await expect(page.locator('[data-intro-scene]')).toHaveCount(1)
  await expect(page.locator('[data-intro-navigation-direction]')).toHaveCount(0)
  expect(await page.evaluate(() => {
    setIntroTrailerScene(0)
    return document.getElementById('introIslandVideo').currentTime
  })).toBeLessThan(0.1)
  await page.locator('[data-intro-finish-action="finish"]').first().dispatchEvent('click')
  await expect(trailer).toBeHidden()
  expect(await video.evaluate(node => node.paused)).toBe(true)
  await expect(page.locator('#onboardingPanel')).toBeVisible()
})

test('reduced-motion island trailer uses the populated poster', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openTrailer(page)
  await page.evaluate(() => setIntroTrailerScene(0))
  const video = page.locator('#introIslandVideo')
  expect(await video.evaluate(node => node.paused && !node.hasAttribute('src'))).toBe(true)
  const poster = await video.getAttribute('poster')
  expect((await page.request.get(poster)).ok()).toBe(true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThan(0.1)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await video.evaluate(node => node.paused && !node.hasAttribute('src'))).toBe(true)
})

test('live locale and trailer/walkthrough replay preserve completed onboarding and the game frame', async ({ page }, testInfo) => {
  test.setTimeout(120000)
  await page.goto('./?internal_test=2')
  await page.evaluate(() => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at, levelUpGuidanceShownAt: at })
    state.config.ankiEnabled = false
    state.cityProgress = { maxLevelIndex: 1, experienceVersion: 1 }
    localStorage.setItem('edenia_v1_internal_test_2', JSON.stringify(state))
  })
  await page.reload()
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 60000 })
  const frame = page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  const frameSource = await page.locator('.tiny-swords-frame').getAttribute('src')
  const onboarding = await page.evaluate(() => loadState().onboarding)
  for (const locale of SUPPORTED_LOCALES) {
    await page.evaluate(locale => saveLocaleFromSettings(locale), locale)
    await expect.poll(() => frame.evaluate(() => window.edeniaLocale)).toBe(locale)
    await expect(page.locator('.tiny-swords-frame')).toHaveAttribute('title', I18N[locale]['island.frameTitle'])
    await page.evaluate(() => showTrailerAgain())
    await expect(page.locator('[data-intro-scene="0"] h2')).toHaveText(I18N[locale]['island.introTitle'])
    await expect.poll(() => page.locator('#introIslandVideo').evaluate(node => node.currentTime)).toBeGreaterThan(0.1)
    expect(await page.locator('.intro-island-demo').evaluate(node => node.getBoundingClientRect().right <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`trailer-${locale}.png`) })
    await page.locator('[data-intro-finish-action="finish"]').first().click()
    await expect(page.locator('#introTrailer')).toBeHidden()
    await page.evaluate(() => startWalkthrough())
    await expect(page.locator('.tiny-swords-frame')).toHaveAttribute('inert', '')
    await page.evaluate(() => endWalkthrough({ markCompleted: false }))
    expect(await page.evaluate(() => loadState().onboarding)).toEqual(onboarding)
    await expect(page.locator('.tiny-swords-frame')).toHaveAttribute('src', frameSource)
  }
  // Resumed Godot renders Chinese Start and the level-two reward in the same engine.
  await page.evaluate(() => saveLocaleFromSettings('zh-Hant'))
  await page.locator('#tinySwordsSurface').scrollIntoViewIfNeeded()
  const canvas = frame.locator('#canvas')
  const bounds = await canvas.boundingBox()
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } })
  await expect.poll(() => page.evaluate(() => loadState().tinySwordsIsland?.level)).toBe(2)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: testInfo.outputPath('game-zh-Hant.png') })
})
