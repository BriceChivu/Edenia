const boundControls = new WeakSet()
const controlSelector = '[data-intro-locale-action]'

export function bindIntroLocaleSelectionActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError(
      'Intro locale-selection actions require a queryable root'
    )
  }
  if (
    !actions
    || typeof actions.changeIntro !== 'function'
    || typeof actions.changeOnboarding !== 'function'
  ) {
    throw new TypeError(
      'Intro locale-selection actions require changeIntro and changeOnboarding callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (!control || boundControls.has(control)) return

    const actionName = control.dataset?.introLocaleAction
    if (actionName === 'change-intro') {
      control.addEventListener('change', () => {
        actions.changeIntro(control.value)
      })
    } else if (actionName === 'change-onboarding') {
      control.addEventListener('change', () => {
        actions.changeOnboarding(control.value)
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
