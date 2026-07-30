const boundControls = new WeakSet()

export function bindStudyHistoryPeriodToggleActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError(
      'Study History period toggle actions require a queryable root'
    )
  }
  if (!actions || typeof actions.toggle !== 'function') {
    throw new TypeError(
      'Study History period toggle actions require a toggle callback'
    )
  }

  const bindings = [
    [
      '[data-history-period-action="toggle"][data-history-range="week"]',
      'week'
    ],
    [
      '[data-history-period-action="toggle"][data-history-range="month"]',
      'month'
    ]
  ]

  let installedCount = 0
  bindings.forEach(([selector, range]) => {
    const control = root.querySelector(selector)
    if (!control || boundControls.has(control)) return
    control.addEventListener('click', event => {
      actions.toggle(event, range)
    })
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
