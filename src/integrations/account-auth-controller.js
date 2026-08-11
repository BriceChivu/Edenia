export const ACCOUNT_SESSION_STATES = Object.freeze({
  LOADING: 'loading',
  SIGNED_OUT: 'signed-out',
  SIGNED_IN: 'signed-in',
  UNAVAILABLE: 'unavailable'
})

export const ACCOUNT_AUTH_ERRORS = Object.freeze({
  SESSION_UNAVAILABLE: 'session-unavailable',
  SIGN_OUT_FAILED: 'sign-out-failed'
})

const AUTH_SESSION_EVENTS = new Set([
  'SIGNED_IN',
  'SIGNED_OUT',
  'TOKEN_REFRESHED',
  'USER_UPDATED'
])

function getSessionUser(session) {
  const user = session?.user
  if (typeof user?.id !== 'string' || !user.id) return null
  return {
    userId: user.id,
    email: typeof user.email === 'string' ? user.email : ''
  }
}

export function createAccountAuthController({
  client,
  onStateChange,
  schedule = callback => setTimeout(callback, 0)
}) {
  if (
    typeof client?.auth?.getSession !== 'function'
    || typeof client?.auth?.onAuthStateChange !== 'function'
    || typeof client?.auth?.signOut !== 'function'
  ) {
    throw new TypeError('Account auth controller requires a Supabase auth client')
  }
  if (typeof onStateChange !== 'function' || typeof schedule !== 'function') {
    throw new TypeError('Account auth controller requires state callbacks')
  }

  let currentState = Object.freeze({
    sessionState: ACCOUNT_SESSION_STATES.LOADING,
    userId: null,
    email: '',
    busyAction: null,
    error: null
  })
  let initializedPromise = null
  let authSubscription = null
  let sessionRequestId = 0
  let destroyed = false

  function publish(patch) {
    if (destroyed) return currentState
    currentState = Object.freeze({ ...currentState, ...patch })
    onStateChange(currentState)
    return currentState
  }

  function synchronizeSession(session) {
    sessionRequestId += 1
    const user = getSessionUser(session)
    if (!user) {
      return publish({
        sessionState: ACCOUNT_SESSION_STATES.SIGNED_OUT,
        userId: null,
        email: '',
        busyAction: null,
        error: null
      })
    }
    return publish({
      sessionState: ACCOUNT_SESSION_STATES.SIGNED_IN,
      ...user,
      busyAction: null,
      error: null
    })
  }

  async function refreshSession({ busyAction = null } = {}) {
    const requestId = ++sessionRequestId
    if (busyAction) publish({ busyAction, error: null })
    try {
      const { data, error } = await client.auth.getSession()
      if (error) throw error
      if (destroyed || requestId !== sessionRequestId) return currentState
      return synchronizeSession(data?.session || null)
    } catch {
      if (destroyed || requestId !== sessionRequestId) return currentState
      return publish({
        sessionState: ACCOUNT_SESSION_STATES.UNAVAILABLE,
        userId: null,
        email: '',
        busyAction: null,
        error: ACCOUNT_AUTH_ERRORS.SESSION_UNAVAILABLE
      })
    }
  }

  async function initializeOnce() {
    const authListener = client.auth.onAuthStateChange((event, session) => {
      if (!AUTH_SESSION_EVENTS.has(event)) return
      schedule(() => {
        if (!destroyed) synchronizeSession(session)
      })
    })
    authSubscription = authListener?.data?.subscription || null
    return refreshSession()
  }

  function initialize() {
    if (!initializedPromise) initializedPromise = initializeOnce()
    return initializedPromise
  }

  function refresh() {
    return refreshSession({ busyAction: 'refresh' })
  }

  async function signOut() {
    const requestId = ++sessionRequestId
    publish({ busyAction: 'sign-out', error: null })
    let result
    try {
      result = await client.auth.signOut({ scope: 'local' })
    } catch {}
    if (destroyed) return false
    if (!result || result.error) {
      if (requestId === sessionRequestId) {
        publish({
          busyAction: null,
          error: ACCOUNT_AUTH_ERRORS.SIGN_OUT_FAILED
        })
      }
      return false
    }
    synchronizeSession(null)
    return true
  }

  function destroy() {
    destroyed = true
    sessionRequestId += 1
    authSubscription?.unsubscribe?.()
    authSubscription = null
  }

  return Object.freeze({
    destroy,
    getState: () => currentState,
    initialize,
    refresh,
    signOut
  })
}
