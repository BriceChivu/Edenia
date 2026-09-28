import { expect, test } from '../support/network-fixture.mjs'
const enabled = process.env.EDENIA_PIXEL_TOWN_ENABLED === 'true'

test('ten recorded minutes buys flowers once, persists after reload, and leaves XP and public mode alone', async ({ page }) => {
  test.skip(!enabled, 'Requires enabled build')
  await page.goto('/?internal_test=1')
  await page.waitForFunction(() => typeof window.defaultState === 'function')
  await page.evaluate(() => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const date = new Date().toISOString()
    state.config.ankiEnabled = false
    Object.assign(state.onboarding, { introSeenAt: date, setupCompleted: true, setupCompletedAt: date, walkthroughCompleted: true, walkthroughCompletedAt: date })
    window.saveState(state, { backup: false, syncAnalytics: false })
  })
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('.town-wallet')).toHaveText('0 coins')
  await expect(page.locator('.town-flower-outline')).toBeHidden()
  await expect(page.locator('#cityMilestoneImage')).toHaveAttribute('data-pixel-stage', '13')
  // Exercise the player's actual durable progress recorder, avoiding ten minutes of wall-clock waiting.
  await page.evaluate(() => {
    const state = window.loadState()
    const video = state.videos.lesson = { id: 'lesson', title: 'Study lesson', channelId: 'test', duration: 1200, status: 'partial', watchProgressTracked: true }
    const session = { isRewatch: false, progressSeconds: 0 }
    const watchedAt = new Date().toISOString()
    for (let i = 0; i < 60; i++) window.addVideoShelfSessionProgress(video, 10, session, watchedAt)
    window.saveState(state, { backup: false, syncAnalytics: false })
  })
  await expect(page.locator('.town-wallet')).toHaveText('15 coins')
  await page.reload()
  const xp = await page.locator('#cityScore').textContent()
  expect(xp).toBe('5')
  await expect(page.locator('.town-wallet')).toHaveText('15 coins')
  await page.locator('.town-flower-outline').click()
  await expect(page.locator('.town-build-panel')).toBeVisible()
  const panelBounds = await page.locator('.town-build-panel').boundingBox()
  const townBounds = await page.locator('.city-image-wrap').boundingBox()
  expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(townBounds.y + townBounds.height)
  expect(panelBounds.x).toBeGreaterThanOrEqual(townBounds.x)
  expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(townBounds.x + townBounds.width)
  await page.screenshot({ path: `test-results/flower-build-${test.info().project.name}.png`, fullPage: false })
  await expect(page.locator('.town-wallet')).toHaveText('15 coins')
  await page.getByRole('button', { name: 'Build · 15 coins', exact: true }).click()
  await expect(page.locator('.town-wallet')).toHaveText('0 coins')
  await expect(page.locator('#cityMilestoneImage')).toHaveAttribute('data-pixel-stage', '14')
  await expect(page.locator('.town-flower-outline')).toBeHidden()
  await expect(page.locator('#cityScore')).toHaveText(xp)
  expect(await page.evaluate(() => window.EDENIA_PIXEL_TOWN.buildFlower())).toBe('owned')
  await page.reload()
  await expect(page.locator('.town-wallet')).toHaveText('0 coins')
  await expect(page.locator('#cityMilestoneImage')).toHaveAttribute('data-pixel-stage', '14')
  await expect(page.locator('#cityScore')).toHaveText(xp)
  await page.screenshot({ path: `test-results/flowers-${test.info().project.name}.png`, fullPage: true })
  const requests = []
  page.on('request', request => { if (request.url().includes('/pixel-town/')) requests.push(request.url()) })
  await page.goto('/')
  await expect(page.locator('.pixel-town-economy')).toHaveCount(0)
  expect(requests).toEqual([])
  expect(await page.evaluate(() => window.defaultState(4, [], 'light', [], 'en').townEconomy)).toBeUndefined()
})

test('flower confirmation uses the active language and dark theme', async ({ page }) => {
  test.skip(!enabled, 'Requires enabled build')
  await page.goto('/?internal_test=1')
  await page.waitForFunction(() => typeof window.defaultState === 'function')
  await page.evaluate(() => {
    const state = window.defaultState(4, [], 'dark', [], 'fr')
    const date = new Date().toISOString()
    state.config.ankiEnabled = false
    Object.assign(state.onboarding, { introSeenAt: date, setupCompleted: true, setupCompletedAt: date, walkthroughCompleted: true, walkthroughCompletedAt: date })
    const video = state.videos.lesson = { id: 'lesson', duration: 1200, status: 'partial', watchProgressTracked: true }
    window.addVideoShelfSessionProgress(video, 600, { isRewatch: false, progressSeconds: 0 }, date)
    window.saveState(state, { backup: false, syncAnalytics: false })
  })
  await page.reload()
  await expect(page.locator('.town-wallet')).toHaveText('15 pièces')
  await page.getByRole('button', { name: 'Premier massif de fleurs · 15 pièces', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Construire · 15 pièces', exact: true })).toBeVisible()
  await expect(page.locator('.town-build-panel').getByRole('button', { name: 'Annuler', exact: true })).toBeVisible()
  const colors = await page.locator('.town-build-panel').evaluate(panel => {
    const probe = document.createElement('div')
    probe.style.cssText = 'background:var(--surface);color:var(--text)'
    panel.append(probe)
    const actual = getComputedStyle(panel), expected = getComputedStyle(probe)
    const colors = { background: actual.backgroundColor, foreground: actual.color, surface: expected.backgroundColor, text: expected.color }
    probe.remove()
    return colors
  })
  expect(colors.background).toBe(colors.surface)
  expect(colors.foreground).toBe(colors.text)
  await page.screenshot({ path: `test-results/flower-dark-fr-${test.info().project.name}.png` })
  await page.locator('.town-build-panel').getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(page.locator('.town-build-panel')).toBeHidden()
  await expect(page.locator('.town-wallet')).toHaveText('15 pièces')
})
