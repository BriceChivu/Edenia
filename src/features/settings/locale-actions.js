const boundTriggers = new WeakSet()
const boundMenus = new WeakSet()
const localeOptionSelector = '[data-settings-locale-action="select"]'

export function bindSettingsLocaleActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Settings locale actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.toggle !== 'function'
    || typeof actions.select !== 'function'
  ) {
    throw new TypeError(
      'Settings locale actions require toggle and select callbacks'
    )
  }

  let installedCount = 0
  const trigger = root.querySelector(
    '#settingsLocaleBtn[data-settings-locale-action="toggle"]'
  )
  if (trigger && !boundTriggers.has(trigger)) {
    trigger.addEventListener('click', event => actions.toggle(event))
    boundTriggers.add(trigger)
    installedCount += 1
  }

  const menu = root.querySelector('#settingsLocaleMenu')
  if (menu && !boundMenus.has(menu)) {
    menu.addEventListener('change', event => {
      const control = event.target?.closest?.(localeOptionSelector)
      if (!control || !menu.contains(control)) return
      actions.select(control.value)
    })
    boundMenus.add(menu)
    installedCount += 1
  }

  return installedCount
}
