const boundControls = new WeakSet()
const controlSelector = '[data-channel-remove-action="remove"]'

export function bindChannelRemoveActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Channel remove actions require a queryable root')
  }
  if (!actions || typeof actions.remove !== 'function') {
    throw new TypeError('Channel remove actions require a remove callback')
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (
      !control
      || boundControls.has(control)
      || control.dataset?.channelRemoveAction !== 'remove'
    ) {
      return
    }

    control.addEventListener('click', event => {
      actions.remove(event, control.dataset.channelId)
    })
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
