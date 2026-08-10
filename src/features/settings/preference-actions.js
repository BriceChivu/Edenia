const boundControls = new WeakSet()
const preferenceSelectors = [
  '#settingsAnkiEnabled[data-settings-preference-action="save"]'
]

export function bindSettingsPreferenceActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Settings preference actions require a queryable root')
  }
  if (!actions || typeof actions.save !== 'function') {
    throw new TypeError(
      'Settings preference actions require a save callback'
    )
  }

  let installedCount = 0
  preferenceSelectors.forEach(selector => {
    const control = root.querySelector(selector)
    if (!control || boundControls.has(control)) return
    control.addEventListener('change', () => actions.save())
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
