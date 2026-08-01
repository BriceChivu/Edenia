const boundRoots = new WeakSet()

function focusableElements(root) {
  return Array.from(root.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(element => element.offsetParent !== null)
}

export function handlePlusModalKeydown(event, root, close) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return true
  }
  if (event.key !== 'Tab') return false
  const focusable = focusableElements(root)
  if (!focusable.length) return false
  const first = focusable[0]
  const last = focusable.at(-1)
  if (event.shiftKey && root.ownerDocument.activeElement === first) {
    event.preventDefault()
    last.focus()
    return true
  }
  if (!event.shiftKey && root.ownerDocument.activeElement === last) {
    event.preventDefault()
    first.focus()
    return true
  }
  return false
}

export function bindPlusUpgradeActions(root, actions) {
  if (!root?.addEventListener || !root?.querySelector) {
    throw new TypeError('Plus upgrade actions require an interactive root')
  }
  for (const name of [
    'close',
    'selectPlan',
    'startCheckout',
    'startUpgradeSignIn',
    'restore',
    'refresh',
    'openBillingPortal',
    'signOut'
  ]) {
    if (typeof actions?.[name] !== 'function') {
      throw new TypeError(`Plus upgrade actions require ${name}`)
    }
  }
  if (boundRoots.has(root)) return false

  root.addEventListener('click', event => {
    const control = event.target.closest?.('[data-plus-action]')
    if (!control || !root.contains(control)) return
    const action = control.dataset.plusAction
    if (action === 'close') actions.close()
    if (action === 'select-plan') actions.selectPlan(control.dataset.planId)
    if (action === 'checkout') actions.startCheckout()
    if (action === 'restore') {
      actions.restore(root.querySelector('[data-plus-email]')?.value || '')
    }
    if (action === 'refresh') actions.refresh()
    if (action === 'billing-portal') actions.openBillingPortal()
    if (action === 'sign-out') actions.signOut()
  })
  root.addEventListener('submit', event => {
    const form = event.target.closest?.('[data-plus-action="upgrade-sign-in"]')
    if (!form || !root.contains(form)) return
    event.preventDefault()
    actions.startUpgradeSignIn(
      root.querySelector('[data-plus-email]')?.value || ''
    )
  })
  root.addEventListener('keydown', event => {
    const dialog = root.getAttribute('role') === 'dialog'
      ? root
      : root.querySelector('[role="dialog"]')
    if (dialog) {
      handlePlusModalKeydown(event, dialog, actions.close)
    }
  })
  boundRoots.add(root)
  return true
}
