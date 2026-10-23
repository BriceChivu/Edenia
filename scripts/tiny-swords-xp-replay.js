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
  let timer = null, retired = false, generation = 0
  addEventListener('pagehide', () => { retired = true; generation++; clearTimeout(timer) })
  addEventListener('pageshow', event => { if (event.persisted) { retired = false; schedule(500) } })
  function schedule(delay) {
    if (retired) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      const version = generation
      requestAnimationFrame(() => { if (version === generation) captureFrame() })
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
