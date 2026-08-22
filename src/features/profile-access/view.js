const COPY_KEYS = Object.freeze({
  'account-change': 'profileAccess.accountChange.blocked',
  conflicting: 'profileAccess.conflicting',
  locked: 'profileAccess.locked',
  migrating: 'profileAccess.migrating',
  recovering: 'profileAccess.recovering',
  resolving: 'profileAccess.resolving',
  reloading: 'profileAccess.reloading',
  replacing: 'profileAccess.replacing',
  'waiting-authentication': 'profileAccess.waitingAuthentication',
  'waiting-cloud': 'profileAccess.waitingCloud'
})

const BUSY_STATES = new Set([
  'migrating',
  'recovering',
  'resolving',
  'reloading',
  'replacing',
  'waiting-cloud'
])

const RECOVERY_ACTION_STATES = new Set([
  'conflicting',
  'recovering',
  'waiting-cloud'
])

export function createLearnerProfileAccessView({ root, translate }) {
  const gate = root.getElementById('learnerProfileAccessGate')
  const title = root.getElementById('learnerProfileAccessTitle')
  const body = root.getElementById('learnerProfileAccessBody')
  const status = root.getElementById('learnerProfileAccessStatus')
  const retry = root.getElementById('learnerProfileAccessRetry')
  const signOut = root.getElementById('learnerProfileAccessSignOut')
  const continueReplacement = root.getElementById(
    'learnerProfileAccessContinue'
  )
  const exportReplacement = root.getElementById('learnerProfileAccessExport')
  const discardReplacement = root.getElementById('learnerProfileAccessDiscard')

  function hideActions() {
    for (const control of [
      retry,
      signOut,
      continueReplacement,
      exportReplacement,
      discardReplacement
    ]) control.hidden = true
  }

  function showActions(accessState) {
    hideActions()
    if (RECOVERY_ACTION_STATES.has(accessState?.status)) {
      retry.hidden = false
      signOut.hidden = false
      return
    }
    if (accessState?.status !== 'account-change') return
    signOut.hidden = false
    if (accessState.replacement?.protectionStatus === 'synchronized') {
      continueReplacement.hidden = false
      return
    }
    exportReplacement.hidden = false
    discardReplacement.hidden = false
  }

  function render(accessState) {
    if (accessState?.status === 'active') {
      root.documentElement.dataset.learnerProfileAccessState = 'active'
      gate.classList.add('hidden')
      gate.setAttribute('aria-busy', 'false')
      hideActions()
      return
    }
    const state = COPY_KEYS[accessState?.status]
      ? accessState.status
      : 'resolving'
    root.documentElement.dataset.learnerProfileAccessState = state
    const protectionStatus = ['pending', 'synchronized'].includes(
      accessState?.replacement?.protectionStatus
    ) ? accessState.replacement.protectionStatus : 'blocked'
    const key = state === 'account-change'
      ? `profileAccess.accountChange.${protectionStatus}`
      : COPY_KEYS[state]
    title.textContent = translate(`${key}.title`)
    body.textContent = translate(`${key}.body`)
    status.textContent = translate('profileAccess.noProfileVisible')
    gate.setAttribute('aria-busy', String(BUSY_STATES.has(state)))
    showActions(accessState)
    gate.classList.remove('hidden')
  }

  return Object.freeze({ render })
}
