const boundCells = new WeakSet()
const cellSelector = '[data-history-points-popover-action="toggle"]'

export function bindStudyHistoryPointsPopoverActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError(
      'Study History points popover actions require a queryable root'
    )
  }
  if (
    !actions
    || typeof actions.open !== 'function'
    || typeof actions.closeSoon !== 'function'
    || typeof actions.toggle !== 'function'
  ) {
    throw new TypeError(
      'Study History points popover actions require open, closeSoon, and toggle callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(cellSelector).forEach(cell => {
    if (boundCells.has(cell)) return
    cell.addEventListener('mouseenter', event => {
      actions.open(event)
    })
    cell.addEventListener('mouseleave', () => {
      actions.closeSoon()
    })
    cell.addEventListener('focusin', event => {
      actions.open(event)
    })
    cell.addEventListener('focusout', () => {
      actions.closeSoon()
    })
    cell.addEventListener('click', event => {
      actions.toggle(event)
    })
    boundCells.add(cell)
    installedCount += 1
  })
  return installedCount
}
