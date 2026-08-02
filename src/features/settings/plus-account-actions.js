const boundControls = new WeakSet()

export function bindSettingsPlusAccountActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Settings Plus account actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.restore !== 'function'
    || typeof actions.refresh !== 'function'
    || typeof actions.manageBilling !== 'function'
    || typeof actions.explore !== 'function'
    || typeof actions.signOut !== 'function'
  ) {
    throw new TypeError(
      'Settings Plus account actions require restore, refresh, manageBilling, explore, and signOut callbacks'
    )
  }

  let installedCount = 0
  const form = root.querySelector('[data-plus-account-action="restore-form"]')
  const emailInput = root.querySelector('#plusAccountEmail')
  if (form && emailInput && !boundControls.has(form)) {
    form.addEventListener('submit', event => {
      event.preventDefault()
      actions.restore(emailInput.value)
    })
    boundControls.add(form)
    installedCount += 1
  }

  const refreshControl = root.querySelector(
    '[data-plus-account-action="refresh"]'
  )
  if (refreshControl && !boundControls.has(refreshControl)) {
    refreshControl.addEventListener('click', () => actions.refresh())
    boundControls.add(refreshControl)
    installedCount += 1
  }

  const signOutControl = root.querySelector(
    '[data-plus-account-action="sign-out"]'
  )
  if (signOutControl && !boundControls.has(signOutControl)) {
    signOutControl.addEventListener('click', () => actions.signOut())
    boundControls.add(signOutControl)
    installedCount += 1
  }

  const billingControl = root.querySelector(
    '[data-plus-account-action="billing"]'
  )
  if (billingControl && !boundControls.has(billingControl)) {
    billingControl.addEventListener('click', () => actions.manageBilling())
    boundControls.add(billingControl)
    installedCount += 1
  }

  const exploreControl = root.querySelector(
    '[data-plus-account-action="explore"]'
  )
  if (exploreControl && !boundControls.has(exploreControl)) {
    exploreControl.addEventListener('click', () => actions.explore())
    boundControls.add(exploreControl)
    installedCount += 1
  }

  return installedCount
}
