import { expect, test } from '../support/network-fixture.mjs'
import { readBuiltExperience } from '../support/built-experience.mjs'
import { resolve } from 'node:path'

for (const experience of ['current', 'retained']) test(`${experience}: public health reports usable opening and recovery without private data`, async ({ page }) => {
  await page.route('https://us.i.posthog.com/capture/', route => route.fulfill({ json: { status: 1 } }))
  const html = await readBuiltExperience(experience === 'current' ? 'https://www.edenia.study/?internal_test=2' : 'https://www.edenia.study/')
  await page.route('https://www.edenia.study/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html })
    if (url.pathname === '/config.local.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.EDENIA_CONFIG={accountFeaturesRollout:"off",learnerProfileLifecycleEnabled:false,tinySwordsEnabled:false,indexedDbProfileEnabled:false}' })
    return route.fulfill({ path: resolve('_site', '.' + decodeURIComponent(url.pathname)) })
  })
  await page.addInitScript(() => {
    window.healthEvents = []
    window.posthog = { __loaded: true, init(_key, options) { options.loaded?.() }, capture(event, properties) { window.healthEvents.push({ event, properties }) }, setPersonProperties() {}, register() {} }
  })
  await page.goto('https://www.edenia.study/')
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
  const opened = await page.evaluate(() => healthEvents.filter(x => x.event === 'edenia_health' && x.properties.health_operation === 'app'))
  expect(opened.map(x => x.properties.health_outcome)).toEqual(['started', 'success'])
  await page.evaluate(async () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'edenia_v1') throw new DOMException('PRIVATE SAVED PROFILE', 'QuotaExceededError')
      return original.call(this, key, value)
    }
    const state = loadState()
    state.config.theme = 'dark'
    window.healthSaveResult = await saveState(state)
    window.dispatchEvent(new ErrorEvent('error', { error: { name: 'TypeError', message: 'PRIVATE SAVED PROFILE', stack: 'TypeError: PRIVATE SAVED PROFILE\n at https://www.edenia.study/app.js?token=SECRET:42:7' }, filename: 'https://www.edenia.study/app.js?token=SECRET', lineno: 42, colno: 7 }))
  })
  expect(await page.evaluate(() => healthSaveResult)).toBe(true)
  const reports = await page.evaluate(() => healthEvents.filter(x => x.event === 'edenia_health' || x.event === '$exception'))
  expect(reports.some(x => x.properties.health_operation === 'save' && x.properties.health_outcome === 'degraded')).toBe(true)
  expect(reports.some(x => x.event === '$exception')).toBe(true)
  expect(JSON.stringify(reports)).not.toMatch(/PRIVATE|SECRET|token=/)
  await page.goto('about:blank')
  await page.unrouteAll({ behavior: 'wait' })
})

test('internal tester and local preview never collect health events', async ({ page }) => {
  await page.addInitScript(() => { window.healthEvents = []; window.posthog = { __loaded: true, init() {}, capture(event, properties) { window.healthEvents.push({ event, properties }) }, setPersonProperties() {}, register() {} } })
  for (const url of ['/', '/?internal_test=2', '/?internal_test=1']) {
    await page.goto(url)
    await page.waitForFunction(() => typeof window.edeniaHealth?.report === 'function')
    await page.evaluate(() => window.edeniaHealth.report('save', 'failure', { reason: 'save-failed' }))
    expect(await page.evaluate(() => healthEvents.filter(x => x.event === 'edenia_health' || x.event === '$exception'))).toEqual([])
  }
})
