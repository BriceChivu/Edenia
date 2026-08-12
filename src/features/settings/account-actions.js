const boundControls = new WeakSet()

export function bindSettingsAccountActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Settings account actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.signInWithGoogle !== 'function'
    || typeof actions.sendMagicLink !== 'function'
    || typeof actions.signOut !== 'function'
    || typeof actions.downloadAccount !== 'function'
  ) {
    throw new TypeError(
      'Settings account actions require sign-in, export, and sign-out callbacks'
    )
  }

  let installedCount = 0
  const googleControl = root.querySelector('[data-account-action="google"]')
  if (googleControl && !boundControls.has(googleControl)) {
    googleControl.addEventListener('click', () => actions.signInWithGoogle())
    boundControls.add(googleControl)
    installedCount += 1
  }

  const emailForm = root.querySelector('[data-account-action="email-form"]')
  const emailInput = root.querySelector('#accountEmail')
  if (emailForm && emailInput && !boundControls.has(emailForm)) {
    emailForm.addEventListener('submit', event => {
      event.preventDefault()
      actions.sendMagicLink(emailInput.value)
    })
    boundControls.add(emailForm)
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
