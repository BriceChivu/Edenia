// Script/engine download failures may happen before Godot can announce readiness.
window.addEventListener('error', event => {
  if (event.target?.tagName === 'SCRIPT') {
    parent.postMessage({ type: 'edenia-game-startup-failed' }, location.origin)
  }
}, true)
// Engine fetch failures can reject before the export shell's handled failure hook.
window.addEventListener('unhandledrejection', () => {
  if (window.edeniaSaveId === 0) {
    parent.postMessage({ type: 'edenia-game-startup-failed' }, location.origin)
  }
})
// The disposable export's transport only; Godot decides when an unlock succeeds.
// Godot probes PWA registration even in non-PWA builds. A detached iframe can
// reject that optional lookup during profile replacement or game disable.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  const getRegistration = navigator.serviceWorker.getRegistration.bind(navigator.serviceWorker)
  navigator.serviceWorker.getRegistration = (...args) => getRegistration(...args).catch(error => {
    if (error.name === 'InvalidStateError') return undefined
    throw error
  })
}
window.edeniaCameraCommands = []
document.addEventListener('wheel', event => {
  event.preventDefault()
  event.stopImmediatePropagation()
  const canvas = document.getElementById('canvas')
  const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.getBoundingClientRect().height : 1
  parent.postMessage({ type: 'edenia-page-scroll', x: event.deltaX * scale, y: event.deltaY * scale }, location.origin)
}, { passive: false, capture: true })
window.edeniaStudySession = null
window.edeniaStudyLevel = 1
window.edeniaSaveId = 0
window.edeniaSaveInFlight = null
window.edeniaPendingLayout = null
window.edeniaQueueLayout = layout => {
  window.edeniaPendingLayout = layout
  if (window.edeniaSaveInFlight !== null) return
  const next = window.edeniaPendingLayout
  window.edeniaPendingLayout = null
  const id = ++window.edeniaSaveId
  window.edeniaSaveInFlight = { id, level: next.level }
  parent.postMessage({ type: 'edenia-tiny-layout', session: window.edeniaStudySession, id, layout: next }, location.origin)
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent) return
  const data = event.data
  if (data?.type === 'edenia-camera') window.edeniaCameraCommands.push(data.command)
  if (data?.type === 'edenia-study-level') {
    window.edeniaStudySession = data.session
    window.edeniaStudyLevel = Math.max(1, Number(data.level) || 1)
    window.edeniaStudyLayout = data.layout
    window.edeniaStudyReady = true
  }
  if (data?.type !== 'edenia-tiny-saved' || data.session !== window.edeniaStudySession
    || data.id !== window.edeniaSaveInFlight?.id) return
  const level = window.edeniaSaveInFlight.level
  window.edeniaLastSavePersisted = data.persisted === true
  window.edeniaSaveInFlight = null
  window.edeniaReceiveLayoutSaved?.(level, window.edeniaLastSavePersisted)
  if (window.edeniaPendingLayout !== null) window.edeniaQueueLayout(window.edeniaPendingLayout)
})
parent.postMessage({ type: 'edenia-tiny-ready' }, location.origin)
