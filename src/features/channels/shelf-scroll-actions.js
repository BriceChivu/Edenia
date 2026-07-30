const boundControls = new WeakSet()
const controlSelector = '[data-channel-shelf-scroll-action]'

function getShelfDirection(control) {
  const direction = Number(control.dataset?.shelfDirection)
  return direction === -1 || direction === 1 ? direction : null
}

export function bindChannelShelfScrollActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError(
      'Channel shelf scroll actions require a queryable root'
    )
  }
  if (
    !actions
    || typeof actions.scroll !== 'function'
    || typeof actions.sync !== 'function'
  ) {
    throw new TypeError(
      'Channel shelf scroll actions require scroll and sync callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (!control || boundControls.has(control)) return

    const actionName = control.dataset?.channelShelfScrollAction
    if (actionName === 'scroll') {
      if (getShelfDirection(control) === null) return
      control.addEventListener('click', () => {
        const direction = getShelfDirection(control)
        if (direction === null) return
        actions.scroll(control, direction)
      })
    } else if (actionName === 'sync') {
      control.addEventListener('scroll', () => {
        actions.sync(control)
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
