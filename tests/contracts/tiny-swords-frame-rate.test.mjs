import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const source = await readFile(new URL('../../godot/tiny-swords/scripts/frame_rate_test.js', import.meta.url), 'utf8')
function engine(search = '?tiny_swords_fps=30', withObservers = false) {
  let now = 0
  const queued = []
  const listeners = {}
  const canvas = { width: 1152, height: 496 }
  const loop = { currentlyRunningMainloop: 1, preMainLoop: [], postMainLoop: [], requestAnimationFrame: cb => queued.push(cb) }
  const window = { edeniaLastSavePersisted: true }
  const observers = []
  let nativeInterval = 1
  let frameNumber = 0
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this) }
    observe() { this.observing = true }
    disconnect() { this.observing = false }
  }
  if (withObservers) {
    window.PerformanceObserver = Observer
    window.performance = { timeOrigin: 0 }
    window.parent = { PerformanceObserver: Observer, performance: { timeOrigin: 1000 } }
  }
  const context = { location: { search }, MainLoop: loop, window,
    document: { hidden: false, querySelector: () => canvas }, navigator: { userAgent: 'test' },
    devicePixelRatio: 1, performance: { now: () => now, timeOrigin: 0 }, URLSearchParams,
    requestAnimationFrame: cb => queued.push(cb), addEventListener: (name, cb) => { listeners[name] = cb },
    _emscripten_set_main_loop_timing: (_mode, interval) => { nativeInterval = interval; return 0 } }
  vm.runInNewContext(source, context)
  let frames = 0
  const start = () => {
    const generation = loop.currentlyRunningMainloop
    const run = () => {
      if (generation !== loop.currentlyRunningMainloop) return
      frameNumber++
      if (frameNumber % nativeInterval === 0) {
        for (const cb of loop.preMainLoop) cb()
        now += 2 // Model 2ms of real engine work per rendered frame.
        for (const cb of loop.postMainLoop) cb()
        frames++
      }
      loop.requestAnimationFrame(run)
    }
    loop.requestAnimationFrame(run)
  }
  return { context, canvas, window, loop, listeners, observers,
    start,
    advance(ms, hz = 60) {
      const end = now + ms
      let raf = now
      while (raf < end) {
        raf += 1000 / hz
        now = raf
        const callbacks = queued.splice(0)
        for (const cb of callbacks) cb(raf)
      }
    },
    get frames() { return frames }
  }
}

test('ordinary URLs do not install instrumentation or replace the scheduler', () => {
  for (const search of ['', '?tiny_swords_fps=20', '?tiny_swords_fps=30evil']) {
    const game = engine(search)
    assert.equal(game.window.edeniaFrameTest, undefined)
    assert.equal(game.loop.preMainLoop.length, 0)
  }
})

test('30 and 60 FPS caps hold across 60/90/120/144 Hz displays', () => {
  for (const hz of [59.94, 60, 60.1, 90, 120, 144]) {
    for (const fps of [30, 60]) {
      const game = engine(`?tiny_swords_fps=${fps}`)
      game.start()
      game.advance(10000, hz)
      assert.ok(Math.abs(game.frames / 10 - fps) < 0.3, `${hz}Hz / ${fps}FPS: ${game.frames / 10}`)
    }
  }
})

test('fractional display refresh does not introduce short/long pacing pairs', () => {
  const game = engine()
  game.start()
  game.advance(1000, 60.1)
  game.window.edeniaFrameTest.startComparison({ sampleMs: 5000, warmupMs: 1000 })
  game.advance(24500, 60.1)
  const report = game.window.edeniaFrameTest.getState().report
  assert.ok(report.trial.p95FrameMs < 34, `Unexpected pacing: ${report.trial.p95FrameMs}ms`)
  assert.equal(report.trial.missedDeadlinePct, 0)
})

