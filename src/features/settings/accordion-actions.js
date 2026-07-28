const boundControls = new WeakSet()

export function bindSettingsAccordionActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Settings accordion actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.toggleHowTo !== 'function'
    || typeof actions.toggleActivityLog !== 'function'
    || typeof actions.toggleBackups !== 'function'
  ) {
    throw new TypeError('Settings accordion actions require all toggle callbacks')
  }

  const bindings = [
    ['.settings-howto-toggle', actions.toggleHowTo],
    ['.activity-log-toggle', actions.toggleActivityLog],
    ['.backup-toggle', actions.toggleBackups]
  ]

  let installedCount = 0
  bindings.forEach(([selector, listener]) => {
    const control = root.querySelector(selector)
    if (!control || boundControls.has(control)) return
    control.addEventListener('click', listener)
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
