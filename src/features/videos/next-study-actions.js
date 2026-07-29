const boundControls = new WeakSet()
const controlSelector = '[data-next-study-action]'

export function bindNextStudyActions(root, actions) {
  if (root && typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Next Study actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.open !== 'function'
    || typeof actions.focus !== 'function'
    || typeof actions.toggleFavorite !== 'function'
  ) {
    throw new TypeError(
      'Next Study actions require open, focus, and toggleFavorite callbacks'
    )
  }
  if (!root) return 0

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (!control || boundControls.has(control)) return

    const actionName = control.dataset?.nextStudyAction
    if (actionName === 'open') {
      control.addEventListener('click', event => {
        actions.open(event, control.dataset.videoId)
      })
    } else if (actionName === 'focus') {
      control.addEventListener('click', event => {
        actions.focus(event, control.dataset.videoId)
      })
    } else if (actionName === 'toggle-favorite') {
      control.addEventListener('click', () => {
        actions.toggleFavorite(control.dataset.videoId, {
          surface: control.dataset.nextStudySurface
        })
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
