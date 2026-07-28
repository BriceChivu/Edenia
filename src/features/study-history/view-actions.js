const boundControls = new WeakSet()

export function bindStudyHistoryViewActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Study History view actions require a queryable root')
  }
  if (!actions || typeof actions.setView !== 'function') {
    throw new TypeError('Study History view actions require a setView callback')
  }

  const bindings = [
    ['[data-history-view="summary"]', () => actions.setView('summary')],
    ['[data-history-view="heatmap"]', () => actions.setView('heatmap')]
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
