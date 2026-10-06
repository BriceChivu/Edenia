import { expect, test } from '../support/network-fixture.mjs'
import { I18N, SUPPORTED_LOCALES } from '../../src/i18n/index.js'

test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true', 'Uses the integrated Godot build')

test('captured trailer stages follow scene timing, manual selection, navigation and Skip', async ({ page }) => {
  // Let application initialization run, then pause well ahead of every frame's
  // clock. A one-second parent-derived timestamp can be past in a busy iframe.
  await page.clock.install({ time: new Date('2026-10-06T00:00:00Z') })
  await page.goto('./?internal_test=2')
  const trailer = page.locator('#introTrailer')
  await expect(trailer).toBeVisible()
  await page.clock.pauseAt(new Date('2026-10-07T00:00:00Z'))
  await page.evaluate(() => setIntroTrailerScene(0))
  await page.clock.fastForward(13000)
  await expect(trailer).toHaveAttribute('data-scene', '1')
  await page.clock.fastForward(8600)
  await expect(trailer).toHaveAttribute('data-scene', '2')
  await expect(page.locator('[data-intro-island-stage="0"]')).toHaveAttribute('aria-pressed', 'true')
  await page.clock.fastForward(3600)
  await expect(page.locator('[data-intro-island-stage="1"]')).toHaveAttribute('aria-pressed', 'true')
  await page.clock.fastForward(3600)
  await expect(page.locator('[data-intro-island-stage="2"]')).toHaveAttribute('aria-pressed', 'true')
  await page.clock.fastForward(3600)
  await expect(trailer).toHaveAttribute('data-scene', '3')
  await page.locator('#introPreviousBtn').dispatchEvent('click')
  await page.locator('[data-intro-island-stage="1"]').dispatchEvent('click')
  await page.clock.fastForward(12000)
  await expect(trailer).toHaveAttribute('data-scene', '2')
  await expect(page.locator('[data-intro-island-image="1"]')).toHaveClass('is-selected')
  for (const image of await page.locator('[data-intro-island-image]').all()) {
    expect(await image.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
  }
  await page.locator('#introNextBtn').dispatchEvent('click')
  await expect(trailer).toHaveAttribute('data-scene', '3')
  await page.locator('[data-intro-finish-action="finish"]').first().dispatchEvent('click')
  await page.clock.fastForward(100)
  await expect(trailer).toBeHidden()
  await expect(page.locator('#onboardingPanel')).toBeVisible()
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
    await page.locator('#introNextBtn').click()
    await page.locator('#introNextBtn').click()
    await page.locator('[data-intro-island-stage="1"]').click()
    await expect(page.locator('[data-intro-island-stage="2"]')).toHaveText(I18N[locale]['intro.island.build'])
    await expect(page.locator('[data-intro-island-image="1"]')).toHaveAttribute('src', `images/tiny-swords-trailer/unlock${locale === 'en' ? '' : `-${locale}`}.png`)
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
