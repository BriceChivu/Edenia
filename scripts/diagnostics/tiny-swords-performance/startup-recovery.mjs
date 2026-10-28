// Matched source-owned exports, synthetic fixture, disposable installed Chrome
// profiles. Run alone: builds and other browser suites invalidate comparisons.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { startupHost } from '../../../tests/support/tiny-swords-startup-host.mjs'

const option = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback
const baseline = resolve(option('baseline', '.cache/startup-implementation/baseline-site'))
const candidate = resolve(option('candidate', '_site'))
const visits = Number(option('visits', '20')), seconds = Number(option('seconds', '60'))
const out = resolve(option('output', '.cache/startup-implementation/performance'))
assert.ok(visits >= 20 && Number.isInteger(visits), 'Acceptance requires at least twenty visits per cache/build case')
assert.ok(seconds >= 60 && seconds <= 300, 'Use at least sixty seconds of actual engine frames')
await mkdir(out, { recursive: true })
const rows = [], games = [], memory = []
const settings = { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
const hosts = { baseline: await startupHost({ root: baseline }), candidate: await startupHost({ root: candidate }) }
const profiles = [], contexts = []
const metadata = { at: new Date().toISOString(), visits, seconds, viewport: settings.viewport,
  baselineRelease: hosts.baseline.release, candidateRelease: hosts.candidate.release,
  power: execFileSync('pmset', ['-g', 'batt'], { encoding: 'utf8' }).trim() }
function quantile(values, p) { const a = [...values].sort((a, b) => a - b); return a[Math.max(0, Math.ceil(a.length * p) - 1)] }
async function save() { await writeFile(resolve(out, 'results.json'), JSON.stringify({ metadata, rows, games, memory }, null, 2)) }
async function profile() { const path = await mkdtemp(resolve(tmpdir(), 'edenia-startup-perf-')); profiles.push(path); return path }
async function launch(path) { const context = await chromium.launchPersistentContext(path, settings); contexts.push(context); return context }
async function visit(context, build, cache, index) {
  const page = await context.newPage(), host = hosts[build], requestStart = host.requests.length
  try {
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (!window.islandReadyAt && document.getElementById('tinySwordsSurface')?.dataset.gameState === 'ready') {
          window.islandReadyAt = performance.now(); observer.disconnect()
        }
      }); observer.observe(document, { attributes: true, subtree: true, attributeFilter: ['data-game-state'] })
    })
    await page.goto(host.url)
    await page.waitForFunction(() => Boolean(window.islandReadyAt), null, { timeout: 60000 })
    const data = await page.evaluate(() => ({ readyMs: islandReadyAt, exposure, diagnostics: window.edeniaIslandStartupDiagnostics?.() }))
    assert.deepEqual(data.exposure, { failureFrames: 0, retryFrames: 0 })
    if (build === 'candidate') assert.ok(!data.diagnostics.some(x => x.outcome === 'failure'))
    const engineRequests = host.requests.slice(requestStart).filter(x => x.path.includes('/tiny-swords-engine/')).length
    if (cache === 'warm') assert.equal(engineRequests, 0, 'a healthy warm visit must reuse its validated engine')
    const row = { build, cache, index, readyMs: data.readyMs, engineRequests }
    rows.push(row); console.log(JSON.stringify(row)); await save()
  } finally { await page.close() }
}
async function rendererMemory(browser) {
  const session = await browser.newBrowserCDPSession()
  try {
    const { processInfo } = await session.send('SystemInfo.getProcessInfo')
    const renderers = processInfo.filter(x => x.type === 'renderer')
    const pids = renderers.map(x => x.id).filter(Number.isSafeInteger)
    const rss = pids.length ? execFileSync('ps', ['-p', pids.join(','), '-o', 'rss='], { encoding: 'utf8' }).trim().split(/\s+/).map(Number).reduce((a, b) => a + b, 0) * 1024 : 0
    return { rendererRssBytes: rss, renderers: renderers.length }
  } finally { await session.detach() }
}
try {
  if (!process.argv.includes('--gameplay-only')) {
    for (let index = 0; index < visits; index++) {
      for (const build of index % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
        const context = await launch(await profile())
        try { await visit(context, build, 'cold', index) } finally { await context.close() }
      }
    }
    const warm = { baseline: await launch(await profile()), candidate: await launch(await profile()) }
    for (const build of ['baseline', 'candidate']) await visit(warm[build], build, 'prime', 0)
    for (let index = 0; index < visits; index++) for (const build of index % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) await visit(warm[build], build, 'warm', index)
    for (const context of Object.values(warm)) await context.close()
  }
  const browser = await chromium.launch(settings)
  metadata.browserVersion = browser.version()
  try {
    // Each run captures the engine's native MainLoop.runIter callback, not an
    // independent browser rAF counter. The HTTP host inserts identical probes.
    for (const [run, build] of ['baseline', 'candidate', 'candidate', 'baseline'].entries()) {
      const host = await startupHost({ root: build === 'baseline' ? baseline : candidate, instrument: true })
      const context = await browser.newContext({ viewport: settings.viewport }), page = await context.newPage()
      try {
        await page.goto(host.url); await page.waitForFunction(() => document.getElementById('tinySwordsSurface').dataset.gameState === 'ready', null, { timeout: 60000 })
        await page.evaluate(() => { window.probeFinished = true })
        const frame = page.frames().find(x => x.url().includes('/tiny-swords-game/'))
        await frame.waitForFunction(() => window.edeniaCamera?.width > 0)
        const initial = await frame.evaluate(() => window.edeniaCamera)
        await frame.evaluate(() => { window.edeniaEngineBenchmark = { intervals: [], work: [], last: 0, wasmBytes: 0 } })
        const began = performance.now(), positions = []
        for (let step = 0; performance.now() - began < seconds * 1000; step++) {
          const camera = await frame.evaluate(() => window.edeniaCamera)
          const bounds = await page.locator('iframe').boundingBox()
          const target = { x: initial.pawnX + (step % 2 ? -25 : 25), y: initial.pawnY + (step % 3 ? 12 : -12) }
          const x = bounds.x + ((target.x - camera.x) * camera.zoom + camera.width / 2) * bounds.width / camera.width
          const y = bounds.y + ((target.y - camera.y) * camera.zoom + camera.height / 2) * bounds.height / camera.height
          await page.mouse.click(x, y)
          await page.waitForTimeout(2000)
          positions.push(await frame.evaluate(() => ({ x: edeniaCamera.pawnX, y: edeniaCamera.pawnY })))
        }
        const sample = await frame.evaluate(() => window.edeniaEngineBenchmark)
        assert.ok(sample.intervals.length > seconds * 20, 'probe must observe actual engine frames')
        assert.ok(new Set(positions.map(x => `${Math.round(x.x)},${Math.round(x.y)}`)).size > 2, 'script must exercise real pawn movement')
        const row = { build, run, frames: sample.intervals.length, medianFrameMs: quantile(sample.intervals, .5),
          p95FrameMs: quantile(sample.intervals, .95), p99FrameMs: quantile(sample.intervals, .99),
          longFrames: sample.intervals.filter(x => x > 50).length, medianWorkMs: quantile(sample.work, .5), p95WorkMs: quantile(sample.work, .95),
          memory: { wasmBytes: sample.wasmBytes, ...await rendererMemory(browser) }, positions }
        games.push(row); console.log(JSON.stringify({ ...row, positions: undefined })); await save()
      } finally { await context.close(); await host.close() }
    }
    // Repeated fully initialized, rejected restores exercise the same retirement
    // path with real WASM/GPU allocations, without pretending a corrupt save is
    // a retryable empty world. Each synthetic replacement starts a new lifecycle.
    const host = await startupHost({ root: candidate }), context = await browser.newContext({ viewport: settings.viewport })
    const page = await context.newPage()
    try {
      await page.goto(host.url + '?inactive')
      for (let index = 0; index < 20; index++) {
        await page.evaluate(() => replaceIsland({ ...fixture, version: 999 }))
        await page.waitForFunction(() => document.getElementById('tinySwordsSurface').dataset.gameState === 'restore-blocked', null, { timeout: 60000 })
        assert.equal(await page.locator('iframe').count(), 0)
        assert.equal(await page.evaluate(() => saves.length), 0)
        memory.push({ index, ...await rendererMemory(browser) }); await save()
      }
      console.log(JSON.stringify({ memoryFirst: memory.slice(0, 5), memoryLast: memory.slice(-5) }))
    } finally { await context.close(); await host.close() }
  } finally { await browser.close() }
  const summary = { startup: {}, games }
  for (const cache of ['cold', 'warm']) for (const build of ['baseline', 'candidate']) {
    const values = rows.filter(x => x.build === build && x.cache === cache).map(x => x.readyMs)
    if (values.length) summary.startup[`${build}-${cache}`] = { count: values.length, medianMs: quantile(values, .5), p95Ms: quantile(values, .95) }
  }
  await writeFile(resolve(out, 'summary.json'), JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary))
} finally {
  for (const context of contexts) await context.close().catch(() => {})
  for (const host of Object.values(hosts)) await host.close()
  for (const path of profiles) await rm(path, { recursive: true, force: true })
  await save()
}
