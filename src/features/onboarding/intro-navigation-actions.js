const boundControls = new WeakSet()
const controlSelector = '[data-intro-navigation-direction]'

export function bindIntroNavigationActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Intro navigation actions require a queryable root')
  }
  if (!actions || typeof actions.navigate !== 'function') {
    throw new TypeError('Intro navigation actions require a navigate callback')
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (!control || boundControls.has(control)) return

    const directionValue = control.dataset?.introNavigationDirection
    if (directionValue !== '-1' && directionValue !== '1') return
    const direction = Number(directionValue)

    control.addEventListener('click', () => {
      actions.navigate(direction)
    })
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
