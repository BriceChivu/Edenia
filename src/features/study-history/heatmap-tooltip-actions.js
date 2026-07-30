const boundDays = new WeakSet()
const daySelector = '[data-history-heatmap-action="tooltip"]'

export function bindStudyHistoryHeatmapTooltipActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError(
      'Study History heatmap tooltip actions require a queryable root'
    )
  }
  if (
    !actions
    || typeof actions.show !== 'function'
    || typeof actions.position !== 'function'
    || typeof actions.hide !== 'function'
    || typeof actions.toggle !== 'function'
  ) {
    throw new TypeError(
      'Study History heatmap tooltip actions require show, position, hide, and toggle callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(daySelector).forEach(day => {
    if (boundDays.has(day)) return
    day.addEventListener('mouseenter', event => {
      actions.show(event)
    })
    day.addEventListener('mousemove', event => {
      actions.position(event.currentTarget)
    })
    day.addEventListener('mouseleave', () => {
      actions.hide()
    })
    day.addEventListener('click', event => {
      actions.toggle(event)
    })
    day.addEventListener('focus', event => {
      actions.show(event)
    })
    day.addEventListener('blur', () => {
      actions.hide()
    })
    boundDays.add(day)
    installedCount += 1
  })
  return installedCount
}
