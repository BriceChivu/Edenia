const boundControls = new WeakSet()

export function bindOnboardingStartOverActions(root, startOver) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Onboarding Start over actions require a queryable root')
  }
  if (typeof startOver !== 'function') {
    throw new TypeError('Onboarding Start over actions require a callback')
  }

  let installedCount = 0
  root.querySelectorAll(
    '[data-personalized-onboarding-action="start-over"]'
  ).forEach(control => {
    if (!control || boundControls.has(control)) return
    control.addEventListener('click', () => startOver())
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
