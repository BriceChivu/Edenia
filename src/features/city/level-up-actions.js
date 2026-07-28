const boundControls = new WeakSet()

export function bindCityLevelUpActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('City level-up actions require a queryable root')
  }
  if (!actions || typeof actions.claim !== 'function') {
    throw new TypeError('City level-up actions require a claim callback')
  }

  const control = root.querySelector(
    '#levelUpButton[data-city-level-action="claim"]'
  )
  if (!control || boundControls.has(control)) return 0
  control.addEventListener('click', () => actions.claim())
  boundControls.add(control)
  return 1
}
