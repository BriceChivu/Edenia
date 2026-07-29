const boundControls = new WeakSet()
const controlSelector = '[data-personalized-onboarding-action]'

export function bindPersonalizedOnboardingActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError(
      'Personalized onboarding actions require a queryable root'
    )
  }
  if (
    !actions
    || typeof actions.selectLanguage !== 'function'
    || typeof actions.continueFromLanguage !== 'function'
  ) {
    throw new TypeError(
      'Personalized onboarding actions require selectLanguage and continueFromLanguage callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (!control || boundControls.has(control)) return

    const actionName = control.dataset?.personalizedOnboardingAction
    if (actionName === 'select-language') {
      control.addEventListener('click', () => {
        actions.selectLanguage(control.dataset.languageId)
      })
    } else if (actionName === 'continue-language') {
      control.addEventListener('click', () => {
        actions.continueFromLanguage()
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
