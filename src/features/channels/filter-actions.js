const boundControls = new WeakSet()
const controlSelector = '[data-channel-filter-action]'

export function bindChannelFilterActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Channel filter actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.setChannel !== 'function'
    || typeof actions.setAll !== 'function'
    || typeof actions.handleSelectAllClick !== 'function'
    || typeof actions.handleOptionClick !== 'function'
  ) {
    throw new TypeError(
      'Channel filter actions require setChannel, setAll, handleSelectAllClick, and handleOptionClick callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (!control || boundControls.has(control)) return

    const actionName = control.dataset?.channelFilterAction
    if (actionName === 'select-all-row') {
      control.addEventListener('click', event => {
        actions.handleSelectAllClick(event)
      })
    } else if (actionName === 'select-all') {
      control.addEventListener('change', () => {
        actions.setAll(control.checked)
      })
    } else if (actionName === 'option-row') {
      control.addEventListener('click', event => {
        actions.handleOptionClick(event, control.dataset.channelId)
      })
    } else if (actionName === 'select') {
      control.addEventListener('change', () => {
        actions.setChannel(control.dataset.channelId, control.checked)
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
