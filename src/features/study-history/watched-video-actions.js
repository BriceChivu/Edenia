const boundControls = new WeakSet()
const controlSelector = '[data-history-watched-video-action="jump"]'

export function bindStudyHistoryWatchedVideoActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError(
      'Study History watched video actions require a queryable root'
    )
  }
  if (!actions || typeof actions.jump !== 'function') {
    throw new TypeError(
      'Study History watched video actions require a jump callback'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (boundControls.has(control)) return
    control.addEventListener('click', event => {
      actions.jump(event, control.dataset.videoId)
    })
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
