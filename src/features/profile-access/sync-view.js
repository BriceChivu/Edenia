const COPY_KEYS = Object.freeze({
  checking: 'progressSync.checking',
  'waiting-check': 'progressSync.checkWaiting',
  conflicting: 'progressSync.needsAttention',
  'needs-attention': 'progressSync.needsAttention',
  'not-backed-up': 'progressSync.notBackedUp',
  'not-yet-backed-up': 'progressSync.notYetBackedUp',
  syncing: 'progressSync.syncing',
  'up-to-date': 'progressSync.upToDate',
  waiting: 'progressSync.waiting'
})
const RECOVERY_STATUSES = new Set([
  'not-backed-up',
  'not-yet-backed-up'
])

export function createLearnerProfileSyncView({
  root, translate, setTimer = setTimeout, clearTimer = clearTimeout
}) {
  const actions = root.getElementById('learnerProfileSyncActions')
  const guidance = root.getElementById('learnerProfileSyncGuidance')
  const header = root.getElementById('learnerProfileSyncStatus')
  const settings = root.getElementById('learnerProfileSyncSettingsStatus')
  if (
    !actions
    || !guidance
    || !header
    || !settings
    || typeof translate !== 'function'
  ) {
    throw new TypeError('Learner-profile sync view requires status elements')
  }

  let syncState = { status: 'idle' }
  let verificationStatus = 'idle'
  let checkingVisible = false
  let checkingTimer = null

  function paint() {
    let status = COPY_KEYS[syncState?.status] ? syncState.status : 'idle'
    if (['idle', 'up-to-date'].includes(status)) {
      if (verificationStatus === 'waiting-check') status = 'waiting-check'
      else if (checkingVisible) status = 'checking'
    }
    const hidden = status === 'idle'
    const text = hidden ? '' : translate(COPY_KEYS[status])
    for (const element of [header, settings]) {
      if (element.textContent !== text) element.textContent = text
      element.dataset.syncStatus = status
      element.classList.toggle('hidden', hidden)
    }
    const recoveryAvailable = RECOVERY_STATUSES.has(status)
    guidance.textContent = recoveryAvailable
      ? translate('progressSync.backupGuidance')
      : ''
    guidance.classList.toggle('hidden', !recoveryAvailable)
    actions.classList.toggle('hidden', !recoveryAvailable)
  }

  function render(state) {
    syncState = state
    paint()
  }

  function setVerification(status) {
    if (status === verificationStatus) return
    verificationStatus = status
    if (checkingTimer !== null) clearTimer(checkingTimer)
    checkingTimer = null
    checkingVisible = false
    if (status === 'checking') {
      checkingTimer = setTimer(() => {
        checkingTimer = null
        checkingVisible = verificationStatus === 'checking'
        paint()
      }, 2000)
    }
    paint()
  }

  return Object.freeze({ render, setVerification })
}
