// Repeatable comparison on the actual Godot export. Phone layout/CPU throttling
// remain desktop emulation; run the game's Compare button on a physical phone.
import { chromium } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { installCloudSyncSimulation } from './diagnostics/tiny-swords-performance/cloud-sync-simulation.mjs'

function arg(name, fallback) {
  const index = process.argv.indexOf(name)
  return index < 0 ? fallback : process.argv[index + 1]
}
const url = new URL(arg('--url', 'http://localhost:8047/'))
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Benchmark seeding is restricted to localhost')
url.searchParams.set('internal_test', '2')
const fixedFps = Number(arg('--fixed-fps', '60'))
if (![30,60].includes(fixedFps)) throw Error('Use --fixed-fps 30 or 60')
url.searchParams.set('tiny_swords_fps', String(fixedFps))
const output = resolve(arg('--output', '.cache/tiny-swords-fps-benchmark.json'))
const phone = process.argv.includes('--phone')
const headless = process.argv.includes('--headless')
const throttle = Number(arg('--cpu-throttle', '1'))
const indexedDb = process.argv.includes('--indexed-db')
const cpuProfile = process.argv.includes('--profile-cpu')
const suspendAudio = process.argv.includes('--suspend-audio')
const cloudSync = process.argv.includes('--cloud-sync')
const replayAbba = process.argv.includes('--replay-abba')
const routeMode = arg('--route', cloudSync ? 'trial' : 'tester')
if (!['public','tester','trial'].includes(routeMode) || routeMode === 'trial' && !cloudSync) throw Error('Trial benchmarking requires --cloud-sync; use public or tester otherwise')
const simulateProgress = cloudSync || process.argv.includes('--progress')
const studyProfile = cloudSync || process.argv.includes('--study-profile')
const retainedVideoCount = Math.min(1000, Math.max(0, Number(arg('--retained-videos', '200'))))
const saveProbe = process.argv.includes('--save-probe')
const checkpointProbe = process.argv.includes('--checkpoint-probe') || saveProbe
const browser = await chromium.launch({ headless, ...(process.argv.includes('--chrome') ? { channel: 'chrome' } : {}) })
const progressTimers = []
let pointerRunning = false
async function run() {
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
  const replayMode = arg('--replay', 'off')
  if (!['off', 'sync', 'async'].includes(replayMode)) throw Error('Use --replay off, sync or async')
  if (replayMode === 'sync') await context.route('**/tiny-swords-game/*/index.html*', async route => {
    const response = await route.fetch()
    const html = await response.text()
    const guard = "const asyncEnabled = ['30', '60'].includes(new URLSearchParams(location.search).get('tiny_swords_fps'))"
    if (!html.includes(guard)) throw Error('Async replay guard missing in exported source')
    await route.fulfill({response, body:html.replace(guard, 'const asyncEnabled = false')})
  })
  const page = await context.newPage()
  page.setDefaultTimeout(90000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/tiny-swords-game/*/index.html*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }))
  await page.goto(url.href)
  const island = JSON.parse(await readFile(new URL('../tests/fixtures/tiny-swords-fps-island.json', import.meta.url), 'utf8'))
  const corpus = JSON.parse(await readFile(new URL('../tests/fixtures/tiny-swords-fps-videos.json', import.meta.url), 'utf8'))
  if (process.argv.includes('--separated-chicken')) {
    const count = island.tiles.length
    island.tiles = island.tiles.filter(tile => tile[0] !== 2)
    island.stock.meadow += count - island.tiles.length
  }
  island.carried_wood += island.house_bundle
  island.house_bundle = 0
  await page.evaluate(({ island, corpus, studyProfile, retainedVideoCount }) => {
    const state = defaultState(4, [], 'light', [], 'en')
    const at = new Date().toISOString()
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true, setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at, levelUpGuidanceShownAt: at, islandAnnouncementSeenAt:at })
    state.config.ankiEnabled = false
    state.cityProgress = { maxLevelIndex: island.level - 1, experienceVersion: 1 }
    state.tinySwordsIsland = island
    state.config.channels = corpus.channels
    state.learnerProfile.languages = ['mandarin']
    state.videos = Object.fromEntries(corpus.videos.map(video => [video.id, { ...video, thumbnail: video.thumbnailUrl, status: 'unwatched', watchProgress: [] }]))
    if (studyProfile) for (const video of Object.values(state.videos).slice(0,retainedVideoCount)) {
      const watchedAt = new Date(Date.now()-86400000).toISOString()
      Object.assign(video,{status:'partial',watchProgressTracked:true,watchProgress:[{seconds:Math.min(60,video.duration/10),experienceSeconds:0,watchedAt,studyDay:watchedAt.slice(0,10)}]})
    }
    state.channelRefreshes = Object.fromEntries(corpus.channels.map(channel => [channel.id, { lastFetchedAt: at }]))
    localStorage.setItem('edenia_v1_internal_test_2', JSON.stringify(state))
  }, { island, corpus, studyProfile, retainedVideoCount })
  await page.unroute('**/tiny-swords-game/*/index.html*')
  if (indexedDb || process.argv.includes('--immediate-sync')) {
    await page.route('**/config.local.js*', async route => {
      const response = await route.fetch()
      const config = { tinySwordsPublicEnabled: true,
        ...(indexedDb ? { indexedDbProfileEnabled: true, indexedDbBackupsEnabled: true, indexedDbBackupCleanupEnabled: true } : {}),
        ...(process.argv.includes('--immediate-sync') ? { tinySwordsQuietSyncEnabled: false } : {}) }
      await route.fulfill({ response, body: (await response.text()) + `\nObject.assign(window.EDENIA_CONFIG, ${JSON.stringify(config)});` })
    })
  }
  let cloud = null
  if (cloudSync) {
    const seeded = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1_internal_test_2')))
    cloud = await installCloudSyncSimulation(page, seeded, { quietSyncEnabled: !process.argv.includes('--immediate-sync') })
    url.searchParams.set('internal_test','1')
    await page.goto(url.href,{waitUntil:'domcontentloaded'})
  } else if (routeMode === 'public') {
    await page.evaluate(()=>localStorage.setItem('edenia_v1',localStorage.getItem('edenia_v1_internal_test_2')))
    url.searchParams.delete('internal_test')
    await page.goto(url.href,{waitUntil:'domcontentloaded'})
  } else await page.reload({ waitUntil: 'domcontentloaded' })
  const surface = page.locator('#tinySwordsSurface')
  try { await surface.waitFor({state:'visible',timeout:cloudSync?20000:90000}) }
  catch (error) {
    await mkdir(dirname(output),{recursive:true})
    await page.screenshot({path:output.replace(/\.json$/,'-startup-failed.png')})
    console.log({cloud:cloud?.getEvidence(),page:await page.evaluate(()=>document.body.innerText.slice(0,1800))})
    throw error
  }
  await surface.scrollIntoViewIfNeeded()
  await page.waitForFunction(() => document.querySelector('#tinySwordsSurface')?.dataset.gameState === 'ready', null, { timeout: 90000 })
  const game = page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
  await game.waitForFunction(() => window.edeniaFrameTest && window.edeniaLastSavePersisted)
  if (cloudSync) {
    // Cloud profiles carry study facts, not untouched catalog entries. Seed
    // the ordinary local catalog cache as well, retaining all cloud progress.
    await page.evaluate(async corpus => {
      const state = loadState()
      const at = new Date().toISOString()
      for (const video of corpus.videos) state.videos[video.id] = {
        status: 'unwatched', watchProgress: [], ...state.videos[video.id],
        // Corpus fields are refetchable metadata, not learner study facts.
        ...video, thumbnail: video.thumbnailUrl, metadataFetchedAt: at
      }
      state.channelRefreshes = Object.fromEntries(corpus.channels.map(channel=>[channel.id,{lastFetchedAt:at}]))
      if (!await saveState(state,{syncCloud:false})) throw Error('Catalog fixture did not persist')
      renderFeed(state)
    },corpus)
    await game.waitForTimeout(1500)
    await surface.scrollIntoViewIfNeeded()
  }
  if (process.argv.includes('--legacy-navigation')) await game.evaluate(() => window.edeniaFrameTestMotion('navigation-control'))
  await page.locator('#videoGrid').scrollIntoViewIfNeeded()
  await page.locator('.video-card').first().waitFor({state:'visible'})
  await page.waitForFunction(() => [...document.querySelectorAll('.video-card img')].some(image=>image.complete && image.naturalWidth>0))
  const warmedFeed = await page.evaluate(()=>({renderedCards:document.querySelectorAll('.video-card').length,
    loadedThumbnails:[...document.querySelectorAll('.video-card img')].filter(image=>image.complete&&image.naturalWidth>0).length}))
  await surface.scrollIntoViewIfNeeded()
  await game.waitForTimeout(1000)
  // Local recording stub exercises the exact mirror without SDK traffic.
  await page.evaluate(enabled => {
    window.EDENIA_ANALYTICS_ENABLED = enabled
    window.posthog = {sessionRecordingStarted: () => enabled, capture() {}}
  }, replayMode !== 'off')
  await game.evaluate(() => {
    window.edeniaBenchmarkReplayFrames = 0
    const canvas = document.querySelector('#canvas')
    new MutationObserver(() => { if (canvas.style.backgroundImage) window.edeniaBenchmarkReplayFrames++ })
      .observe(canvas, {attributes:true, attributeFilter:['style']})
  })
  // Revisit the island after the full feed and loading surface have settled.
  // Browser scroll anchoring can otherwise retain the earlier feed position.
  await surface.scrollIntoViewIfNeeded()
  await game.waitForFunction(() => !window.edeniaPresentationSuspended)
  // Real play begins with a trusted canvas gesture (which also unlocks Web
  // Audio). Open/close the Godot test control without changing the island.
  const canvas = game.locator('#canvas')
  for (let click = 0; click < 2; click++) {
    if (phone) {
      const box = await canvas.boundingBox()
      await page.touchscreen.tap(box.x + 70, box.y + 28)
    } else await canvas.click({ position: { x: 70, y: 28 } })
    await game.waitForTimeout(300)
  }
  const restored = await page.evaluate(() => loadState().tinySwordsIsland)
  if (restored.tiles.length !== island.tiles.length || restored.tree_offsets.length !== island.tree_offsets.length
    || restored.sheep.length !== 2 || restored.chickens.length !== 2) throw new Error('Benchmark island was not retained intact')
  const library = await page.evaluate(() => ({ videos: Object.keys(loadState().videos).length,
    channels: loadState().config.channels.length, renderedCards: document.querySelectorAll('.video-card').length,
    loadedThumbnails: [...document.querySelectorAll('.video-card img')].filter(image => image.complete && image.naturalWidth > 0).length,
    metadataVideos: Object.values(loadState().videos).filter(video => video.title && video.thumbnail).length,
    documentNodes: document.querySelectorAll('*').length }))
  if (library.videos !== 1000 || library.metadataVideos !== 1000 || warmedFeed.renderedCards === 0 || warmedFeed.loadedThumbnails === 0) { console.log({library, cloud:cloud?.getEvidence(), view:await page.evaluate(()=>document.body.innerText.slice(0,1200))}); throw new Error('Real-video feed was not loaded') }
  const session = await context.newCDPSession(page)
  if (checkpointProbe) {
    let probePointer = false
    let pointerTask = null
    let probeMoves = 0, probeMovesAtStart = 0, probePawnStart = null, probePawnEnd = null
    if (saveProbe) {
      if (cloudSync) await page.waitForFunction(() => learnerProfileSyncViewState.status === 'up-to-date')
      if (throttle !== 1) await session.send('Emulation.setCPUThrottlingRate', { rate: throttle })
      const frameBox = await canvas.boundingBox()
      await game.evaluate(() => window.edeniaFrameTest.startComparison({ sampleMs: 15000, fixedFps: 60 }))
      probePointer = true
      pointerTask = (async () => {
        let i = 0
        while (probePointer) {
          await page.mouse.move(frameBox.x + frameBox.width * (0.4 + 0.08 * Math.sin(i++)), frameBox.y + frameBox.height * 0.4)
          probeMoves++
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      })()
      await page.waitForFunction(() => learnerProfileSyncOpportunity.isQuiet() === false)
      await game.waitForTimeout(2500)
      probeMovesAtStart = probeMoves
      probePawnStart = await game.evaluate(() => ({ x: window.edeniaCamera.pawnX, y: window.edeniaCamera.pawnY }))
    }
    const durationsMs = []
    try { for (let i = 0; i < 7; i++) durationsMs.push(await page.evaluate(async fullSave => {
      const state = loadState()
      if (fullSave) {
        const day = new Date().toISOString().slice(0,10)
        state.anki[day] ||= { reviewed: 0, created: 0 }
        state.anki[day].reviewed++
      } else state.tinySwordsIsland.chickens[0][0] += 1
      const began = performance.now()
      if (!await saveState(state, { syncCloud: fullSave, syncAnalytics: false, backup: false, localIslandCheckpoint: !fullSave })) throw Error('Checkpoint did not persist')
      return performance.now() - began
    }, saveProbe))
    if (saveProbe) {
      await game.waitForTimeout(250)
      probePawnEnd = await game.evaluate(() => ({ x: window.edeniaCamera.pawnX, y: window.edeniaCamera.pawnY }))
    }
    } finally { probePointer = false; await pointerTask }
    const warm = durationsMs.slice(2).sort((a,b) => a-b)
    const evidence = { durationsMs, warmMedianMs: warm[2], library, warmedFeed, retainedVideoCount,
      phoneEmulation: phone, cpuThrottle: throttle, saveProbe, immediateSync: process.argv.includes('--immediate-sync'),
      targetFps: saveProbe ? 60 : fixedFps, pointerMoves: probeMoves - probeMovesAtStart,
      pawnDisplacement: probePawnStart ? Math.hypot(probePawnEnd.x - probePawnStart.x, probePawnEnd.y - probePawnStart.y) : null,
      physicalPhone: false, cloudSimulation: cloud?.getEvidence(), measurement: 'Local save completion wall time, including IndexedDB and checkpoint processing; first two samples include warming.' }
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, JSON.stringify(evidence, null, 2))
    console.log(JSON.stringify(evidence))
    if (saveProbe && (!(evidence.pawnDisplacement > 1) || evidence.pointerMoves < 2)) throw Error('The pawn and mouse must move during save measurements')
    if (warm[2] > Number(arg('--max-warm-save-ms', '50'))) throw Error('Repeated local saves exceed the frame-stall threshold')
    return
  }
  await session.send('Performance.enable')
  if (cpuProfile) {
    await session.send('Profiler.enable')
    await session.send('Profiler.setSamplingInterval', { interval: 1000 })
  }
  if (throttle !== 1) await session.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  const pointerMoves = []
  let pointerTask = null
  const scenarios = []
  const sampleMs = Number(arg('--sample-ms', '10000'))
  for (const scenario of ['walking', 'terrain-walking'].filter(name => !checkpointProbe && (!arg('--scenario', '') || name === arg('--scenario', '')))) {
    if (scenario === 'terrain-walking') {
      const box = await game.locator('#canvas').boundingBox()
      await game.locator('#canvas').click({ position: { x: box.width - 36, y: box.height - 32 } })
      await game.waitForFunction(() => window.edeniaCamera.editing)
    }
    await game.waitForTimeout(2000)
    await surface.scrollIntoViewIfNeeded()
    await game.waitForFunction(() => !window.edeniaPresentationSuspended)
    if (suspendAudio) await game.evaluate(() => window.edeniaFrameTest.suspendAudio())
    const pageRounds = []
    if (cpuProfile) await session.send('Profiler.start')
    // Let profile/feed focus restoration settle before placing the island.
    await game.waitForTimeout(1500)
    await page.evaluate(() => document.querySelector('#tinySwordsSurface').scrollIntoView({block:'center', behavior:'instant'}))
    await game.waitForTimeout(400)
    await game.waitForFunction(() => !window.edeniaPresentationSuspended)
    const pointerBox = await canvas.boundingBox()
    pointerRunning = true
    let moves = 0
    pointerTask = (async () => {
      while (pointerRunning) {
        const t = moves / 32
        await page.mouse.move(pointerBox.x + pointerBox.width * (0.55 + 0.3 * Math.sin(t)),
          pointerBox.y + pointerBox.height * (0.56 + 0.22 * Math.cos(t * 1.7)))
        moves++
        await new Promise(resolve => setTimeout(resolve, 16))
      }
    })().catch(error => { if (!page.isClosed()) errors.push(error.message) })
    const started = await game.evaluate(options => window.edeniaFrameTest.startComparison(options), {sampleMs, fixedFps, obstacleRoutes:process.argv.includes('--obstacle-routes'), obstacleCell:process.argv.includes('--hard-route')?[2,2]:null, ...(replayAbba?{replayModes:['sync','async','async','sync']}: {})})
    if (!started) throw new Error('Game was not ready for comparison')
    let progressTimer = null
    let progressChanges = 0
    const progressSaveDurationsMs = []
    let progressBusy = false
    if (simulateProgress) progressTimer = setInterval(async () => {
      if (progressBusy) return
      progressBusy = true
      try {
        const duration = await page.evaluate(async () => {
          const state = loadState(), day = new Date().toISOString().slice(0,10)
          state.anki[day] ||= {reviewed:0,created:0}
          state.anki[day].reviewed++
          const began = performance.now()
          if (!await saveState(state)) throw Error('Simulated progress did not persist')
          return performance.now() - began
        })
        progressSaveDurationsMs.push(duration)
        progressChanges++
      } catch (error) { errors.push(error.message) }
      finally { progressBusy = false }
    }, 6000)
    if (progressTimer) progressTimers.push(progressTimer)
    // Exclude initial route selection/setup from the first measured round.
    let previousMetrics = Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
    let phase = 0
    const deadline = Date.now() + 4 * (sampleMs + 2000) + 30000
    while (true) {
      await game.waitForTimeout(250)
      const state = await game.evaluate(() => window.edeniaFrameTest.getState())
      if (state.phase !== phase) {
        const metrics = Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
        pageRounds.push({ targetFps: fixedFps, variant:['control','trial','trial','control'][phase],
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
    clearInterval(progressTimer)
    pointerRunning = false
    await pointerTask
    pointerMoves.push({scenario, moves, progressChanges, progressSaveDurationsMs})
    const state = await game.evaluate(() => window.edeniaFrameTest.getState())
    if (cpuProfile) {
      const { profile } = await session.send('Profiler.stop')
      await mkdir(dirname(output), { recursive: true })
      await writeFile(output.replace(/\.json$/, `-${scenario}.cpuprofile`), JSON.stringify(profile))
    }
    if (!state.report) {
      await page.screenshot({ path: output.replace(/\.json$/, '-cancelled.png') })
      console.log(await page.evaluate(() => ({ scrollY, bodyClass: document.body.className,
        visibleModals: [...document.querySelectorAll('[aria-modal="true"]')].filter(item => item.getClientRects().length).map(item => ({ id: item.id, text: item.innerText.slice(0, 150) })),
        surface: document.querySelector('#tinySwordsSurface')?.getBoundingClientRect().toJSON() })))
      throw new Error(state.status)
    }
    if (!(state.report.movement?.distancePixels > 250)) throw new Error('Pawn did not move during the comparison')
    const pageSummary = variant => {
      const rounds = pageRounds.filter(item => item.variant === variant)
      const seconds = rounds.reduce((sum, item) => sum + item.seconds, 0)
      const taskSeconds = rounds.reduce((sum, item) => sum + item.taskSeconds, 0)
      return { taskMsPerSecond: taskSeconds * 1000 / seconds, seconds }
    }
    const wholePage = { control: pageSummary('control'), trial: pageSummary('trial'), rounds: pageRounds,
      measurement: 'CDP Performance.TaskDuration for the page main thread, including same-origin Godot iframe and host tasks; excludes GPU/other threads. Includes warm-ups; phase boundary uncertainty <=250ms.' }
    wholePage.workReductionPct = 100 * (1 - wholePage.trial.taskMsPerSecond / wholePage.control.taskMsPerSecond)
    scenarios.push({ scenario, ...state.report, wholePage })
    console.log(`${scenario}: control=${state.report.control.actualFps.toFixed(1)} FPS; trial=${state.report.trial.actualFps.toFixed(1)} FPS; page main-thread work reduction=${wholePage.workReductionPct.toFixed(1)}%`)
  }
  const renderer = await game.evaluate(() => {
    const gl = document.querySelector('#canvas').getContext('webgl2')
    const extension = gl?.getExtension('WEBGL_debug_renderer_info')
    return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable'
  })
  const replayFrames = await game.evaluate(() => window.edeniaBenchmarkReplayFrames)
  if (replayMode !== 'off' && replayFrames < 20) throw Error('Replay did not capture frames')
  const cloudSimulation = cloud?.getEvidence() || null
  if (cloudSync && !checkpointProbe && cloudSimulation.commits < 2) throw Error('Real sync pipeline did not commit simulated progress')
  const evidence = { routeMode, studyProfile, retainedVideoCount, simulateProgress, replayMode, replayFrames, replayAbba, cloudSimulation, navigationMode:process.argv.includes('--legacy-navigation')?'legacy':'bounded walking', recordedAt: new Date().toISOString(), browserVersion: browser.version(),
    hostModel: spawnSync('sysctl', ['-n', 'hw.model'], { encoding: 'utf8' }).stdout?.trim(),
    headless, phoneEmulation: phone, cpuThrottle: throttle, renderer, indexedDb, cpuProfile, suspendAudio,
    physicalPhone: false, fixedFps, warmedFeed, pointerMoves, pointerInput: phone ? 'Emulated mouse input; actual phone touch is a separate test' : 'Continuous mouse movement, targeting 60Hz', library, corpusFetchedAt: corpus.fetchedAt,
    fixture: { tiles: restored.tiles.length, trees: restored.tree_offsets.length, sheep: restored.sheep.length, chickens: restored.chickens.length }, errors, scenarios }
  await mkdir(dirname(output), { recursive: true })
  if (!checkpointProbe) await writeFile(output, JSON.stringify(evidence, null, 2) + '\n')
  await game.waitForTimeout(600)
  await page.screenshot({ path: output.replace(/\.json$/, '.png') })
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`)
  console.log(`Evidence: ${output}`)
} finally {
  pointerRunning = false
  for (const timer of progressTimers) clearInterval(timer)
  await browser.close()
}

}
await run()
