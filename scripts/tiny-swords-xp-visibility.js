// Transport host facts only. Godot owns the suspension/resume policy.
function observeCanvasSize() {
  const canvas = document.getElementById('canvas')
  if (!canvas) return
  const publish = () => {
    window.edeniaCanvasWidth = Math.max(1, canvas.getBoundingClientRect().width)
    window.edeniaReceiveCanvasWidth?.(window.edeniaCanvasWidth)
  }
  new ResizeObserver(publish).observe(canvas)
  publish()
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeCanvasSize, { once: true })
else observeCanvasSize()

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent) return
  if (event.data?.type === 'edenia-camera' && window.edeniaReceiveCameraCommand) {
    window.edeniaCameraCommands.pop()
    window.edeniaReceiveCameraCommand(event.data.command)
  }
})

window.addEventListener('message', event => {
  const data = event.data
  if (event.origin !== location.origin || event.source !== parent
    || data?.type !== 'edenia-host-visibility'
    || data.session !== window.edeniaStudySession || typeof data.visible !== 'boolean') return
  window.edeniaHostVisible = data.visible
  window.edeniaReceiveHostVisibility?.(data.visible)
})
