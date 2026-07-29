const boundControls = new WeakSet()
const controlSelector = '[data-channel-order-action]'

export function bindChannelOrderActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Channel order actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.start !== 'function'
    || typeof actions.finish !== 'function'
    || typeof actions.move !== 'function'
    || typeof actions.leave !== 'function'
    || typeof actions.drop !== 'function'
    || typeof actions.startTouch !== 'function'
  ) {
    throw new TypeError(
      'Channel order actions require start, finish, move, leave, drop, and startTouch callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (boundControls.has(control)) return
    const actionName = control.dataset.channelOrderAction

    if (actionName === 'shelf') {
      control.addEventListener('dragstart', event => {
        actions.start(event, control)
      })
      control.addEventListener('dragend', () => {
        actions.finish()
      })
      control.addEventListener('dragover', event => {
        actions.move(event, control)
      })
      control.addEventListener('dragleave', event => {
        actions.leave(event, control)
      })
      control.addEventListener('drop', event => {
        actions.drop(event, control)
      })
    } else if (actionName === 'touch-handle') {
      control.addEventListener('pointerdown', event => {
        actions.startTouch(event, control)
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
