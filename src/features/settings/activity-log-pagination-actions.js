const boundRoots = new WeakSet()

export function bindActivityLogPaginationActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError(
      'Activity Log pagination actions require a queryable root'
    )
  }
  if (!actions || typeof actions.showOlder !== 'function') {
    throw new TypeError(
      'Activity Log pagination actions require a showOlder callback'
    )
  }

  const list = root.querySelector('#activityLogList')
  if (!list || boundRoots.has(list)) return 0
  list.addEventListener('click', event => {
    const control = event.target?.closest?.(
      '[data-activity-log-action="show-older"]'
    )
    if (!control || !list.contains(control)) return
    actions.showOlder()
  })
  boundRoots.add(list)
  return 1
}
