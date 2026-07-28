const boundControls = new WeakSet()

export function bindFeedbackModalActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Feedback modal actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.open !== 'function'
    || typeof actions.close !== 'function'
  ) {
    throw new TypeError('Feedback modal actions require open and close callbacks')
  }

  const bindings = [
    ['.feedback-launch-btn[data-feedback-modal-action="open"]', () => actions.open()],
    ['.feedback-backdrop[data-feedback-modal-action="close"]', () => actions.close()],
    ['.feedback-close-btn[data-feedback-modal-action="close"]', () => actions.close()]
  ]

  let installedCount = 0
  bindings.forEach(([selector, listener]) => {
    const control = root.querySelector(selector)
    if (!control || boundControls.has(control)) return
    control.addEventListener('click', listener)
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
