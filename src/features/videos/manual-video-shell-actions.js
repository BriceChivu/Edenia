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
    || typeof actions.searchYoutube !== 'function'
    || typeof actions.selectCurated !== 'function'
    || typeof actions.selectYoutube !== 'function'
  ) {
    throw new TypeError(
      'Manual video shell actions require toggle, close, renderSuggestions, handleInputKey, submit, searchYoutube, selectCurated, and selectYoutube callbacks'
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
    } else if (actionName === 'search-youtube') {
      control.addEventListener('click', event => {
        actions.searchYoutube(event)
      })
    } else if (actionName === 'select-curated') {
      control.addEventListener('click', event => {
        actions.selectCurated(event, control.dataset.catalogId)
      })
    } else if (actionName === 'select-youtube') {
      control.addEventListener('click', event => {
        actions.selectYoutube(event, control.dataset.channelId)
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
