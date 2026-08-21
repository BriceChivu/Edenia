const boundControls = new WeakSet()

export function bindLearnerProfileSyncActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Learner profile sync actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.retry !== 'function'
    || typeof actions.exportRecovery !== 'function'
  ) {
    throw new TypeError(
      'Learner profile sync actions require retry and export callbacks'
    )
  }

  let installedCount = 0
  const controls = [
    ['retry', actions.retry],
    ['export-recovery', actions.exportRecovery]
  ]
  for (const [name, callback] of controls) {
    const control = root.querySelector(
      `[data-profile-sync-action="${name}"]`
    )
    if (!control || boundControls.has(control)) continue
    control.addEventListener('click', () => callback())
    boundControls.add(control)
    installedCount += 1
  }

  return installedCount
}
