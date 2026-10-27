// Script/engine download failures may happen before Godot can announce readiness.
window.edeniaConflictPreviewMode = new URL(location.href).searchParams.get('conflict_preview') === '1'
window.addEventListener('message', event => {
  if (!window.edeniaConflictPreviewMode || event.origin !== location.origin || event.source !== parent) return
  if (event.data?.type !== 'edenia-conflict-preview-render' || !Array.isArray(event.data.layouts) || event.data.layouts.length !== 2) return
  window.edeniaConflictPreviewSession = event.data.session
  window.edeniaConflictLayouts = event.data.layouts
})
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
window.edeniaLocale = 'en'
window.edeniaSaveId = 0
window.edeniaSaveInFlight = null
window.edeniaPendingLayout = null
window.edeniaPendingCheckpoint = null
window.edeniaPendingCheckpointRequests = []
window.edeniaCheckpointUnavailable = requestId => parent.postMessage({
  type: 'edenia-checkpoint-flushed', session: window.edeniaStudySession, requestId, persisted: false
}, location.origin)
window.edeniaQueueLayout = (layout, checkpoint = false, requestId = null) => {
  if (window.edeniaConflictPreviewMode) return
  // The newest snapshot includes earlier queued edits. Ambient movement must
  // not downgrade a learner edit that still needs its cloud save.
  window.edeniaPendingCheckpoint = checkpoint === true && window.edeniaPendingCheckpoint !== false
  window.edeniaPendingLayout = layout
  if (Number.isSafeInteger(requestId) && requestId > 0
    && !window.edeniaPendingCheckpointRequests.includes(requestId)) window.edeniaPendingCheckpointRequests.push(requestId)
  if (window.edeniaSaveInFlight !== null) return
  const next = window.edeniaPendingLayout
  const nextCheckpoint = window.edeniaPendingCheckpoint
  const requests = window.edeniaPendingCheckpointRequests
  window.edeniaPendingLayout = null
  window.edeniaPendingCheckpoint = null
  window.edeniaPendingCheckpointRequests = []
  const id = ++window.edeniaSaveId
  window.edeniaSaveInFlight = { id, level: next.level, checkpoint: nextCheckpoint, requests }
  parent.postMessage({ type: 'edenia-tiny-layout', session: window.edeniaStudySession, id, layout: next, checkpoint: nextCheckpoint }, location.origin)
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent) return
  const data = event.data
  if (data?.type === 'edenia-locale' && (window.edeniaStudySession === null || data.session === window.edeniaStudySession)) {
    window.edeniaLocale = ['en', 'zh-Hant', 'zh-Hans', 'es', 'fr'].includes(data.locale) ? data.locale : 'en'
    window.edeniaReceiveLocale?.(window.edeniaLocale)
  }
  if (data?.type === 'edenia-camera') window.edeniaCameraCommands.push(data.command)
  if (data?.type === 'edenia-study-level') {
    window.edeniaStudySession = data.session
    window.edeniaStudyLevel = Math.max(1, Number(data.level) || 1)
    window.edeniaStudyLayout = data.layout
    window.edeniaStudyReady = true
  }
  if (data?.type === 'edenia-checkpoint-request' && data.session === window.edeniaStudySession
    && Number.isSafeInteger(data.requestId) && data.requestId > 0) {
    if (window.edeniaReceiveCheckpointRequest) window.edeniaReceiveCheckpointRequest(data.requestId)
    else window.edeniaCheckpointUnavailable(data.requestId)
  }
  if (data?.type !== 'edenia-tiny-saved' || data.session !== window.edeniaStudySession
    || data.id !== window.edeniaSaveInFlight?.id) return
  const { level, checkpoint, requests } = window.edeniaSaveInFlight
  window.edeniaLastSavePersisted = data.persisted === true
  window.edeniaSaveInFlight = null
  window.edeniaReceiveLayoutSaved?.(level, window.edeniaLastSavePersisted, checkpoint)
  for (const requestId of requests) parent.postMessage({ type: 'edenia-checkpoint-flushed',
    session: window.edeniaStudySession, requestId, persisted: window.edeniaLastSavePersisted }, location.origin)
  if (window.edeniaPendingLayout !== null) window.edeniaQueueLayout(window.edeniaPendingLayout, window.edeniaPendingCheckpoint)
})
parent.postMessage({ type: 'edenia-tiny-ready' }, location.origin)
