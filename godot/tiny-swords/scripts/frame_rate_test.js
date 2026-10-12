// Loaded by the Godot-owned FrameRateTest autoload only for an explicit test URL.
(() => {
  const requested = new URLSearchParams(location.search).get('tiny_swords_fps')
  if (!['30', '60'].includes(requested) || typeof MainLoop !== 'object'
    || !Array.isArray(MainLoop.preMainLoop) || !Array.isArray(MainLoop.postMainLoop)
    || typeof MainLoop.requestAnimationFrame !== 'function'
    || typeof _emscripten_set_main_loop_timing !== 'function') return false

  let targetFps = Number(requested)
  let nextFrame = null
  let lastRAF = null
  let rafCount = 0
  const refreshIntervals = []
  let started = 0
  let previous = null
  let phase = -1
  let phaseStart = 0
  let samples = []
  let rounds = []
  let report = null
  let status = 'Ready'
  let duration = 10000
  let warmup = 2000
  const order = [60, 30, 30, 60]
  const originalRAF = MainLoop.requestAnimationFrame.bind(MainLoop)
  const initialSize = () => {
    const canvas = document.querySelector('#canvas')
    return { width: canvas?.width, height: canvas?.height, dpr: devicePixelRatio }
  }
  let comparisonSize = null

  // Gate only the engine's RAF callback. Browser input and page rendering retain
  // their refresh rate. A timestamp budget also caps 90/120/144 Hz displays.
  MainLoop.requestAnimationFrame = callback => {
    const generation = MainLoop.currentlyRunningMainloop
    const tick = timestamp => {
      if (generation !== MainLoop.currentlyRunningMainloop) return
      if (lastRAF !== null && timestamp > lastRAF && timestamp - lastRAF < 100) {
        refreshIntervals.push(timestamp - lastRAF)
        if (refreshIntervals.length > 60) refreshIntervals.shift()
      }
      lastRAF = timestamp
      // Align integer rates to actual display ticks, including fractional
      // 59.94Hz displays. Absolute 33.333ms deadlines otherwise drift and
      // introduce avoidable 16/50ms pairs. Use a robust refresh estimate so an
      // occasional missed callback does not halve our inferred refresh rate.
      if (refreshIntervals.length >= 12) {
        const ratio = 1000 / percentile(refreshIntervals, 0.2) / targetFps
        const divisor = Math.max(1, Math.round(ratio))
        if (Math.abs(ratio - divisor) / divisor < 0.02) {
          rafCount++
          if (rafCount % divisor === 0) callback(timestamp)
          else originalRAF(tick)
          return
        }
      }
      const period = 1000 / targetFps
      if (nextFrame === null || timestamp + 0.75 >= nextFrame) {
        nextFrame = nextFrame === null || timestamp - nextFrame > period
          ? timestamp + period : nextFrame + period
        callback(timestamp)
      } else originalRAF(tick)
    }
    originalRAF(tick)
  }

  const setFps = fps => {
    if (![30, 60].includes(fps)) return false
    targetFps = fps
    nextFrame = null
    rafCount = 0
    lastRAF = null
    // Never use Engine.max_fps's blocking sleep on the single-threaded web build.
    return _emscripten_set_main_loop_timing(1, 1) === 0
  }
  const percentile = (values, quantile) => {
    const sorted = values.slice().sort((a, b) => a - b)
    return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] || 0
  }
  const summarize = (frames, fps) => {
    const elapsedMs = frames.reduce((sum, item) => sum + item.intervalMs, 0)
    const workMs = frames.reduce((sum, item) => sum + item.workMs, 0)
    const budget = 1000 / fps
    return {
      targetFps: fps, frames: frames.length, elapsedMs,
      actualFps: frames.length * 1000 / elapsedMs,
      p50FrameMs: percentile(frames.map(item => item.intervalMs), 0.5),
      p95FrameMs: percentile(frames.map(item => item.intervalMs), 0.95),
      p99FrameMs: percentile(frames.map(item => item.intervalMs), 0.99),
      missedDeadlinePct: frames.filter(item => item.intervalMs > budget * 1.5).length * 100 / frames.length,
      stallsOver50Ms: frames.filter(item => item.intervalMs > 50).length,
      meanWorkMs: workMs / frames.length,
      p95WorkMs: percentile(frames.map(item => item.workMs), 0.95),
      mainLoopWorkMsPerSecond: workMs * 1000 / elapsedMs
    }
  }
  const cancel = reason => {
    window.edeniaFrameTestMotion?.('finish')
    phase = -1
    samples = []
    status = `Cancelled: ${reason}. Compare again.`
    report = null
    setFps(Number(requested))
  }
  const complete = () => {
    const control = summarize(rounds.filter(item => item.fps === 60).flatMap(item => item.samples), 60)
    const trial = summarize(rounds.filter(item => item.fps === 30).flatMap(item => item.samples), 30)
    window.edeniaFrameTestMotion?.('finish')
    report = {
      version: 1, recordedAt: new Date().toISOString(), userAgent: navigator.userAgent,
      canvas: comparisonSize, warmupMs: warmup, sampleMsPerRound: duration, order,
      control, trial,
      movement: window.edeniaFrameTestMotionInfo || null,
      workReductionPct: 100 * (1 - trial.mainLoopWorkMsPerSecond / control.mainLoopWorkMsPerSecond),
      missedDeadlineChangePoints: trial.missedDeadlinePct - control.missedDeadlinePct,
      rounds: rounds.map(item => summarize(item.samples, item.fps)),
      measurement: 'Engine preMainLoop to postMainLoop synchronous work; excludes GPU completion and other page tasks. Frame deadlines use 1.5x the selected frame budget. Not a battery measurement.'
    }
    phase = -1
    status = 'Complete'
    setFps(Number(requested))
  }
  MainLoop.preMainLoop.push(() => {
    started = performance.now()
  })
  MainLoop.postMainLoop.push(() => {
    const ended = performance.now()
    const intervalMs = previous === null ? 0 : started - previous
    previous = started
    if (phase < 0) return
    // Count visible long stalls: they are the symptom we are measuring. Actual
    // suspension is cancelled explicitly by visibility and Godot presentation.
    if (document.hidden || window.edeniaPresentationSuspended) {
      cancel('page hidden or paused')
      return
    }
    if (JSON.stringify(initialSize()) !== JSON.stringify(comparisonSize)) {
      cancel('canvas size changed')
      return
    }
    const elapsed = ended - phaseStart
    status = `${order[phase]} FPS · round ${phase + 1}/4 · ${Math.max(0, Math.ceil((warmup + duration - elapsed) / 1000))}s`
    if (elapsed >= warmup && intervalMs > 0) samples.push({ intervalMs, workMs: ended - started })
    if (elapsed < warmup + duration) return
    rounds.push({ fps: order[phase], samples })
    samples = []
    phase++
    if (phase === order.length) { complete(); return }
    phaseStart = ended
    window.edeniaFrameTestMotion?.('round')
    setFps(order[phase])
  })
  addEventListener('visibilitychange', () => { if (document.hidden && phase >= 0) cancel('page hidden') })
  window.edeniaFrameTest = {
    cancel(reason) { if (phase >= 0) cancel(reason) },
    setFps(fps) {
      if (phase >= 0) cancel('FPS changed')
      return setFps(fps)
    },
    startComparison(options = {}) {
      if (document.hidden || window.edeniaPresentationSuspended || !window.edeniaLastSavePersisted) return false
      window.edeniaFrameTestMotion?.('start')
      if (window.edeniaFrameTestMotion && !window.edeniaFrameTestMotionReady) {
        status = 'Finish current action; need a walkable route.'
        return false
      }
      duration = Math.max(1000, Math.min(30000, Number(options.sampleMs) || 10000))
      warmup = Math.max(1000, Math.min(10000, Number(options.warmupMs) || 2000))
      phase = 0
      phaseStart = performance.now()
      comparisonSize = initialSize()
      samples = []
      rounds = []
      report = null
      status = 'Starting'
      return setFps(order[phase])
    },
    getState: () => ({ targetFps, phase, running: phase >= 0, status, report }),
    download() {
      if (!report) return false
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'tiny-swords-fps-comparison.json'
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      return true
    }
  }
  // The autoload runs before Emscripten finishes installing its main loop.
  requestAnimationFrame(() => setFps(targetFps))
  return true
})()
