// The learner runtime only decodes authored stills/patches. No procedural generation on the main thread.
export function validateManifest(m, version) {
  if (
    m.version !== version ||
    m.width !== 768 ||
    m.height !== 460 ||
    !Array.isArray(m.frames) ||
    m.frames.length !== 36 ||
    m.atlasWidth !== 768 ||
    !Number.isInteger(m.atlasHeight) ||
    m.atlasHeight < 32 ||
    !Number.isFinite(m.pixelBytes) ||
    (m.atlasWidth * m.atlasHeight + 768 * 460 * 7) * 4 > 64 * 1024 * 1024 ||
    m.pixelBytes > 64 * 1024 * 1024
  )
    throw new Error('Incompatible town assets')
  for (const frame of m.frames) {
    if(!Array.isArray(frame) || frame.length>360)throw new Error('Invalid patch count')
    for (const [x, y, w, h, id] of frame) {
      if (
        ![x, y, w, h, id].every(Number.isInteger) ||
        x < 0 ||
        y < 0 ||
        w < 1 ||
        h < 1 ||
        w > 32 ||
        h > 32 ||
        x + w > 768 ||
        y + h > 460 ||
        id < 0 ||
        Math.floor(id / 24) * 32 + h > m.atlasHeight
      )
        throw new Error('Invalid town patch')
    }
  }
}
export function createDegradationMonitor() {
  let start = 0,
    samples = [],
    slowWindows = 0,
    spikes = [],
    mode = 6
  return {
    get cadence() {
      return mode
    },
    observe(duration, now, attributableLate = null) {
      samples.push({ duration, attributableLate })
      spikes = spikes.filter((t) => now - t <= 10000)
      if (duration > 50) spikes.push(now)
      if (spikes.length >= 2) {
        mode = mode === 6 ? 3 : 0
        spikes = []
        slowWindows = 0
        samples = []
        start = now
        return mode
      }
      if (!start) start = now
      if (now - start < 10000) return mode
      const durations = samples.map((s) => s.duration).sort((a, b) => a - b)
      const hasAttribution = samples.every((s) => s.attributableLate !== null)
      const slow =
        samples.length >= 20 &&
        durations[Math.ceil(durations.length * 0.95) - 1] > 8 &&
        hasAttribution &&
        samples.filter((s) => s.attributableLate).length / samples.length > 0.05
      slowWindows = slow ? slowWindows + 1 : 0
      if (slowWindows >= 3) {
        mode = mode === 6 ? 3 : 0
        slowWindows = 0
      }
      samples = []
      start = now
      return mode
    }
  }
}
export function createPlayer({
  canvas,
  still,
  atlas,
  manifest,
  onSample = () => {}
}) {
  const c = canvas.getContext('2d', { alpha: false })
  if (!c) throw new Error('Canvas unavailable')
  canvas.width = 768
  canvas.height = 460
  c.imageSmoothingEnabled = false
  c.drawImage(still, 0, 0)
  let previous = [],
    timer = null,
    disposed = false,
    running = false,
    monitor = createDegradationMonitor(),
    epoch = performance.now()
  const draw = () => {
    timer = null
    if (disposed || !running) return
    const start = performance.now(),
      frame = Math.floor(((start - epoch) / 1000) * 6) % 36
    for (const [x, y, w, h] of previous)
      c.drawImage(still, x, y, w, h, x, y, w, h)
    previous = manifest.frames[frame]
    for (const [x, y, w, h, id] of previous)
      c.drawImage(
        atlas,
        (id % 24) * 32,
        Math.floor(id / 24) * 32,
        w,
        h,
        x,
        y,
        w,
        h
      )
    const duration = performance.now() - start
    // Callback work is attributable; paint lateness is not inferred from unrelated feed lag.
    const cadence = monitor.observe(duration, start)
    onSample({
      duration,
      frame,
      cadence,
      dirtyPixels: previous.reduce((n, p) => n + p[2] * p[3], 0)
    })
    if (cadence) timer = setTimeout(draw, 1000 / cadence)
  }
  return {
    start() {
      if (disposed || running) return
      running = true
      epoch = performance.now()
      timer = setTimeout(draw, 1000 / monitor.cadence)
    },
    stop() {
      running = false
      clearTimeout(timer)
      timer = null
    },
    retry() {
      monitor = createDegradationMonitor()
    },
    dispose() {
      this.stop()
      disposed = true
      previous = []
      canvas.width = canvas.height = 0
    },
    get pending() {
      return timer !== null
    }
  }
}
