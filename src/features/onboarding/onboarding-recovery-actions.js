const boundControls = new WeakSet()
const controlSelector = '[data-onboarding-recovery-action]'

export function bindOnboardingRecoveryActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError(
      'Onboarding recovery actions require a queryable root'
    )
  }
  if (
    !actions
    || typeof actions.copyLink !== 'function'
    || typeof actions.retry !== 'function'
  ) {
    throw new TypeError(
      'Onboarding recovery actions require copyLink and retry callbacks'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (!control || boundControls.has(control)) return

    const actionName = control.dataset?.onboardingRecoveryAction
    if (actionName === 'copy-link') {
      control.addEventListener('click', () => {
        actions.copyLink(control)
      })
    } else if (actionName === 'retry') {
      control.addEventListener('click', () => {
        actions.retry(control)
      })
    } else {
      return
    }

    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
