export const ACCOUNT_SESSION_STATES = Object.freeze({
  LOADING: 'loading',
  SIGNED_OUT: 'signed-out',
  SIGNED_IN: 'signed-in',
  UNAVAILABLE: 'unavailable'
})

export const ACCOUNT_AUTH_ERRORS = Object.freeze({
  GOOGLE_SIGN_IN_FAILED: 'google-sign-in-failed',
  INVALID_EMAIL: 'invalid-email',
  MAGIC_LINK_FAILED: 'magic-link-failed',
  OAUTH_CANCELLED: 'oauth-cancelled',
  OAUTH_FAILED: 'oauth-failed',
  RETURN_DESTINATION_NOT_ALLOWED: 'return-destination-not-allowed',
  SESSION_UNAVAILABLE: 'session-unavailable',
  SIGN_OUT_FAILED: 'sign-out-failed'
})

export const ACCOUNT_AUTH_NOTICES = Object.freeze({
  MAGIC_LINK_SENT: 'magic-link-sent'
})

export const ACCOUNT_AUTH_RETURN_DESTINATIONS = Object.freeze({
  LOCAL: 'http://localhost:8000/?account=1',
  LOCAL_INTERNAL: 'http://localhost:8000/?internal_test=1&account=1',
  PRODUCTION: 'https://bricechivu.github.io/Edenia/?internal_test=1&account=1'
})

const AUTH_SESSION_EVENTS = new Set([
  'SIGNED_IN',
  'SIGNED_OUT',
  'TOKEN_REFRESHED',
  'USER_UPDATED'
])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OAUTH_ERROR_PARAMS = Object.freeze([
  'error',
  'error_code',
  'error_description'
])

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return null
  return email
}

export function getAccountAuthReturnUrl(locationLike) {
  let url
  try {
    url = new URL(locationLike?.href)
  } catch {
    return null
  }

  if (
    url.origin === 'https://bricechivu.github.io'
    && url.pathname === '/Edenia/'
  ) {
    return ACCOUNT_AUTH_RETURN_DESTINATIONS.PRODUCTION
  }
  if (url.origin === 'http://localhost:8000' && url.pathname === '/') {
    return url.searchParams.get('internal_test') === '1'
      ? ACCOUNT_AUTH_RETURN_DESTINATIONS.LOCAL_INTERNAL
      : ACCOUNT_AUTH_RETURN_DESTINATIONS.LOCAL
  }
  return null
}

function readOAuthError(params) {
  const error = String(params.get('error') || '').trim().toLowerCase()
  const errorCode = String(params.get('error_code') || '').trim().toLowerCase()
  const description = String(params.get('error_description') || '')
    .trim()
    .toLowerCase()
  if (!error && !errorCode && !description) return null
  if (
    error === 'access_denied'
    || errorCode === 'access_denied'
    || /\b(cancelled|canceled|denied)\b/.test(description)
  ) {
    return ACCOUNT_AUTH_ERRORS.OAUTH_CANCELLED
  }
  return ACCOUNT_AUTH_ERRORS.OAUTH_FAILED
}

