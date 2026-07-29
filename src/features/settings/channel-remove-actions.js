const boundControls = new WeakSet()
const controlSelector = '[data-settings-channel-action="remove"]'

export function bindSettingsChannelRemoveActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError(
      'Settings channel remove actions require a queryable root'
    )
  }
  if (!actions || typeof actions.remove !== 'function') {
    throw new TypeError(
      'Settings channel remove actions require a remove callback'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (boundControls.has(control)) return
    control.addEventListener('click', () => {
      actions.remove(control.dataset.channelId)
    })
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
