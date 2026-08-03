const boundRoots = new WeakSet()
const selector = '[data-video-organization-action]'

export function bindVideoOrganizationActions(root, actions) {
  if (!root || typeof root.addEventListener !== 'function') {
    throw new TypeError('Video organization actions require an event target')
  }
  const required = [
    'openMenu',
    'removeFromContinueWatching',
    'removeFromFeed',
    'restoreToFeed',
    'toggleRemovedSection'
  ]
  if (!actions || required.some(name => typeof actions[name] !== 'function')) {
    throw new TypeError('Video organization actions require every organization callback')
  }
  if (boundRoots.has(root)) return 0

  root.addEventListener('click', event => {
    const control = event.target?.closest?.(selector)
    if (!control || !root.contains(control)) return
    event.preventDefault()
    event.stopPropagation()
    const videoId = control.dataset.videoId
    const actionName = control.dataset.videoOrganizationAction
    if (actionName === 'menu') actions.openMenu(event, videoId, control)
    else if (actionName === 'remove-continue') actions.removeFromContinueWatching(videoId)
    else if (actionName === 'remove-feed') actions.removeFromFeed(videoId)
    else if (actionName === 'restore-feed') actions.restoreToFeed(videoId)
    else if (actionName === 'toggle-removed') actions.toggleRemovedSection()
  })
  boundRoots.add(root)
  return 1
}
