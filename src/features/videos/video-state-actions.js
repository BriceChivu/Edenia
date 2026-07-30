const boundControls = new WeakSet()
const controlSelector = '[data-video-state-action]'
const supportedActions = new Set([
  'clear-paused',
  'remove-watch-later',
  'remove-favorite',
  'toggle-watch-later',
  'toggle-favorite'
])

export function bindVideoStateActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Video state actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.clearPaused !== 'function'
    || typeof actions.mark !== 'function'
    || typeof actions.toggleFavorite !== 'function'
  ) {
    throw new TypeError(
      'Video state actions require clearPaused, mark, and toggleFavorite callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (
      boundControls.has(control)
      || !supportedActions.has(control.dataset.videoStateAction)
    ) return

    control.addEventListener('click', event => {
      const actionName = control.dataset.videoStateAction
      const videoId = control.dataset.videoId
      if (actionName === 'clear-paused') {
        event.preventDefault()
        event.stopPropagation()
        actions.clearPaused(videoId)
      } else if (actionName === 'remove-watch-later') {
        event.preventDefault()
        event.stopPropagation()
        actions.mark(videoId, 'unwatched', { watchLater: false })
      } else if (actionName === 'remove-favorite') {
        event.preventDefault()
        event.stopPropagation()
        actions.toggleFavorite(videoId, {
          surface: 'channel_shelf_badge'
        })
      } else if (actionName === 'toggle-watch-later') {
        actions.mark(videoId, control.dataset.status, {
          watchLater: control.dataset.watchLater === 'true'
        })
      } else if (actionName === 'toggle-favorite') {
        actions.toggleFavorite(videoId, { surface: 'video_card' })
      }
    })

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
