const boundControls = new WeakSet()

export function bindOnboardingAccountActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Onboarding account actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.requestEmailCode !== 'function'
    || typeof actions.verifyEmailCode !== 'function'
  ) {
    throw new TypeError(
      'Onboarding account actions require email callbacks'
    )
  }

  let installedCount = 0
  const emailForm = root.querySelector(
    '[data-onboarding-account-action="email-form"]'
  )
  const emailInput = emailForm?.querySelector(
    '[data-onboarding-account-email]'
  )
  if (emailForm && emailInput && !boundControls.has(emailForm)) {
    emailForm.addEventListener('submit', event => {
      event.preventDefault()
      actions.requestEmailCode(emailInput.value, emailForm)
    })
    boundControls.add(emailForm)
    installedCount += 1
  }

  const codeForm = root.querySelector(
    '[data-onboarding-account-action="code-form"]'
  )
  const codeInput = codeForm?.querySelector(
    '[data-onboarding-account-code]'
  )
  if (codeForm && codeInput && !boundControls.has(codeForm)) {
    codeForm.addEventListener('submit', event => {
      event.preventDefault()
      actions.verifyEmailCode(codeInput.value)
    })
    boundControls.add(codeForm)
    installedCount += 1
  }

  return installedCount
}
