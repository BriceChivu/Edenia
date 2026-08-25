import {
  LEARNER_PROFILE_RECOVERY_FEEDBACK,
  LEARNER_PROFILE_RECOVERY_REASONS,
  LEARNER_PROFILE_RECOVERY_SOURCES
} from '../../domain/learner-profile-resolution.js'

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

const AUTHENTICATION_ACTION_STATES = new Set([
  'locked',
  'waiting-authentication'
])

const RECOVERY_COPY_KEYS = Object.freeze({
  [LEARNER_PROFILE_RECOVERY_REASONS.CURRENT_HEAD_MISSING]:
    'profileAccess.missingHead',
  [LEARNER_PROFILE_RECOVERY_REASONS.CURRENT_HEAD_UNUSABLE]:
    'profileAccess.unusableHead'
})

export function createLearnerProfileAccessView({
  formatDateTime,
  root,
  translate
}) {
  const gate = root.getElementById('learnerProfileAccessGate')
  const title = root.getElementById('learnerProfileAccessTitle')
  const body = root.getElementById('learnerProfileAccessBody')
  const status = root.getElementById('learnerProfileAccessStatus')
  const openSignIn = root.getElementById('learnerProfileAccessOpenSignIn')
  const retry = root.getElementById('learnerProfileAccessRetry')
  const signOut = root.getElementById('learnerProfileAccessSignOut')
  const continueReplacement = root.getElementById(
    'learnerProfileAccessContinue'
  )
  const exportReplacement = root.getElementById('learnerProfileAccessExport')
  const discardReplacement = root.getElementById('learnerProfileAccessDiscard')
  const recovery = root.getElementById('learnerProfileRecovery')
  const recoveryList = root.getElementById('learnerProfileRecoveryList')
  const recoveryEmpty = root.getElementById('learnerProfileRecoveryEmpty')
  const recoveryFeedback = root.getElementById(
    'learnerProfileRecoveryFeedback'
  )
  const dateTime = typeof formatDateTime === 'function'
    ? formatDateTime
    : value => String(value || '')

  function hideRecovery() {
    recoveryList.replaceChildren()
    recoveryEmpty.hidden = true
    recoveryFeedback.textContent = ''
    recovery.classList.add('hidden')
  }

  function renderRecovery(recoveryState) {
    if (
      !RECOVERY_COPY_KEYS[recoveryState?.reason]
      || !Array.isArray(recoveryState.candidates)
    ) {
      hideRecovery()
      return
    }
    const items = recoveryState.candidates.map((candidate, index) => {
      const item = root.createElement('li')
      const body = root.createElement('p')
      const restore = root.createElement('button')
      const exportButton = root.createElement('button')
      item.className = 'learner-profile-recovery-item'
      body.id = `learnerProfileRecoveryCandidateBody${index}`
      body.textContent = candidate.source === LEARNER_PROFILE_RECOVERY_SOURCES.PROTECTED
        ? translate('profileAccess.recovery.protected', {
            date: dateTime(candidate.protectedUntil)
          })
        : translate('profileAccess.recovery.local')
      for (const [control, action, key, className] of [
        [restore, 'restore', 'restore', 'btn-primary'],
        [exportButton, 'export', 'export', 'btn-secondary']
      ]) {
        control.className = className
        control.type = 'button'
        control.dataset.profileRecoveryAction = action
        control.dataset.recoveryCandidateId = candidate.id
        control.setAttribute('aria-describedby', body.id)
        control.textContent = translate(`profileAccess.recovery.${key}`)
      }
      item.append(body, restore, exportButton)
      return item
    })
    recoveryList.replaceChildren(...items)
    recoveryEmpty.hidden = items.length > 0
    recoveryEmpty.textContent = translate('profileAccess.recovery.none')
    recoveryFeedback.textContent = recoveryState.feedback
      === LEARNER_PROFILE_RECOVERY_FEEDBACK.RESTORE_FAILED
      ? translate('profileAccess.recovery.restoreFailed')
      : ''
    recovery.classList.remove('hidden')
  }

  function hideActions() {
    for (const control of [
      openSignIn,
      retry,
      signOut,
      continueReplacement,
      exportReplacement,
      discardReplacement
    ]) control.hidden = true
  }

  function showActions(accessState) {
    hideActions()
    if (AUTHENTICATION_ACTION_STATES.has(accessState?.status)) {
      openSignIn.hidden = false
      return
    }
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
      hideRecovery()
      return
    }
    const state = COPY_KEYS[accessState?.status]
      ? accessState.status
      : 'resolving'
    root.documentElement.dataset.learnerProfileAccessState = state
    const protectionStatus = ['pending', 'synchronized'].includes(
      accessState?.replacement?.protectionStatus
    ) ? accessState.replacement.protectionStatus : 'blocked'
    const recoveryCopyKey = state === 'recovering'
      ? RECOVERY_COPY_KEYS[accessState?.recovery?.reason]
      : null
    const key = state === 'account-change'
      ? `profileAccess.accountChange.${protectionStatus}`
      : recoveryCopyKey || COPY_KEYS[state]
    title.textContent = translate(`${key}.title`)
    body.textContent = translate(`${key}.body`)
    status.textContent = translate('profileAccess.noProfileVisible')
    gate.setAttribute('aria-busy', String(BUSY_STATES.has(state)))
    showActions(accessState)
    renderRecovery(accessState?.recovery)
    gate.classList.remove('hidden')
  }

  return Object.freeze({ render })
}
