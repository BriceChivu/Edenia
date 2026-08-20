const boundControls = new WeakSet()

export function bindSettingsAccountActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Settings account actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.requestEmailCode !== 'function'
    || typeof actions.verifyEmailCode !== 'function'
    || typeof actions.signOut !== 'function'
    || typeof actions.downloadAccount !== 'function'
  ) {
    throw new TypeError(
      'Settings account actions require sign-in, export, and sign-out callbacks'
    )
  }

  let installedCount = 0
  const emailForm = root.querySelector('[data-account-action="email-form"]')
  const emailInput = root.querySelector('#accountEmail')
  if (emailForm && emailInput && !boundControls.has(emailForm)) {
    emailForm.addEventListener('submit', event => {
      event.preventDefault()
      actions.requestEmailCode(emailInput.value, emailForm)
    })
    boundControls.add(emailForm)
    installedCount += 1
  }

  const codeForm = root.querySelector('[data-account-action="code-form"]')
  const codeInput = root.querySelector('#accountEmailCode')
  if (codeForm && codeInput && !boundControls.has(codeForm)) {
    codeForm.addEventListener('submit', event => {
      event.preventDefault()
      actions.verifyEmailCode(codeInput.value)
    })
    boundControls.add(codeForm)
    installedCount += 1
  }

  const controls = [
    ['sign-out', actions.signOut],
    ['download-account', actions.downloadAccount]
  ]
  for (const [name, callback] of controls) {
    const control = root.querySelector(`[data-account-action="${name}"]`)
    if (!control || boundControls.has(control)) continue
    control.addEventListener('click', () => callback())
    boundControls.add(control)
    installedCount += 1
  }

  return installedCount
}
