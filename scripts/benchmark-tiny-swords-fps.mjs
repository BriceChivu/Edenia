// Repeatable comparison on the actual Godot export. Phone layout/CPU throttling
// remain desktop emulation; run the game's Compare button on a physical phone.
import { chromium } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

function arg(name, fallback) {
  const index = process.argv.indexOf(name)
  return index < 0 ? fallback : process.argv[index + 1]
}
const url = new URL(arg('--url', 'http://localhost:8047/'))
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Benchmark seeding is restricted to localhost')
url.searchParams.set('internal_test', '2')
url.searchParams.set('tiny_swords_fps', '30')
const output = resolve(arg('--output', '.cache/tiny-swords-fps-benchmark.json'))
const phone = process.argv.includes('--phone')
const headless = process.argv.includes('--headless')
const throttle = Number(arg('--cpu-throttle', '1'))
const browser = await chromium.launch({ headless, ...(process.argv.includes('--chrome') ? { channel: 'chrome' } : {}) })
try {
  const context = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: phone ? 3 : 2, hasTouch: phone, isMobile: phone,
    serviceWorkers: 'block'
  })
  // Keep external service traffic out of local test profiles and timing runs.
  await context.route('**/*', route => {
    const request = new URL(route.request().url())
    if (['localhost', '127.0.0.1'].includes(request.hostname)) return route.continue()
    if (route.request().resourceType() === 'image' && ['i.ytimg.com', 'yt3.ggpht.com', 'yt3.googleusercontent.com'].includes(request.hostname)) return route.continue()
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(90000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/tiny-swords-game/*/index.html*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
  await page.goto(url.href)
  const island = JSON.parse(await readFile(new URL('../tests/fixtures/tiny-swords-fps-island.json', import.meta.url), 'utf8'))
  const corpus = JSON.parse(await readFile(new URL('../tests/fixtures/tiny-swords-fps-videos.json', import.meta.url), 'utf8'))
  island.carried_wood += island.house_bundle
  island.house_bundle = 0
  await page.evaluate(({ island, corpus }) => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at, levelUpGuidanceShownAt: at })
    state.config.ankiEnabled = false
    state.cityProgress = { maxLevelIndex: island.level - 1, experienceVersion: 1 }
    state.tinySwordsIsland = island
    state.config.channels = corpus.channels
    state.learnerProfile.languages = ['mandarin']
    state.videos = Object.fromEntries(corpus.videos.map(video => [video.id, { ...video, thumbnail: video.thumbnailUrl, status: 'unwatched', watchProgress: [] }]))
    state.channelRefreshes = Object.fromEntries(corpus.channels.map(channel => [channel.id, { lastFetchedAt: at }]))
    localStorage.setItem('edenia_v1_internal_test_2', JSON.stringify(state))
  }, { island, corpus })
  await page.unroute('**/tiny-swords-game/*/index.html*')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const surface = page.locator('#tinySwordsSurface')
  await surface.scrollIntoViewIfNeeded()
  await surface.waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.querySelector('#tinySwordsSurface')?.dataset.gameState === 'ready', null, { timeout: 90000 })
  const game = page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  await game.waitForFunction(() => window.edeniaFrameTest && window.edeniaLastSavePersisted)
  // Revisit the island after the full feed and loading surface have settled.
  // Browser scroll anchoring can otherwise retain the earlier feed position.
  await surface.scrollIntoViewIfNeeded()
  await game.waitForFunction(() => !window.edeniaPresentationSuspended)
  const restored = await page.evaluate(() => loadState().tinySwordsIsland)
  if (restored.tiles.length !== island.tiles.length || restored.tree_offsets.length !== island.tree_offsets.length
    || restored.sheep.length !== 2 || restored.chickens.length !== 2) throw new Error('Benchmark island was not retained intact')
  const library = await page.evaluate(() => ({ videos: Object.keys(loadState().videos).length,
    channels: loadState().config.channels.length, renderedCards: document.querySelectorAll('.video-card').length,
    loadedThumbnails: [...document.querySelectorAll('.video-card img')].filter(image => image.complete && image.naturalWidth > 0).length,
    documentNodes: document.querySelectorAll('*').length }))
  if (library.videos !== 1000 || library.renderedCards === 0) throw new Error('Real-video feed was not loaded')
  const session = await context.newCDPSession(page)
  await session.send('Performance.enable')
  if (throttle !== 1) await session.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  const scenarios = []
  const sampleMs = Number(arg('--sample-ms', '10000'))
  for (const scenario of ['walking', 'terrain-walking']) {
    if (scenario === 'terrain-walking') {
      const box = await game.locator('#canvas').boundingBox()
      await game.locator('#canvas').click({ position: { x: box.width - 36, y: box.height - 32 } })
      await game.waitForFunction(() => window.edeniaCamera.editing)
    }
    await game.waitForTimeout(2000)
    await surface.scrollIntoViewIfNeeded()
    await game.waitForFunction(() => !window.edeniaPresentationSuspended)
    const pageRounds = []
    let previousMetrics = Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
    const started = await game.evaluate(sampleMs => window.edeniaFrameTest.startComparison({ sampleMs }), sampleMs)
    if (!started) throw new Error('Game was not ready for comparison')
    let phase = 0
    const deadline = Date.now() + 4 * (sampleMs + 2000) + 30000
    while (true) {
      await game.waitForTimeout(250)
      const state = await game.evaluate(() => window.edeniaFrameTest.getState())
      if (state.phase !== phase) {
        const metrics = Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
        pageRounds.push({ targetFps: [60, 30, 30, 60][phase],
          seconds: metrics.Timestamp - previousMetrics.Timestamp,
          taskSeconds: metrics.TaskDuration - previousMetrics.TaskDuration,
          scriptSeconds: metrics.ScriptDuration - previousMetrics.ScriptDuration,
          layoutSeconds: metrics.LayoutDuration - previousMetrics.LayoutDuration })
        previousMetrics = metrics
        phase = state.phase
      }
      if (!state.running) break
      if (Date.now() > deadline) throw new Error('Comparison timed out')
    }
    const state = await game.evaluate(() => window.edeniaFrameTest.getState())
    if (!state.report) {
      await page.screenshot({ path: output.replace(/\.json$/, '-cancelled.png') })
      console.log(await page.evaluate(() => ({ scrollY, bodyClass: document.body.className,
        visibleModals: [...document.querySelectorAll('[aria-modal="true"]')].filter(item => item.getClientRects().length).map(item => ({ id: item.id, text: item.innerText.slice(0, 150) })),
        surface: document.querySelector('#tinySwordsSurface')?.getBoundingClientRect().toJSON() })))
      throw new Error(state.status)
    }
    if (!(state.report.movement?.distancePixels > 250)) throw new Error('Pawn did not move during the comparison')
    const pageSummary = fps => {
      const rounds = pageRounds.filter(item => item.targetFps === fps)
      const seconds = rounds.reduce((sum, item) => sum + item.seconds, 0)
      const taskSeconds = rounds.reduce((sum, item) => sum + item.taskSeconds, 0)
      return { taskMsPerSecond: taskSeconds * 1000 / seconds, seconds }
    }
    const wholePage = { control: pageSummary(60), trial: pageSummary(30), rounds: pageRounds,
      measurement: 'CDP Performance.TaskDuration for the page main thread, including same-origin Godot iframe and host tasks; excludes GPU/other threads. Includes warm-ups; phase boundary uncertainty <=250ms.' }
    wholePage.workReductionPct = 100 * (1 - wholePage.trial.taskMsPerSecond / wholePage.control.taskMsPerSecond)
    scenarios.push({ scenario, ...state.report, wholePage })
    console.log(`${scenario}: 60=${state.report.control.actualFps.toFixed(1)} FPS; 30=${state.report.trial.actualFps.toFixed(1)} FPS; work reduction=${state.report.workReductionPct.toFixed(1)}%`)
  }
  const renderer = await game.evaluate(() => {
    const gl = document.querySelector('#canvas').getContext('webgl2')
    const extension = gl?.getExtension('WEBGL_debug_renderer_info')
    return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable'
  })
  const evidence = { recordedAt: new Date().toISOString(), browserVersion: browser.version(),
    hostModel: spawnSync('sysctl', ['-n', 'hw.model'], { encoding: 'utf8' }).stdout?.trim(),
    headless, phoneEmulation: phone, cpuThrottle: throttle, renderer,
    physicalPhone: false, library, corpusFetchedAt: corpus.fetchedAt,
    fixture: { tiles: restored.tiles.length, trees: restored.tree_offsets.length, sheep: restored.sheep.length, chickens: restored.chickens.length }, errors, scenarios }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(evidence, null, 2) + '\n')
  await game.waitForTimeout(600)
  await page.screenshot({ path: output.replace(/\.json$/, '.png') })
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`)
  console.log(`Evidence: ${output}`)
} finally {
  await browser.close()
}
