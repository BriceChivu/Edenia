// Integration transport only. Godot validates, restores, frames and renders saves.
// These short-lived frames have no durable writer or active-profile adapter.
(() => {
  const release = new URL('.', document.currentScript.src)
  window.edeniaCreateConflictPreviews = ({ layouts, onImage }) => {
    const frame = document.createElement('iframe')
    const session = crypto.randomUUID()
    let disposed = false
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
      clearTimeout(timer)
      window.removeEventListener('message', receive)
      frame.remove()
    }
    const failPending = () => {
      for (let index = 0; index < 2; index += 1) {
        if (!delivered.has(index)) onImage(index, null)
      }
      dispose()
    }
    const receive = event => {
      if (disposed || event.source !== frame.contentWindow || event.origin !== location.origin) return
      const data = event.data
      if (data?.type === 'edenia-conflict-preview-ready') {
        frame.contentWindow.postMessage({type:'edenia-conflict-preview-render',session,layouts},location.origin)
      } else if (data?.type === 'edenia-conflict-preview-image' && data.session === session && [0,1].includes(data.index) && !delivered.has(data.index)) {
        delivered.add(data.index)
        const pixels = data.status === 'ready' && typeof data.pixels === 'string' && data.pixels.length <= 2_000_000 && /^[A-Za-z0-9+/=]+$/.test(data.pixels) ? `data:image/png;base64,${data.pixels}` : null
        onImage(data.index, pixels)
      } else if (data?.type === 'edenia-conflict-preview-done' && data.session === session) failPending()
      else if (data?.type === 'edenia-game-startup-failed') failPending()
    }
    const timer = setTimeout(failPending, 60000)
    window.addEventListener('message', receive)
    document.body.append(frame)
    return dispose
  }
})()
