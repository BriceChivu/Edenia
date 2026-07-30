const boundControls = new WeakSet()

export function bindActivityLogFilterActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Activity Log filter actions require a queryable root')
  }
  if (!actions || typeof actions.setFilter !== 'function') {
    throw new TypeError('Activity Log filter actions require a setFilter callback')
  }

  let installedCount = 0
  root.querySelectorAll('[data-activity-log-filter]').forEach(control => {
    if (boundControls.has(control)) return
    control.addEventListener('click', () => {
      actions.setFilter(control.dataset.activityLogFilter)
    })
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
