const boundControls = new WeakSet()

export function bindSettingsSyncActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Settings sync actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.exportFile !== 'function'
    || typeof actions.importFile !== 'function'
  ) {
    throw new TypeError(
      'Settings sync actions require exportFile and importFile callbacks'
    )
  }

  let installedCount = 0
  const exportControl = root.querySelector(
    '[data-settings-sync-action="export"]'
  )
  if (exportControl && !boundControls.has(exportControl)) {
    exportControl.addEventListener('click', () => actions.exportFile())
    boundControls.add(exportControl)
    installedCount += 1
  }

  const input = root.querySelector(
    '#syncFileInput[data-settings-sync-action="import-file"]'
  )
  const importControl = root.querySelector(
    '[data-settings-sync-action="choose-file"]'
  )
  if (importControl && input && !boundControls.has(importControl)) {
    importControl.addEventListener('click', () => input.click())
    boundControls.add(importControl)
    installedCount += 1
  }

  if (input && !boundControls.has(input)) {
    input.addEventListener('change', () => actions.importFile(input))
    boundControls.add(input)
    installedCount += 1
  }

  return installedCount
}
