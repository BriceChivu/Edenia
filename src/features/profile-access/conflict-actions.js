const boundControls = new WeakSet()

export function bindLearnerProfileConflictActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Learner profile conflict actions require a root')
  }
  if (
    !actions
    || typeof actions.cancelChoice !== 'function'
    || typeof actions.confirmChoice !== 'function'
    || typeof actions.exportBoth !== 'function'
    || typeof actions.exportVersion !== 'function'
    || typeof actions.requestChoice !== 'function'
  ) {
    throw new TypeError('Learner profile conflict callbacks are required')
  }
  const callbacks = {
    'cancel-choice': () => actions.cancelChoice(),
    'choose-cloud': () => actions.requestChoice('cloud'),
    'choose-device': () => actions.requestChoice('device'),
    'confirm-choice': control => actions.confirmChoice(
      control.dataset.conflictSide
    ),
    'export-both': () => actions.exportBoth(),
    'export-cloud': () => actions.exportVersion('cloud'),
    'export-device': () => actions.exportVersion('device')
  }
  let installed = 0
  for (const [name, callback] of Object.entries(callbacks)) {
    const control = root.querySelector(
      `[data-profile-conflict-action="${name}"]`
    )
    if (!control || boundControls.has(control)) continue
    control.addEventListener('click', event => callback(event.currentTarget))
    boundControls.add(control)
    installed += 1
  }
  const exportList = root.querySelector('[data-profile-conflict-export-list]')
  if (exportList && !boundControls.has(exportList)) {
    exportList.addEventListener('click', event => {
      const control = event.target?.closest?.(
        '[data-profile-conflict-action="export-protected"]'
      )
      if (!control || !exportList.contains(control)) return
      actions.exportVersion(
        control.dataset.conflictSide,
        control.dataset.conflictId
      )
    })
    boundControls.add(exportList)
    installed += 1
  }
  return installed
}
