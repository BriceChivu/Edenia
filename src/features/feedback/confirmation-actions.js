const boundControls = new WeakSet()

export function bindFeedbackConfirmationActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Feedback confirmation actions require a queryable root')
  }
  if (!actions || typeof actions.close !== 'function') {
    throw new TypeError('Feedback confirmation actions require a close callback')
  }

  const control = root.querySelector('[data-feedback-confirmation-action="close"]')
  if (!control || boundControls.has(control)) return 0
  control.addEventListener('click', () => actions.close())
  boundControls.add(control)
  return 1
}