test('comparison measures engine frames/work, captures stalls, and restores selected FPS', () => {
  const game = engine()
  game.start()
  game.advance(100)
  assert.equal(game.window.edeniaFrameTest.startComparison({ sampleMs: 1000, warmupMs: 1000 }), true)
  game.advance(8500)
  const { report, targetFps, running } = game.window.edeniaFrameTest.getState()
  assert.equal(running, false)
  assert.equal(targetFps, 30)
  assert.ok(Math.abs(report.control.actualFps - 60) < 0.5)
  assert.ok(Math.abs(report.trial.actualFps - 30) < 0.5)
  assert.ok(Math.abs(report.workReductionPct - 50) < 1)
  assert.equal(report.control.missedDeadlinePct, 0)
  const slow = engine()
  slow.start()
  slow.advance(100)
  slow.window.edeniaFrameTest.startComparison({ sampleMs: 1000, warmupMs: 1000 })
  slow.advance(1400)
  slow.advance(200, 10)
  slow.advance(7500)
  assert.ok(slow.window.edeniaFrameTest.getState().report.control.missedDeadlinePct > 0)
})

test('hidden/resized/suspended runs are cancelled instead of reporting false gains', () => {
  for (const reason of ['hidden', 'resized', 'suspended']) {
    const game = engine()
    game.start()
    game.advance(100)
    game.window.edeniaFrameTest.startComparison()
    if (reason === 'hidden') game.context.document.hidden = true
    if (reason === 'resized') game.canvas.width = 800
    if (reason === 'suspended') game.window.edeniaPresentationSuspended = true
    game.advance(100)
    const state = game.window.edeniaFrameTest.getState()
    assert.equal(state.running, false)
    assert.equal(state.report, null)
  }
})

test('encoding comparison holds 60 FPS across all four rounds and restores async mode', () => {
  const game = engine('?tiny_swords_fps=60')
  const modes = []
  game.window.edeniaReplayEncoding = { setMode(mode) { modes.push(mode); return true } }
  game.start(); game.advance(100)
  assert.equal(game.window.edeniaFrameTest.startComparison({sampleMs:1000,warmupMs:1000,
    fixedFps:60,replayModes:['sync','async','async','sync']}),true)
  game.advance(8500)
  const {report,targetFps} = game.window.edeniaFrameTest.getState()
  assert.equal(targetFps,60)
  assert.deepEqual(modes,['sync','async','async','sync','async'])
  assert.ok(report.rounds.every(round=>round.targetFps===60))
  assert.deepEqual(Array.from(report.rounds,round=>round.role),['control','trial','trial','control'])
  assert.equal(report.control.targetFps,60); assert.equal(report.trial.targetFps,60)
})

test('visible stalls longer than a second are measured rather than discarded', () => {
  const game = engine()
  game.start()
  game.advance(100)
  game.window.edeniaFrameTest.startComparison({ sampleMs: 1000, warmupMs: 1000 })
  game.advance(1200)
  game.advance(1800, 0.6)
  game.advance(7000)
  const report = game.window.edeniaFrameTest.getState().report
  assert.ok(report)
  assert.ok(report.control.stallsOver50Ms > 0)
  assert.ok(report.control.p99FrameMs > 1000)
})

test('pending RAF callbacks do not wake a paused engine and resume keeps the cap', () => {
  const game = engine()
  game.start()
  game.advance(100)
  game.loop.currentlyRunningMainloop++
  const before = game.frames
  game.advance(100)
  assert.equal(game.frames, before)
  game.start()
  game.advance(10000)
  assert.ok(Math.abs((game.frames - before) / 10 - 30) < 0.3)
})

test('long-task telemetry records attribution and releases parent observers on retirement', () => {
  const game = engine('?tiny_swords_fps=30', true)
  game.start()
  game.advance(100)
  game.window.edeniaFrameTest.startComparison({ sampleMs: 1000, warmupMs: 1000 })
  game.observers[1].callback({ getEntries: () => [{ startTime: 200, duration: 120, name: 'same-origin-descendant' }] })
  game.advance(8500)
  const report = game.window.edeniaFrameTest.getState().report
  assert.equal(report.longTasks[0].atEpochMs, 1200)
  assert.equal(report.longTasks[0].scope, 'host')
  game.listeners.pagehide()
  assert.ok(game.observers.every(observer => !observer.observing))
  game.listeners.pageshow({ persisted: true })
  assert.ok(game.observers.every(observer => observer.observing))
})
