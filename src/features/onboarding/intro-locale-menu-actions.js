const boundControls = new WeakSet()
const controlSelector = '[data-intro-locale-menu-action]'

export function bindIntroLocaleMenuActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError(
      'Intro locale-menu actions require a queryable root'
    )
  }
  if (
    !actions
    || typeof actions.toggleIntro !== 'function'
    || typeof actions.toggleOnboarding !== 'function'
  ) {
    throw new TypeError(
      'Intro locale-menu actions require toggleIntro and toggleOnboarding callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (!control || boundControls.has(control)) return

    const actionName = control.dataset?.introLocaleMenuAction
    if (actionName === 'toggle-intro') {
      control.addEventListener('click', event => {
        actions.toggleIntro(event)
      })
    } else if (actionName === 'toggle-onboarding') {
      control.addEventListener('click', event => {
        actions.toggleOnboarding(event)
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
