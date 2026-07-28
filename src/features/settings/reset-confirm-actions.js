const boundControls = new WeakSet()

export function bindSettingsResetConfirmActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Settings reset-confirm actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.show !== 'function'
    || typeof actions.hide !== 'function'
  ) {
    throw new TypeError('Settings reset-confirm actions require show and hide callbacks')
  }

  const bindings = [
    ['[data-settings-reset-confirm-action="show"]', () => actions.show()],
    ['[data-settings-reset-confirm-action="hide"]', () => actions.hide()]
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
