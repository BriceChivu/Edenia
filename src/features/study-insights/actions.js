const boundControls = new WeakSet()

export function bindStudyInsightActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Study Insight actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.setView !== 'function'
    || typeof actions.setCollapsed !== 'function'
  ) {
    throw new TypeError('Study Insight actions require view and collapse callbacks')
  }

  const bindings = [
    ['#studyInsightCurrentTab', () => actions.setView('current')],
    ['#studyInsightPreviousTab', () => actions.setView('previous')],
    ['.study-insight-collapse', () => actions.setCollapsed(true)],
    ['#studyInsightReopen', () => actions.setCollapsed(false)]
  ]
  if (typeof actions.showNextStudy === 'function') {
    bindings.push([
      '#studyGuidanceNextAction',
      () => actions.showNextStudy()
    ])
  }

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
