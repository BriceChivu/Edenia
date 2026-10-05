// Transport host facts only. Godot owns the suspension/resume policy.
window.addEventListener('message', event => {
  const data = event.data
  if (event.origin !== location.origin || event.source !== parent
    || data?.type !== 'edenia-host-visibility'
    || data.session !== window.edeniaStudySession || typeof data.visible !== 'boolean') return
  window.edeniaHostVisible = data.visible
  window.edeniaReceiveHostVisibility?.(data.visible)
})
