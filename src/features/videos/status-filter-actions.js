const boundControls = new WeakSet()
const controlSelector = '[data-status-filter-action]'

export function bindStatusFilterActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Status filter actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.select !== 'function'
    || typeof actions.toggle !== 'function'
    || typeof actions.close !== 'function'
  ) {
    throw new TypeError(
      'Status filter actions require select, toggle, and close callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (boundControls.has(control)) return

    const actionName = control.dataset.statusFilterAction
    if (actionName === 'select-tab') {
      control.addEventListener('click', () => {
        actions.select(control.dataset.statusTab)
      })
    } else if (actionName === 'toggle') {
      control.addEventListener('click', () => {
        actions.toggle()
      })
    } else if (actionName === 'select-option') {
      control.addEventListener('change', () => {
        actions.select(control.dataset.status)
      })
    } else if (actionName === 'close') {
      control.addEventListener('click', () => {
        actions.close(true)
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
