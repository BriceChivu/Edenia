// PostHog's parent recorder sees the iframe DOM, but its canvas sampler does
// not capture the iframe's WebGL frames. Keep a small DOM-visible frame behind
// the opaque Godot canvas; replay can display it when the WebGL drawing is absent.
(function initializeTinySwordsReplay() {
  if (parent === window || window.edeniaConflictPreviewMode) return
  const canvas = document.getElementById('canvas')
  if (!canvas) return
  const snapshot = document.createElement('canvas')
  const context = snapshot.getContext('2d')
  if (!context) return
  // The fallback text is only useful in browsers without canvas support. rrweb
  // can render it over the captured frame when rebuilding this WebGL element.
  canvas.textContent = ''
  let previousFrame = ''
  const asyncEnabled = ['30', '60'].includes(new URLSearchParams(location.search).get('tiny_swords_fps'))
  let encodingMode = asyncEnabled ? 'async' : 'sync'
  let timer = null, due = false, busy = false, retired = false, generation = 0
  const allowed = () => !retired && !document.hidden && window.edeniaHostVisible !== false
    && canvas.isConnected && parent.EDENIA_ANALYTICS_ENABLED
    && parent.posthog?.sessionRecordingStarted?.() && canvas.width && canvas.height && window.edeniaGameLevel >= 1
  async function captureAsync() {
    if (busy || !allowed()) return
    busy = true
    const version = generation
    try {
      const scale = Math.min(1, 960 / canvas.width, 540 / canvas.height)
      snapshot.width = Math.max(1, Math.round(canvas.width * scale))
      snapshot.height = Math.max(1, Math.round(canvas.height * scale))
      const began = performance.now()
      context.drawImage(canvas, 0, 0, snapshot.width, snapshot.height)
      window.edeniaLagCapture?.probe('replay-copy', performance.now() - began)
      const blob = await new Promise(resolve => snapshot.toBlob(resolve, 'image/webp', 0.4))
      if (!blob || version !== generation || !allowed()) return
      const frame = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(Error('Replay image read failed'))
        reader.readAsDataURL(blob)
      })
      if (version !== generation || !allowed()) return
      if (frame !== previousFrame) {
        canvas.style.backgroundImage = `url("${frame}")`
        canvas.style.backgroundSize = '100% 100%'
        previousFrame = frame
      }
    } catch {
      // A failed encoder or retired drawing buffer must not affect play.
    } finally {
      busy = false
      if (!retired) schedule(allowed() ? 500 : 1000)
    }
  }
  if (asyncEnabled) window.edeniaReplayCaptureAfterFrame = () => {
    // Copy immediately after a real engine render, before WebGL clears its
    // drawing buffer. Encode one image at a time, never queue missed captures.
    if (encodingMode !== 'async' || !due || busy || !allowed()) return
    due = false
    void captureAsync()
  }
  if (asyncEnabled) window.edeniaReplayEncoding = {
    getMode: () => encodingMode,
    setMode(mode) {
      if (!['sync', 'async'].includes(mode)) return false
      encodingMode = mode; generation++; due = false; clearTimeout(timer)
      if (!busy) schedule(500)
      return true
    }
  }
  addEventListener('pagehide', () => { retired = true; generation++; due = false; clearTimeout(timer) })
  addEventListener('pageshow', event => { if (event.persisted) { retired = false; schedule(500) } })
  function schedule(delay) {
    if (retired) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (asyncEnabled && encodingMode === 'async') { due = true; if (!allowed()) schedule(1000) }
      else {
        const version = generation
        requestAnimationFrame(() => { if (version === generation) captureFrame() })
      }
    }, delay)
  }
  function captureFrame() {
    if (retired) return
    try {
      if (document.hidden || window.edeniaHostVisible === false || !canvas.isConnected
        || !parent.EDENIA_ANALYTICS_ENABLED || !parent.posthog?.sessionRecordingStarted?.()) {
        schedule(1000)
        return
      }
      if (!canvas.width || !canvas.height || !(window.edeniaGameLevel >= 1)) {
        schedule(1000)
        return
      }
      const scale = Math.min(1, 960 / canvas.width, 540 / canvas.height)
      const width = Math.max(1, Math.round(canvas.width * scale))
      const height = Math.max(1, Math.round(canvas.height * scale))
      if (snapshot.width !== width) snapshot.width = width
      if (snapshot.height !== height) snapshot.height = height
      context.drawImage(canvas, 0, 0, width, height)
      const frame = snapshot.toDataURL('image/webp', 0.4)
      if (frame !== previousFrame) {
        canvas.style.backgroundImage = `url("${frame}")`
        canvas.style.backgroundSize = '100% 100%'
        previousFrame = frame
      }
    } catch {
      // Replay must never interrupt gameplay, including a retired iframe or
      // browsers that cannot read the engine's drawing buffer.
    }
    schedule(500)
  }
  schedule(500)
})()
