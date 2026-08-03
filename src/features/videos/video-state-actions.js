const boundControls = new WeakSet()
const controlSelector = '[data-video-state-action]'
const supportedActions = new Set([
  'toggle-watch-later',
  'toggle-favorite'
])

export function bindVideoStateActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Video state actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.mark !== 'function'
    || typeof actions.toggleFavorite !== 'function'
  ) {
    throw new TypeError(
      'Video state actions require mark and toggleFavorite callbacks'
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
      if (actionName === 'toggle-watch-later') {
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
