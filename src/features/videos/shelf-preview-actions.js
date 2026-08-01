const boundControls = new WeakSet()
const controlSelector = '[data-video-preview-action]'

function isChannelShelfSettlingAfterDrop(control) {
  return Boolean(
    control
      ?.closest?.('.channel-shelf')
      ?.classList?.contains?.('just-dropped')
  )
}

export function bindVideoShelfPreviewActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Video shelf preview actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.thumbnail !== 'function'
    || typeof actions.toggleTouch !== 'function'
    || typeof actions.open !== 'function'
    || typeof actions.queueClose !== 'function'
    || typeof actions.openFromFocus !== 'function'
    || typeof actions.closeAfterFocus !== 'function'
  ) {
    throw new TypeError(
      'Video shelf preview actions require thumbnail, toggleTouch, open, queueClose, openFromFocus, and closeAfterFocus callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (boundControls.has(control)) return
    const actionName = control.dataset.videoPreviewAction

    if (actionName === 'thumbnail') {
      control.addEventListener('click', event => {
        actions.thumbnail(event, control)
      })
    } else if (actionName === 'card') {
      control.addEventListener('click', event => {
        actions.toggleTouch(event, control)
      })
      control.addEventListener('mouseenter', event => {
        if (isChannelShelfSettlingAfterDrop(control)) return
        actions.open(control, false, event)
      })
      control.addEventListener('mouseleave', () => {
        actions.queueClose(control)
      })
      control.addEventListener('focusin', () => {
        actions.openFromFocus(control)
      })
      control.addEventListener('focusout', () => {
        actions.closeAfterFocus(control)
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
