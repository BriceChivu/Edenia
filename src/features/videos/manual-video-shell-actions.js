const boundControls = new WeakSet()
const controlSelector = '[data-manual-video-action]'

export function bindManualVideoShellActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Manual video shell actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.toggle !== 'function'
    || typeof actions.close !== 'function'
    || typeof actions.renderSuggestions !== 'function'
    || typeof actions.handleInputKey !== 'function'
    || typeof actions.submit !== 'function'
  ) {
    throw new TypeError(
      'Manual video shell actions require toggle, close, renderSuggestions, handleInputKey, and submit callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (boundControls.has(control)) return

    const actionName = control.dataset.manualVideoAction
    if (actionName === 'toggle') {
      control.addEventListener('click', event => {
        actions.toggle(event)
      })
    } else if (actionName === 'close') {
      control.addEventListener('click', () => {
        actions.close(true)
      })
    } else if (actionName === 'query') {
      control.addEventListener('input', () => {
        actions.renderSuggestions()
      })
      control.addEventListener('keydown', event => {
        actions.handleInputKey(event)
      })
    } else if (actionName === 'submit') {
      control.addEventListener('submit', event => {
        actions.submit(event)
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
