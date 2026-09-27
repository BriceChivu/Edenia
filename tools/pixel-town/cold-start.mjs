import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
const browser = await chromium.launch(),
  results = []
try {
  for (let iteration = 0; iteration < 5; iteration++)
    for (const stage of [2, 12]) {
      const context = await browser.newContext({
          viewport: { width: 390, height: 844 }
        }),
        page = await context.newPage()
      await page.route('**/*', (r) =>
        new URL(r.request().url()).hostname === 'localhost'
          ? r.continue()
          : r.fulfill({ contentType: 'application/javascript', body: '' })
      )
      await page.goto('http://localhost:4188/_site/?internal_test=1')
      await page.waitForFunction(
        () => typeof window.defaultState === 'function'
      )
      await page.evaluate((stage) => {
        const s = window.defaultState(4, [], 'light', [], 'en'),
          date = '2026-09-26T04:00:00.000Z',
          points = stage === 2 ? 60 : 1050
        Object.assign(s.onboarding, {
          introSeenAt: date,
          setupCompleted: true,
          setupCompletedAt: date,
          walkthroughCompleted: true,
          walkthroughCompletedAt: date
        })
        s.config.ankiEnabled = false
        s.cityProgress.maxLevelIndex = stage - 1
        s.anki['2026-09-26'] = {
          reviewed: points / window.getAnkiPointsFromReviews(1),
          created: 0,
          loggedAt: date,
          observedAt: date
        }
        window.saveState(s, { backup: false, syncAnalytics: false })
      }, stage)
      const cdp = await context.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.clearBrowserCache')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: 500000,
        uploadThroughput: 125000
      })
      const start = performance.now()
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction((stage) => {
        const img = document.getElementById('cityMilestoneImage')
        return (
          img.complete &&
          img.naturalWidth === 768 &&
          img.dataset.pixelStage === String(stage)
        )
      }, stage)
      const stillMs = performance.now() - start
      await page.waitForFunction(
        () => window.EDENIA_PIXEL_TOWN.controller.metrics.active
      )
      const motionMs = performance.now() - start
      await page.waitForTimeout(1000)
      const assets = await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .filter((r) => r.name.includes('/pixel-town/'))
          .map((r) => ({
            name: r.name,
            encoded: r.encodedBodySize,
            transfer: r.transferSize
          }))
      )
      results.push({
        iteration,
        stage,
        stillMs,
        motionMs,
        encodedBytes: assets.reduce((s, a) => s + a.encoded, 0),
        assets
      })
      console.log(
        JSON.stringify({
          iteration,
          stage,
          stillMs,
          motionMs,
          bytes: results.at(-1).encodedBytes
        })
      )
      await context.close()
    }
  await writeFile(
    'docs/experiments/pixel-town/evidence/cold-start.json',
    JSON.stringify(
      {
        browser: browser.version(),
        viewport: { width: 390, height: 844 },
        network: { downloadBitsPerSecond: 4000000, latencyMs: 150 },
        physicalPhone: false,
        samples: results
      },
      null,
      2
    )
  )
} finally {
  await browser.close()
}
