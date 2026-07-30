const boundPopovers = new WeakSet()
const optionSelector = '[data-history-period-action="select"]'

export function bindStudyHistoryPeriodOptionActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Study History period actions require a queryable root')
  }
  if (!actions || typeof actions.selectPeriod !== 'function') {
    throw new TypeError(
      'Study History period actions require a selectPeriod callback'
    )
  }

  let installedCount = 0
  ;['#historyWeekPeriodPopover', '#historyMonthPeriodPopover'].forEach(
    selector => {
      const popover = root.querySelector(selector)
      if (!popover || boundPopovers.has(popover)) return
      popover.addEventListener('click', event => {
        const control = event.target.closest?.(optionSelector)
        if (!control || !popover.contains(control)) return
        const range = control.dataset.historyRange
        const periodKey = control.dataset.historyPeriodKey
        actions.selectPeriod(range, periodKey)
      })
      boundPopovers.add(popover)
      installedCount += 1
    }
  )
  return installedCount
}
