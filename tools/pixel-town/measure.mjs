// Local browser evidence. Emulation is never physical-phone proof.
import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const url = process.env.PIXEL_TOWN_URL || 'http://localhost:4190/_site/'
const long = process.argv.includes('--long'),
  full = process.argv.includes('--full')
const browser = await chromium.launch({ headless: true })
const output = {
  started: new Date().toISOString(),
  browser: browser.version(),
  host: execFileSync('uname', ['-a'], { encoding: 'utf8' }).trim(),
  mode: full
    ? 'contract windows'
    : long
      ? '10-minute longevity'
      : 'short diagnostic',
  runs: []
}
const p95 = (a) =>
  [...a].sort((a, b) => a - b)[Math.max(0, Math.ceil(a.length * 0.95) - 1)] || 0
async function run(mode, feedSize, stage, iteration) {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    }),
    page = await context.newPage()
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url())
    return u.hostname === 'localhost'
      ? route.continue()
      : route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: ''
        })
  })
  await page.goto(url + (mode === 'disabled' ? '' : '?internal_test=1'))
  await page.waitForFunction(() => typeof window.defaultState === 'function')
  const fixture = await page.evaluate(
    ({ feedSize, stage, mode }) => {
      const s = window.defaultState(4, [], 'light', [], 'en'),
        date = '2026-09-27T04:00:00.000Z'
      Object.assign(s.onboarding, {
        introSeenAt: date,
        setupCompleted: true,
        setupCompletedAt: date,
        walkthroughCompleted: true,
        walkthroughCompletedAt: date
      })
      s.config.ankiEnabled = false
      s.cityProgress.maxLevelIndex = stage - 1
      for (let i = 0; i < feedSize; i++) {
        const id = `fixture${String(i).padStart(4, '0')}`
        s.videos[id] = {
          id,
          title: `Study fixture ${i}`,
          channelId: 'fixture',
          channelTitle: 'Fixture',
          publishedAt: date,
          duration: 300,
          watched: false,
          thumbnail: ''
        }
      }
      window.saveState(s, { backup: false, syncAnalytics: false })
      localStorage.setItem(
        'edenia.pixelTown.motion',
        mode === 'still' ? 'off' : 'on'
      )
      return JSON.stringify(s.videos)
    },
    { feedSize, stage, mode }
  )
  const cdp = await context.newCDPSession(page)
  await cdp.send('HeapProfiler.enable')
  await cdp.send('HeapProfiler.collectGarbage')
  const start = performance.now()
  await page.reload()
  await page.waitForFunction(
    () => document.getElementById('cityMilestoneImage').naturalWidth > 0
  )
  if (mode === 'motion')
    await page.waitForFunction(
      () => window.EDENIA_PIXEL_TOWN?.controller?.metrics.active
    )
  const startupMs = performance.now() - start
  const screenshot = `docs/experiments/pixel-town/evidence/${mode}-${stage}-${feedSize}.png`
  if (iteration === 0)
    await page.locator('.city-section').screenshot({ path: screenshot })
  const before = (await cdp.send('Runtime.getHeapUsage')).usedSize
  const idleMs = long ? 600000 : full ? 30000 : 2500
  await page.waitForTimeout(idleMs)
  const actions = []
  for (let n = 0; n < 20; n++) {
    actions.push(
      await page.evaluate(async (n) => {
        const start = performance.now()
        window.updateCityMilestoneImage([0, 60, 320, 570, 1050][n % 5])
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r))
        )
        return performance.now() - start
      }, n)
    )
  }
  const scroll = await page.evaluate(
    async (duration) => {
      const intervals = []
      let prior = performance.now(),
        start = prior
      while (performance.now() - start < duration) {
        await new Promise(requestAnimationFrame)
        const now = performance.now()
        intervals.push(now - prior)
        prior = now
        window.scrollTo(0, Math.sin((now - start) / 600) * 400 + 400)
      }
      window.scrollTo(0, 0)
      return {
        samples: intervals.length,
        over20ms: intervals.filter((t) => t > 20).length,
        over50ms: intervals.filter((t) => t > 50).length,
        p95: [...intervals].sort((a, b) => a - b)[
          Math.ceil(intervals.length * 0.95) - 1
        ]
      }
    },
    full ? 30000 : 2500
  )
  if (mode !== 'disabled') {
    await page
      .locator('.city-section')
      .evaluate((el) => (el.style.display = 'none'))
    await page.waitForTimeout(full ? 30000 : 500)
    const stopped = await page.evaluate(
      () => window.EDENIA_PIXEL_TOWN.controller.pending
    )
    if (Object.values(stopped).some(Boolean))
      throw new Error('Offscreen work persisted')
    await page
      .locator('.city-section')
      .evaluate((el) => (el.style.display = ''))
    const background = await context.newPage()
    await background.bringToFront()
    await page.waitForTimeout(full ? 30000 : 500)
    await background.close()
    await page.bringToFront()
    // Real visibility state is recorded; headless focus is not claimed as hidden-tab proof.
  }
  for (let i = 0; i < 50; i++) {
    await page.evaluate(
      (i) =>
        window.updateCityMilestoneImage(
          [0, 60, 140, 230, 320, 400, 480, 570, 680, 800, 920, 1050][i % 12]
        ),
      i
    )
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(1000)
  await cdp.send('HeapProfiler.collectGarbage')
  const after = (await cdp.send('Runtime.getHeapUsage')).usedSize
  const town = await page.evaluate(() => {
    const c = window.EDENIA_PIXEL_TOWN?.controller
    return c ? { ...c.metrics, pending: c.pending } : null
  })
  const requests = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((r) => r.name.includes('/pixel-town/'))
      .map((r) => ({
        url: r.name,
        encoded: r.encodedBodySize,
        decoded: r.decodedBodySize
      }))
  )
  const row = {
    mode,
    feedSize,
    stage,
    iteration,
    fixtureHash: createHash('sha256').update(fixture).digest('hex'),
    mountedCards: await page.locator('.video-card').count(),
    startupMs,
    actions,
    actionP95: p95(actions),
    scroll,
    heapBefore: before,
    heapAfter: after,
    heapGrowth: after - before,
    town,
    requests,
    updateP95: p95(town?.samples.map((x) => x.duration) || [])
  }
  output.runs.push(row)
  await writeFile(
    'docs/experiments/pixel-town/evidence/measurements.json',
    JSON.stringify(output, null, 2)
  )
  console.log(
    JSON.stringify({
      mode,
      feedSize,
      stage,
      iteration,
      startupMs,
      actionP95: row.actionP95,
      updateP95: row.updateP95,
      heapGrowth: row.heapGrowth,
      mountedCards: row.mountedCards
    })
  )
  await context.close()
}
await mkdir('docs/experiments/pixel-town/evidence', { recursive: true })
try {
  if (long) await run('motion', 500, 12, 0)
  else
    for (const feed of [5, 500])
      for (const stage of [2, 12])
        for (let i = 0; i < 5; i++)
          for (const mode of i % 2
            ? ['motion', 'still', 'disabled']
            : ['disabled', 'still', 'motion'])
            await run(mode, feed, stage, i)
} finally {
  await browser.close()
}
