const boundControls = new WeakSet()

export function bindSettingsShellActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Settings shell actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.open !== 'function'
    || typeof actions.close !== 'function'
  ) {
    throw new TypeError('Settings shell actions require open and close callbacks')
  }

  const bindings = [
    ['.gear-btn[data-settings-shell-action="open"]', () => actions.open()],
    ['.settings-overlay[data-settings-shell-action="close"]', () => actions.close()],
    ['#settingsCloseBtn[data-settings-shell-action="close"]', () => actions.close()]
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
