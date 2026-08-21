const COPY_KEYS = Object.freeze({
  conflicting: 'progressSync.needsAttention',
  'needs-attention': 'progressSync.needsAttention',
  syncing: 'progressSync.syncing',
  'up-to-date': 'progressSync.upToDate',
  waiting: 'progressSync.waiting'
})

export function createLearnerProfileSyncView({ root, translate }) {
  const header = root.getElementById('learnerProfileSyncStatus')
  const settings = root.getElementById('learnerProfileSyncSettingsStatus')
  if (!header || !settings || typeof translate !== 'function') {
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
  }

  return Object.freeze({ render })
}
