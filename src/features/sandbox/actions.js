const boundControls = new WeakSet()

export function bindSandboxActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Sandbox actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.addDay !== 'function'
    || typeof actions.reset !== 'function'
  ) {
    throw new TypeError('Sandbox actions require addDay and reset callbacks')
  }

  const bindings = [
    ['[data-sandbox-action="add-day"]', () => actions.addDay()],
    ['[data-sandbox-action="reset"]', () => actions.reset()]
  ]

  let installedCount = 0
  bindings.forEach(([selector, listener]) => {
    const control = root.querySelector(selector)
    if (!control || boundControls.has(control)) return
    control.addEventListener('click', listener)
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
