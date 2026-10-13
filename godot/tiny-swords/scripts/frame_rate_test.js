// Loaded by the Godot-owned FrameRateTest autoload only for an explicit test URL.
(() => {
  const requested = new URLSearchParams(location.search).get('tiny_swords_fps')
  if (!['30', '60'].includes(requested) || typeof MainLoop !== 'object'
    || !Array.isArray(MainLoop.preMainLoop) || !Array.isArray(MainLoop.postMainLoop)
    || typeof MainLoop.requestAnimationFrame !== 'function'
    || typeof _emscripten_set_main_loop_timing !== 'function') return false

  let targetFps = Number(requested)
  let nextFrame = null
  let nativeDivisor = 0
  let calibration = 0
  let started = 0
  let previous = null
  let previousWorkMs = 0
  let phase = -1
  let phaseStart = 0
  let samples = []
  let rounds = []
  let report = null
  let status = 'Ready'
  let duration = 10000
  let warmup = 2000
  let order = [60, 30, 30, 60]
  let replayModes = null
  let fixedFps = null
  const roles = ['control', 'trial', 'trial', 'control']
  const originalRAF = MainLoop.requestAnimationFrame.bind(MainLoop)
  const initialSize = () => {
    const canvas = document.querySelector('#canvas')
    return { width: canvas?.width, height: canvas?.height, dpr: devicePixelRatio }
  }
  let comparisonSize = null
  let longTasks = []
  let probes = []
  const observerSupport = { game: false, host: false }
  const observers = []
  for (const [scope, context] of [['game', window], ['host', window.parent]]) {
    try {
      if (!context?.PerformanceObserver || scope === 'host' && context === window) continue
      const observer = new context.PerformanceObserver(list => {
        if (phase < 0) return
        for (const entry of list.getEntries()) {
          longTasks.push({ scope, atEpochMs: context.performance.timeOrigin + entry.startTime,
            durationMs: entry.duration, attribution: entry.name })
          if (longTasks.length > 500) longTasks.shift()
        }
      })
      observer.observe({ type: 'longtask', buffered: false })
      observers.push(observer)
      observerSupport[scope] = true
    } catch {}
  }
  // Parent observers hold this iframe's callback; release them when the engine
  // is retired so retries/profile replacements cannot retain a WASM instance.
  addEventListener('pagehide', () => { for (const observer of observers) observer.disconnect() })
  addEventListener('pageshow', event => {
    if (event.persisted) for (const observer of observers) observer.observe({ type: 'longtask', buffered: false })
  })

  // Native RAF divisors are the cheapest and most stable option when the
  // selected rate aligns with display refresh. Timestamp gating handles other
  // refresh rates without blocking the single-threaded engine.
  const gatedRAF = callback => {
    const generation = MainLoop.currentlyRunningMainloop
    const tick = timestamp => {
      if (generation !== MainLoop.currentlyRunningMainloop) return
      if (nativeDivisor > 0) { callback(timestamp); return }
      const period = 1000 / targetFps
      if (nextFrame === null || timestamp + 0.75 >= nextFrame) {
        nextFrame = nextFrame === null || timestamp - nextFrame > period
          ? timestamp + period : nextFrame + period
        callback(timestamp)
      } else originalRAF(tick)
    }
    originalRAF(tick)
  }
  const refreshDisplay = () => {
    const version = ++calibration
    const intervals = []
    let last = null
    const sample = timestamp => {
      if (version !== calibration) return
      if (document.hidden || window.edeniaPresentationSuspended) return
      if (last !== null && timestamp > last && timestamp - last < 100) intervals.push(timestamp - last)
      last = timestamp
      if (intervals.length < 12) { requestAnimationFrame(sample); return }
      const ratio = 1000 / percentile(intervals, 0.2) / targetFps
      const divisor = Math.max(1, Math.round(ratio))
      nativeDivisor = Math.abs(ratio - divisor) / divisor < 0.02 ? divisor : 0
      MainLoop.requestAnimationFrame = nativeDivisor ? originalRAF : gatedRAF
      nextFrame = null
      _emscripten_set_main_loop_timing(1, nativeDivisor || 1)
    }
    requestAnimationFrame(sample)
  }
  const setFps = fps => {
    if (![30, 60].includes(fps)) return false
    targetFps = fps
    window.edeniaLagCapture?.probe('target-fps', 0, {fps})
    nextFrame = null
    nativeDivisor = 0
    MainLoop.requestAnimationFrame = gatedRAF
    refreshDisplay()
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
    if (replayModes) window.edeniaReplayEncoding.setMode('async')
  }
  const complete = () => {
    const control = summarize(rounds.filter(item => item.role === 'control').flatMap(item => item.samples), fixedFps || 60)
    const trial = summarize(rounds.filter(item => item.role === 'trial').flatMap(item => item.samples), fixedFps || 30)
    window.edeniaFrameTestMotion?.('finish')
    report = {
      version: 2, recordedAt: new Date().toISOString(), userAgent: navigator.userAgent,
      canvas: comparisonSize, warmupMs: warmup, sampleMsPerRound: duration, order, replayModes,
      control, trial,
      movement: window.edeniaFrameTestMotionInfo || null,
      directWalkRoutesEnabled: window.edeniaFrameTestNavigationFastPath === true,
      boundedObstacleSearchEnabled: window.edeniaFrameTestBoundedNavigation === true,
      audioState: typeof GodotAudio === 'object' ? GodotAudio.ctx?.state || 'unavailable' : 'unavailable',
      longTaskObserverSupport: observerSupport, longTasks,
      probes,
      stalls: rounds.flatMap(round => round.samples.filter(item => item.intervalMs > 50).map(item => ({ ...item, targetFps: round.fps, role: round.role }))),
      workReductionPct: 100 * (1 - trial.mainLoopWorkMsPerSecond / control.mainLoopWorkMsPerSecond),
      missedDeadlineChangePoints: trial.missedDeadlinePct - control.missedDeadlinePct,
      rounds: rounds.map((item,index) => ({...summarize(item.samples, item.fps),role:item.role,replayEncoding:replayModes?.[index] || null})),
      measurement: 'Engine preMainLoop to postMainLoop synchronous work; excludes GPU completion and other page tasks. Frame deadlines use 1.5x the selected frame budget. Not a battery measurement.'
    }
    phase = -1
    status = 'Complete'
    setFps(Number(requested))
    if (replayModes) window.edeniaReplayEncoding.setMode('async')
  }
  MainLoop.preMainLoop.push(() => {
    started = performance.now()
  })
  MainLoop.postMainLoop.push(() => {
    const ended = performance.now()
    const intervalMs = previous === null ? 0 : started - previous
    const priorWorkMs = previousWorkMs
    previousWorkMs = ended - started
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
    if (elapsed >= warmup && intervalMs > 0) samples.push({ intervalMs, workMs: ended - started,
      previousWorkMs: priorWorkMs, atEpochMs: performance.timeOrigin + started })
    if (elapsed < warmup + duration) return
    rounds.push({ fps: order[phase], role:roles[phase], samples })
    samples = []
    phase++
    if (phase === order.length) { complete(); return }
    phaseStart = ended
    window.edeniaFrameTestMotion?.('round')
    if (replayModes) window.edeniaReplayEncoding.setMode(replayModes[phase])
    setFps(order[phase])
  })
  MainLoop.postMainLoop.push(() => window.edeniaReplayCaptureAfterFrame?.())
  addEventListener('visibilitychange', () => { if (document.hidden && phase >= 0) cancel('page hidden') })
  window.edeniaFrameTest = {
    refreshDisplay,
    async suspendAudio() {
      const context = typeof GodotAudio === 'object' ? GodotAudio.ctx : null
      if (!context) return 'unavailable'
      if (context.state !== 'running') return context.state
      await Promise.race([context.suspend(), new Promise(resolve => setTimeout(resolve, 1000))])
      return context.state
    },
    recordProbe(operation, durationMs, atEpochMs, details = null) {
      if (phase >= 0 && (durationMs >= 10 || operation === 'obstacle-search')) {
        probes.push({ operation, durationMs, atEpochMs, details })
        if (probes.length > 200) probes.shift()
      }
    },
    cancel(reason) { if (phase >= 0) cancel(reason) },
    setFps(fps) {
      if (phase >= 0) cancel('FPS changed')
      return setFps(fps)
    },
    startComparison(options = {}) {
      if (document.hidden || window.edeniaPresentationSuspended || !window.edeniaLastSavePersisted) return false
      window.edeniaFrameTestMotion?.(options.obstacleRoutes ? 'start-obstacles' : 'start', ...(options.obstacleCell || []))
      if (window.edeniaFrameTestMotion && !window.edeniaFrameTestMotionReady) {
        status = 'Finish current action; need a walkable route.'
        return false
      }
      fixedFps = [30,60].includes(options.fixedFps) ? options.fixedFps : null
      order = fixedFps ? [fixedFps,fixedFps,fixedFps,fixedFps] : [60,30,30,60]
      replayModes = options.replayModes || null
      if (replayModes && (replayModes.length !== 4 || replayModes.some(mode=>!['sync','async'].includes(mode)) || !window.edeniaReplayEncoding)) {
        window.edeniaFrameTestMotion?.('finish'); status = 'Replay comparison unavailable'; return false
      }
      if (replayModes) window.edeniaReplayEncoding.setMode(replayModes[0])
      duration = Math.max(1000, Math.min(30000, Number(options.sampleMs) || 10000))
      warmup = Math.max(1000, Math.min(10000, Number(options.warmupMs) || 2000))
      phase = 0
      phaseStart = performance.now()
      comparisonSize = initialSize()
      samples = []
      rounds = []
      longTasks = []
      probes = []
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
