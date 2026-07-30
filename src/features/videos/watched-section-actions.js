const boundControls = new WeakSet()

export function bindWatchedSectionActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Watched-section actions require a queryable root')
  }
  if (!actions || typeof actions.toggle !== 'function') {
    throw new TypeError('Watched-section actions require a toggle callback')
  }

  const control = root.querySelector(
    '#watchedSectionToggle[data-watched-section-action="toggle"]'
  )
  if (!control || boundControls.has(control)) return 0
  control.addEventListener('click', () => actions.toggle())
  boundControls.add(control)
  return 1
}
