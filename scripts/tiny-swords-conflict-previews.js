// Integration transport only. Godot validates, restores, frames and renders saves.
// These short-lived frames have no durable writer or active-profile adapter.
(() => {
  const release = new URL('.', document.currentScript.src)
  window.edeniaCreateConflictPreviews = ({ layouts, onImage }) => {
    const frame = document.createElement('iframe')
    const session = crypto.randomUUID()
    let disposed = false
    let idleTimer
    let greatestDownloaded = 0
    let engineInitialized = false
    let renderRequested = false
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    frame.title = 'Saved island preview renderer'
    Object.assign(frame.style, { position:'fixed', left:'-10000px', top:'0', width:'800px', height:'480px', border:'0', pointerEvents:'none' })
    const url = new URL('index.html', release)
    url.searchParams.set('conflict_preview', '1')
    frame.src = url.href
    const delivered = new Set()
    const dispose = () => {
      if (disposed) return
      disposed = true
      clearTimeout(idleTimer)
      clearTimeout(deadlineTimer)
      window.removeEventListener('message', receive)
      frame.remove()
    }
    const failPending = () => {
      for (let index = 0; index < 2; index += 1) {
        if (!delivered.has(index)) onImage(index, null)
      }
      dispose()
    }
    // Slow, advancing downloads should survive a minute. Stalled startup or
    // capture still expires, and no progress can retain this engine indefinitely.
    const renewInactivity = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(failPending, 60000)
    }
    const receive = event => {
      if (disposed || event.source !== frame.contentWindow || event.origin !== location.origin) return
      const data = event.data
      if (data?.type === 'edenia-game-loading-progress' && !renderRequested) {
        if (!Number.isFinite(data.current) || !Number.isFinite(data.total)
          || data.total <= 0 || data.current <= greatestDownloaded || data.current > data.total) return
        greatestDownloaded = data.current
        renewInactivity()
      } else if (data?.type === 'edenia-game-engine-initialized' && !engineInitialized) {
        engineInitialized = true
        renewInactivity()
      } else if (data?.type === 'edenia-conflict-preview-ready' && !renderRequested) {
        renderRequested = true
        renewInactivity()
        frame.contentWindow.postMessage({type:'edenia-conflict-preview-render',session,layouts},location.origin)
      } else if (data?.type === 'edenia-conflict-preview-image' && data.session === session && [0,1].includes(data.index) && !delivered.has(data.index)) {
        delivered.add(data.index)
        renewInactivity()
        const pixels = data.status === 'ready' && typeof data.pixels === 'string' && data.pixels.length <= 2_000_000 && /^[A-Za-z0-9+/=]+$/.test(data.pixels) ? `data:image/png;base64,${data.pixels}` : null
        onImage(data.index, pixels)
      } else if (data?.type === 'edenia-conflict-preview-done' && data.session === session) failPending()
      else if (data?.type === 'edenia-game-startup-failed') failPending()
    }
    const deadlineTimer = setTimeout(failPending, 180000)
    renewInactivity()
    window.addEventListener('message', receive)
    document.body.append(frame)
    return dispose
  }
})()