function readAndClearOAuthError(locationLike, historyLike) {
  const url = new URL(locationLike.href)
  const searchError = readOAuthError(url.searchParams)
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
  const hashError = readOAuthError(hashParams)
  const error = searchError || hashError
  if (!error) return null

  for (const param of OAUTH_ERROR_PARAMS) {
    url.searchParams.delete(param)
    hashParams.delete(param)
  }
  const nextHash = hashParams.toString()
  historyLike.replaceState(
    historyLike.state,
    '',
    `${url.pathname}${url.search}${nextHash ? `#${nextHash}` : ''}`
  )
  return error
}

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
  history: historyLike,
  location: locationLike,
  onStateChange,
  schedule = callback => setTimeout(callback, 0)
}) {
  if (
    typeof client?.auth?.getSession !== 'function'
    || typeof client?.auth?.onAuthStateChange !== 'function'
    || typeof client?.auth?.signInWithOAuth !== 'function'
    || typeof client?.auth?.signInWithOtp !== 'function'
    || typeof client?.auth?.signOut !== 'function'
  ) {
    throw new TypeError('Account auth controller requires a Supabase auth client')
  }
  if (typeof onStateChange !== 'function' || typeof schedule !== 'function') {
    throw new TypeError('Account auth controller requires state callbacks')
  }
  if (!locationLike?.href || typeof historyLike?.replaceState !== 'function') {
    throw new TypeError('Account auth controller requires browser location and history')
  }

  let currentState = Object.freeze({
    sessionState: ACCOUNT_SESSION_STATES.LOADING,
    userId: null,
    email: '',
    busyAction: null,
    error: null,
    notice: null
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

  function synchronizeSession(session, { error = null } = {}) {
    sessionRequestId += 1
    const user = getSessionUser(session)
    if (!user) {
      return publish({
        sessionState: ACCOUNT_SESSION_STATES.SIGNED_OUT,
        userId: null,
        email: '',
        busyAction: null,
        error,
        notice: null
      })
    }
    return publish({
      sessionState: ACCOUNT_SESSION_STATES.SIGNED_IN,
      ...user,
      busyAction: null,
      error,
      notice: null
    })
  }

  async function refreshSession({ busyAction = null, completionError = null } = {}) {
    const requestId = ++sessionRequestId
    if (busyAction) publish({ busyAction, error: null, notice: null })
    try {
      const { data, error: authError } = await client.auth.getSession()
      if (authError) throw authError
      if (destroyed || requestId !== sessionRequestId) return currentState
      return synchronizeSession(data?.session || null, { error: completionError })
    } catch {
      if (destroyed || requestId !== sessionRequestId) return currentState
      return publish({
        sessionState: ACCOUNT_SESSION_STATES.UNAVAILABLE,
        userId: null,
        email: '',
        busyAction: null,
        error: ACCOUNT_AUTH_ERRORS.SESSION_UNAVAILABLE,
        notice: null
      })
    }
  }

  async function initializeOnce() {
    const callbackError = readAndClearOAuthError(locationLike, historyLike)
    const authListener = client.auth.onAuthStateChange(event => {
      if (!AUTH_SESSION_EVENTS.has(event)) return
      schedule(() => {
        if (destroyed) return
        if (event === 'SIGNED_OUT') {
          synchronizeSession(null)
          return
        }
        // Confirm the session after the auth callback so dependent data reads
        // cannot race the client's token installation during OAuth redirects.
        void refreshSession()
      })
    })
    authSubscription = authListener?.data?.subscription || null
    return refreshSession({ completionError: callbackError })
  }

  function initialize() {
    if (!initializedPromise) initializedPromise = initializeOnce()
    return initializedPromise
  }

  function refresh() {
    return refreshSession({ busyAction: 'refresh' })
  }

  function requireReturnUrl() {
    const redirectTo = getAccountAuthReturnUrl(locationLike)
    if (redirectTo) return redirectTo
    publish({
      busyAction: null,
      error: ACCOUNT_AUTH_ERRORS.RETURN_DESTINATION_NOT_ALLOWED,
      notice: null
    })
    return null
  }

  async function signInWithGoogle() {
    const redirectTo = requireReturnUrl()
    if (!redirectTo) return false
    publish({ busyAction: 'google-sign-in', error: null, notice: null })
    let result
    try {
      result = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo }
      })
    } catch {}
    if (destroyed) return false
    if (!result || result.error) {
      publish({
        busyAction: null,
        error: ACCOUNT_AUTH_ERRORS.GOOGLE_SIGN_IN_FAILED,
        notice: null
      })
      return false
    }
    return true
  }

  async function sendMagicLink(value) {
    const email = normalizeEmail(value)
    if (!email) {
      publish({
        busyAction: null,
        error: ACCOUNT_AUTH_ERRORS.INVALID_EMAIL,
        notice: null
      })
      return false
    }
    const emailRedirectTo = requireReturnUrl()
    if (!emailRedirectTo) return false
    publish({ busyAction: 'email-sign-in', error: null, notice: null })
    let result
    try {
      result = await client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo,
          shouldCreateUser: true
        }
      })
    } catch {}
    if (destroyed) return false
    if (!result || result.error) {
      publish({
        busyAction: null,
        error: ACCOUNT_AUTH_ERRORS.MAGIC_LINK_FAILED,
        notice: null
      })
      return false
    }
    publish({
      busyAction: null,
      error: null,
      notice: ACCOUNT_AUTH_NOTICES.MAGIC_LINK_SENT
    })
    return true
  }

  async function signOut() {
    const requestId = ++sessionRequestId
    publish({ busyAction: 'sign-out', error: null, notice: null })
    let result
    try {
      result = await client.auth.signOut({ scope: 'local' })
    } catch {}
    if (destroyed) return false
    if (!result || result.error) {
      if (requestId === sessionRequestId) {
        publish({
          busyAction: null,
          error: ACCOUNT_AUTH_ERRORS.SIGN_OUT_FAILED,
          notice: null
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
    sendMagicLink,
    signInWithGoogle,
    signOut
  })
}
