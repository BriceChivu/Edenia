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
test('retired pixel town is never mounted, including after an internal visit', async ({
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
  await expect(page.locator('#cityMilestoneImage, #cityTimeWaveform')).toHaveCount(0)
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
