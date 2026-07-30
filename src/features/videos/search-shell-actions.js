const boundControls = new WeakSet()
const controlSelector = '[data-video-search-action]'

export function bindVideoSearchShellActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Video search shell actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.toggle !== 'function'
    || typeof actions.close !== 'function'
    || typeof actions.renderResults !== 'function'
    || typeof actions.handleInputKey !== 'function'
  ) {
    throw new TypeError(
      'Video search shell actions require toggle, close, renderResults, and handleInputKey callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (boundControls.has(control)) return

    const actionName = control.dataset.videoSearchAction
    if (actionName === 'toggle') {
      control.addEventListener('click', event => {
        actions.toggle(event)
      })
    } else if (actionName === 'close') {
      control.addEventListener('click', () => {
        actions.close(true)
      })
    } else if (actionName === 'query') {
      control.addEventListener('input', event => {
        actions.renderResults(event.currentTarget.value)
      })
      control.addEventListener('keydown', event => {
        actions.handleInputKey(event)
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
