const boundControls = new WeakSet()

export function bindSettingsResetConfirmActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Settings reset-confirm actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.show !== 'function'
    || typeof actions.hide !== 'function'
    || typeof actions.confirm !== 'function'
    || typeof actions.undo !== 'function'
  ) {
    throw new TypeError('Settings reset-confirm actions require show, hide, confirm, and undo callbacks')
  }

  const bindings = [
    ['[data-settings-reset-confirm-action="show"]', () => actions.show()],
    ['[data-settings-reset-confirm-action="hide"]', () => actions.hide()],
    ['[data-settings-reset-confirm-action="confirm"]', () => actions.confirm()],
    ['[data-settings-reset-confirm-action="undo"]', () => actions.undo()]
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
