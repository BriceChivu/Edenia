const boundForms = new WeakSet()

export function bindFeedbackSubmissionActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Feedback submission actions require a queryable root')
  }
  if (!actions || typeof actions.submit !== 'function') {
    throw new TypeError(
      'Feedback submission actions require a submit callback'
    )
  }

  const form = root.querySelector(
    '#feedbackForm[data-feedback-submission-action="submit"]'
  )
  if (!form || boundForms.has(form)) return 0
  form.addEventListener('submit', event => actions.submit(event))
  boundForms.add(form)
  return 1
}
