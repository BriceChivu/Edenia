const boundControls = new WeakSet()

export function bindLearnerProfileAccessActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Learner profile access actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.continueReplacement !== 'function'
    || typeof actions.discardReplacement !== 'function'
    || typeof actions.exportReplacement !== 'function'
    || typeof actions.retry !== 'function'
    || typeof actions.signOut !== 'function'
  ) {
    throw new TypeError(
      'Learner profile access actions require replacement, retry, and sign-out callbacks'
    )
  }

  let installedCount = 0
  const controls = [
    ['continue-replacement', actions.continueReplacement],
    ['export-replacement', actions.exportReplacement],
    ['discard-replacement', actions.discardReplacement],
    ['retry', actions.retry],
    ['sign-out', actions.signOut]
  ]
  for (const [name, callback] of controls) {
    const control = root.querySelector(
      `[data-profile-access-action="${name}"]`
    )
    if (!control || boundControls.has(control)) continue
    control.addEventListener('click', () => callback())
    boundControls.add(control)
    installedCount += 1
  }

  return installedCount
}
