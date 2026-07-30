const boundControls = new WeakSet()

export function bindSettingsBackupRestoreActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Settings backup Restore actions require a queryable root')
  }
  if (!actions || typeof actions.restore !== 'function') {
    throw new TypeError('Settings backup Restore actions require a restore callback')
  }

  let installedCount = 0
  root.querySelectorAll('[data-settings-backup-action="restore"]').forEach(
    control => {
      if (boundControls.has(control)) return
      control.addEventListener('click', () => {
        actions.restore(control.dataset.backupId)
      })
      boundControls.add(control)
      installedCount += 1
    }
  )
  return installedCount
}
