const boundControls = new WeakSet()
const controlSelector = '[data-intro-finish-action]'

export function bindIntroFinishActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Intro finish actions require a queryable root')
  }
  if (!actions || typeof actions.finish !== 'function') {
    throw new TypeError('Intro finish actions require a finish callback')
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (!control || boundControls.has(control)) return

    control.addEventListener('click', () => {
      actions.finish()
    })
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
