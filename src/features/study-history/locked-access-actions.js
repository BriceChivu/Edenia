const boundRoots = new WeakSet()
const actionSelector = '[data-history-access-action="request"]'

export function bindStudyHistoryLockedAccessActions(root, actions) {
  if (!root?.addEventListener || typeof root.contains !== 'function') {
    throw new TypeError(
      'Study History locked access actions require an interactive root'
    )
  }
  if (!actions || typeof actions.requestAccess !== 'function') {
    throw new TypeError(
      'Study History locked access actions require a requestAccess callback'
    )
  }
  if (boundRoots.has(root)) return false

  root.addEventListener('click', event => {
    const control = event.target.closest?.(actionSelector)
    if (!control || !root.contains(control)) return
    actions.requestAccess(control.dataset.historyAccessState)
  })
  boundRoots.add(root)
  return true
}
