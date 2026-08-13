const boundControls = new WeakSet()

export function bindOnboardingAccountActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Onboarding account actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.signInWithGoogle !== 'function'
    || typeof actions.sendMagicLink !== 'function'
  ) {
    throw new TypeError(
      'Onboarding account actions require Google and email callbacks'
    )
  }

  let installedCount = 0
  const googleControl = root.querySelector(
    '[data-onboarding-account-action="google"]'
  )
  if (googleControl && !boundControls.has(googleControl)) {
    googleControl.addEventListener('click', () => actions.signInWithGoogle())
    boundControls.add(googleControl)
    installedCount += 1
  }

  const emailForm = root.querySelector(
    '[data-onboarding-account-action="email-form"]'
  )
  const emailInput = emailForm?.querySelector(
    '[data-onboarding-account-email]'
  )
  if (emailForm && emailInput && !boundControls.has(emailForm)) {
    emailForm.addEventListener('submit', event => {
      event.preventDefault()
      actions.sendMagicLink(emailInput.value)
    })
    boundControls.add(emailForm)
    installedCount += 1
  }

  return installedCount
}
