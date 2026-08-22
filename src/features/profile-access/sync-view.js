const COPY_KEYS = Object.freeze({
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

export function createLearnerProfileSyncView({ root, translate }) {
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

  function render(state) {
    const status = COPY_KEYS[state?.status] ? state.status : 'idle'
    const hidden = status === 'idle'
    const text = hidden ? '' : translate(COPY_KEYS[status])
    for (const element of [header, settings]) {
      element.textContent = text
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

  return Object.freeze({ render })
}
