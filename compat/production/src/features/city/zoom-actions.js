const boundControls = new WeakSet()

export function bindCityZoomActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('City zoom actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.zoom !== 'function'
    || typeof actions.reset !== 'function'
  ) {
    throw new TypeError('City zoom actions require zoom and reset callbacks')
  }

  const bindings = [
    ['[data-city-zoom-action="out"]', () => actions.zoom(-1)],
    ['[data-city-zoom-action="reset"]', () => actions.reset()],
    ['[data-city-zoom-action="in"]', () => actions.zoom(1)]
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
