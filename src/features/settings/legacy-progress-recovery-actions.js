const boundControls = new WeakSet()

export function bindLegacyProgressRecoveryActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Legacy progress recovery requires a queryable root')
  }
  if (!actions || typeof actions.recover !== 'function') {
    throw new TypeError('Legacy progress recovery requires a recover callback')
  }
  let installedCount = 0
  root.querySelectorAll(
    '[data-settings-legacy-progress-recovery-action="recover"]'
  ).forEach(control => {
    if (boundControls.has(control)) return
    control.addEventListener('click', () => actions.recover())
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
