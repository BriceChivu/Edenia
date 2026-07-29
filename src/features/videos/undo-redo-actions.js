const boundControls = new WeakSet()
const controlSelector = '[data-undo-redo-action]'

export function bindUndoRedoActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Undo and Redo actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.toggle !== 'function'
    || typeof actions.apply !== 'function'
    || typeof actions.close !== 'function'
    || typeof actions.scroll !== 'function'
    || typeof actions.stopScroll !== 'function'
  ) {
    throw new TypeError(
      'Undo and Redo actions require toggle, apply, close, scroll, and stopScroll callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (boundControls.has(control)) return

    const actionName = control.dataset.undoRedoAction
    if (actionName === 'toggle') {
      control.addEventListener('click', event => {
        actions.toggle(event, control.dataset.undoRedoDirection)
      })
    } else if (actionName === 'apply') {
      control.addEventListener('click', () => {
        actions.apply(
          control.dataset.undoRedoDirection,
          Number(control.dataset.undoRedoIndex)
        )
      })
    } else if (actionName === 'close') {
      control.addEventListener('click', () => {
        actions.close(null, true)
      })
    } else if (actionName === 'scroll') {
      control.addEventListener('mousemove', event => {
        actions.scroll(event)
      })
      control.addEventListener('mouseleave', () => {
        actions.stopScroll()
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
