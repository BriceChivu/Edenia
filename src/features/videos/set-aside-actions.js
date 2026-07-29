const boundControls = new WeakSet()
const controlSelector = '[data-video-set-aside-action]'

export function bindVideoSetAsideActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Video Set aside actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.request !== 'function'
    || typeof actions.cancel !== 'function'
    || typeof actions.confirm !== 'function'
    || typeof actions.handlePromptKeydown !== 'function'
  ) {
    throw new TypeError(
      'Video Set aside actions require request, cancel, confirm, and handlePromptKeydown callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (boundControls.has(control)) return

    const actionName = control.dataset.videoSetAsideAction
    if (actionName === 'request') {
      control.addEventListener('click', () => {
        actions.request(control.dataset.videoId, {
          surface: control.dataset.videoSetAsideSurface
        })
      })
    } else if (actionName === 'cancel') {
      control.addEventListener('click', () => {
        actions.cancel()
      })
    } else if (actionName === 'confirm') {
      control.addEventListener('click', () => {
        actions.confirm()
      })
    } else if (actionName === 'prompt') {
      control.addEventListener('keydown', event => {
        actions.handlePromptKeydown(event)
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
