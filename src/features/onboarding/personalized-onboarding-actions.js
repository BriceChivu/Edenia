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
    || typeof actions.selectLevel !== 'function'
    || typeof actions.setStep !== 'function'
    || typeof actions.toggleChannel !== 'function'
    || typeof actions.finish !== 'function'
  ) {
    throw new TypeError(
      'Personalized onboarding actions require selectLanguage, continueFromLanguage, selectLevel, setStep, toggleChannel, and finish callbacks'
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
    } else if (actionName === 'select-level') {
      control.addEventListener('click', () => {
        actions.selectLevel(control.dataset.levelId)
      })
    } else if (actionName === 'set-step') {
      control.addEventListener('click', () => {
        actions.setStep(control.dataset.personalizedOnboardingStep)
      })
    } else if (actionName === 'toggle-channel') {
      control.addEventListener('click', () => {
        actions.toggleChannel(control.dataset.catalogId)
      })
    } else if (actionName === 'finish') {
      control.addEventListener('click', () => {
        actions.finish()
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
