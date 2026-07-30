const boundControls = new WeakSet()
const controlSelector = '[data-video-watch-prompt-action]'

export function bindVideoWatchPromptActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Video watch prompt actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.favorite !== 'function'
    || typeof actions.confirm !== 'function'
    || typeof actions.dismiss !== 'function'
  ) {
    throw new TypeError(
      'Video watch prompt actions require favorite, confirm, and dismiss callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (boundControls.has(control)) return

    const actionName = control.dataset.videoWatchPromptAction
    if (actionName === 'favorite') {
      control.addEventListener('click', event => {
        actions.favorite(event, control.dataset.videoId)
      })
    } else if (actionName === 'confirm') {
      control.addEventListener('click', event => {
        actions.confirm(
          event,
          control.dataset.videoId,
          control.dataset.rewatch === 'true',
          control.dataset.playerPrompt === 'true'
        )
      })
    } else if (actionName === 'dismiss') {
      control.addEventListener('click', event => {
        actions.dismiss(
          event,
          control.dataset.videoId,
          control.dataset.playerPrompt === 'true'
        )
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
