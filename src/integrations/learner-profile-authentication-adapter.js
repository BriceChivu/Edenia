const AUTHENTICATION_STATUSES = new Set([
  'loading',
  'signed-in',
  'signed-out',
  'unavailable'
])

function normalizeObservation(accountState) {
  const status = AUTHENTICATION_STATUSES.has(accountState?.sessionState)
    ? accountState.sessionState
    : 'unavailable'
  const userId = status === 'signed-in'
    && typeof accountState?.userId === 'string'
    && accountState.userId
    ? accountState.userId
    : null
  const normalizedStatus = status === 'signed-in' && !userId
    ? 'unavailable'
    : status
  const failure = normalizedStatus === 'unavailable'
    ? status === 'unavailable' ? 'network' : 'invalid'
    : null
  return Object.freeze({
    ...(failure ? { failure } : {}),
    status: normalizedStatus,
    userId
  })
}

export function createLearnerProfileAuthenticationAdapter({
  initialStatus = 'loading'
} = {}) {
  let observation = normalizeObservation({ sessionState: initialStatus })
  const listeners = new Set()

  function observeAccountState(accountState) {
    const nextObservation = normalizeObservation(accountState)
    if (
      nextObservation.status === observation.status
      && nextObservation.userId === observation.userId
      && nextObservation.failure === observation.failure
    ) return observation
    observation = nextObservation
    for (const listener of listeners) listener(observation)
    return observation
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Authentication observation listener is required')
    }
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return Object.freeze({
    getObservation: () => observation,
    observeAccountState,
    subscribe
  })
}
