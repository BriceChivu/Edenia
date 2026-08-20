const COPY_KEYS = Object.freeze({
  conflicting: 'profileAccess.conflicting',
  locked: 'profileAccess.locked',
  migrating: 'profileAccess.migrating',
  recovering: 'profileAccess.recovering',
  resolving: 'profileAccess.resolving',
  'waiting-authentication': 'profileAccess.waitingAuthentication',
  'waiting-cloud': 'profileAccess.waitingCloud'
})

const BUSY_STATES = new Set([
  'migrating',
  'recovering',
  'resolving',
  'waiting-cloud'
])

export function createLearnerProfileAccessView({ root, translate }) {
  const gate = root.getElementById('learnerProfileAccessGate')
  const title = root.getElementById('learnerProfileAccessTitle')
  const body = root.getElementById('learnerProfileAccessBody')
  const status = root.getElementById('learnerProfileAccessStatus')

  function render(accessState) {
    if (accessState?.status === 'active') {
      root.documentElement.dataset.learnerProfileAccessState = 'active'
      gate.classList.add('hidden')
      gate.setAttribute('aria-busy', 'false')
      return
    }
    const state = COPY_KEYS[accessState?.status]
      ? accessState.status
      : 'resolving'
    root.documentElement.dataset.learnerProfileAccessState = state
    const key = COPY_KEYS[state]
    title.textContent = translate(`${key}.title`)
    body.textContent = translate(`${key}.body`)
    status.textContent = translate('profileAccess.noProfileVisible')
    gate.setAttribute('aria-busy', String(BUSY_STATES.has(state)))
    gate.classList.remove('hidden')
  }

  return Object.freeze({ render })
}
