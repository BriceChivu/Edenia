import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
// A real background tab is needed: headless tabs do not report document.hidden here.
const browser = await chromium.launch({
    headless: false,
    ignoreDefaultArgs: [
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling'
    ]
  }),
  results = { browser: browser.version(), physicalPhone: false }
try {
  const context = await browser.newContext({
      viewport: { width: 1100, height: 800 }
    }),
    page = await context.newPage()
  await page.route('**/*', (r) =>
    new URL(r.request().url()).hostname === 'localhost'
      ? r.continue()
      : r.fulfill({ contentType: 'application/javascript', body: '' })
  )
  await page.goto('http://localhost:4188/_site/?internal_test=1')
  await page.waitForFunction(() => typeof window.defaultState === 'function')
  await page.evaluate(() => {
    const s = window.defaultState(4, [], 'light', [], 'en'),
      date = '2026-09-26T04:00:00Z'
    Object.assign(s.onboarding, {
      introSeenAt: date,
      setupCompleted: true,
      setupCompletedAt: date,
      walkthroughCompleted: true,
      walkthroughCompletedAt: date
    })
    s.config.ankiEnabled = false
    window.saveState(s, { backup: false, syncAnalytics: false })
  })
  await page.reload()
  await page.bringToFront()
  await page.waitForFunction(
    () => window.EDENIA_PIXEL_TOWN.controller.metrics.active
  )
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false })
  const { windowId } = await cdp.send('Browser.getWindowForTarget')
  await cdp.send('Browser.setWindowBounds', {
    windowId,
    bounds: { windowState: 'minimized' }
  })
  await page.waitForFunction(() => document.hidden, null, { polling: 100 })
  await page.waitForTimeout(250)
  const start = await page.evaluate(() => ({
    hidden: document.hidden,
    pending: window.EDENIA_PIXEL_TOWN.controller.pending,
    samples: window.EDENIA_PIXEL_TOWN.controller.metrics.samples.length
  }))
  await page.waitForTimeout(30000)
  const end = await page.evaluate(() => ({
    hidden: document.hidden,
    pending: window.EDENIA_PIXEL_TOWN.controller.pending,
    samples: window.EDENIA_PIXEL_TOWN.controller.metrics.samples.length
  }))
  if (
    Object.values(start.pending).some(Boolean) ||
    Object.values(end.pending).some(Boolean) ||
    end.samples !== start.samples
  )
    throw new Error('Hidden work persisted')
  await cdp.send('Browser.setWindowBounds', {
    windowId,
    bounds: { windowState: 'normal' }
  })
  const resumed = performance.now()
  await page.bringToFront()
  await page.waitForFunction(
    () => window.EDENIA_PIXEL_TOWN.controller.metrics.active
  )
  results.hiddenWindow = { start, end, resumeMs: performance.now() - resumed }
  await writeFile(
    'docs/experiments/pixel-town/evidence/visibility.json',
    JSON.stringify(results, null, 2)
  )
  console.log(JSON.stringify(results.hiddenWindow))
} catch (error) {
  results.status = 'blocked'
  results.reason = error.message
  results.hiddenWindow = null
  await writeFile(
    'docs/experiments/pixel-town/evidence/visibility.json',
    JSON.stringify(results, null, 2)
  )
  throw error
} finally {
  await browser.close()
}
