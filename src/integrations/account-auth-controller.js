export const ACCOUNT_SESSION_STATES = Object.freeze({
  LOADING: 'loading',
  SIGNED_OUT: 'signed-out',
  SIGNED_IN: 'signed-in',
  UNAVAILABLE: 'unavailable'
})

export const ACCOUNT_AUTH_ERRORS = Object.freeze({
  CAPTCHA_REQUIRED: 'captcha-required',
  EMAIL_CODE_COOLDOWN: 'email-code-cooldown',
  EMAIL_CODE_EXPIRED: 'email-code-expired',
  EMAIL_CODE_REQUEST_FAILED: 'email-code-request-failed',
  EMAIL_CODE_VERIFICATION_FAILED: 'email-code-verification-failed',
  EMAIL_RATE_LIMITED: 'email-rate-limited',
  GOOGLE_SIGN_IN_FAILED: 'google-sign-in-failed',
  INVALID_EMAIL: 'invalid-email',
  INVALID_EMAIL_CODE: 'invalid-email-code',
  OFFLINE: 'offline',
  OAUTH_CANCELLED: 'oauth-cancelled',
  OAUTH_FAILED: 'oauth-failed',
  RETURN_DESTINATION_NOT_ALLOWED: 'return-destination-not-allowed',
  SESSION_UNAVAILABLE: 'session-unavailable',
  SIGN_OUT_FAILED: 'sign-out-failed'
})

export const ACCOUNT_AUTH_NOTICES = Object.freeze({
  EMAIL_CODE_SENT: 'email-code-sent'
})

export const ACCOUNT_AUTH_RETURN_DESTINATIONS = Object.freeze({
  LOCAL: 'http://localhost:8000/?internal_test=1&account=1',
  PRODUCTION: 'https://www.edenia.study/?internal_test=1&account=1'
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
const CAPTCHA_TOKEN_MAX_LENGTH = 2048
const EMAIL_CODE_COOLDOWN_MS = 60_000
const EMAIL_CODE_PATTERN = /^\d{6}$/u
const EMAIL_LOCALES = new Set(['en', 'es', 'fr', 'zh-Hans', 'zh-Hant'])
const EMAIL_AUTH_METHODS = new Set([
  'email',
  'email/signup',
  'magiclink',
  'otp'
])

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return null
  return email
}

function normalizeEmailLocale(value) {
  const locale = String(value || '').trim()
  return EMAIL_LOCALES.has(locale) ? locale : 'en'
}

function normalizeEmailCode(value) {
  const code = String(value || '').trim()
  return EMAIL_CODE_PATTERN.test(code) ? code : null
}

function isRateLimitError(error) {
  const code = String(error?.code || '').trim().toLowerCase()
  return Number(error?.status) === 429
    || code === 'over_email_send_rate_limit'
    || code === 'over_request_rate_limit'
}

function isInvalidEmailCodeError(error) {
  const status = Number(error?.status)
  const code = String(error?.code || '').trim().toLowerCase()
  return [400, 401, 403, 422].includes(status)
    || ['invalid_otp', 'otp_disabled'].includes(code)
}

export function getAccountAuthReturnUrl(locationLike) {
  let url
  try {
    url = new URL(locationLike?.href)
  } catch {
    return null
  }

  if (
    url.origin === 'https://www.edenia.study'
    && url.pathname === '/'
  ) {
    return ACCOUNT_AUTH_RETURN_DESTINATIONS.PRODUCTION
  }
  if (url.origin === 'http://localhost:8000' && url.pathname === '/') {
    return ACCOUNT_AUTH_RETURN_DESTINATIONS.LOCAL
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

function getAuthMethod(user, claims) {
  const provider = String(user?.app_metadata?.provider || '')
    .trim()
    .toLowerCase()
  const providers = Array.isArray(user?.app_metadata?.providers)
    ? user.app_metadata.providers.map(value => String(value).toLowerCase())
    : []
  const claimsMatchUser = typeof claims?.sub === 'string'
    && claims.sub === user?.id
  if (claimsMatchUser && Array.isArray(claims.amr)) {
    for (const entry of claims.amr) {
      const method = String(
        typeof entry === 'string' ? entry : entry?.method || ''
      ).trim().toLowerCase()
      if (EMAIL_AUTH_METHODS.has(method)) return 'email'
      if (
        ['id_token', 'oauth'].includes(method)
        && (provider === 'google' || providers.includes('google'))
      ) return 'google'
    }
  }
  return ['email', 'google'].includes(provider) ? provider : null
}

function sessionNeedsAuthMethodClaims(session) {
  const provider = String(
    session?.user?.app_metadata?.provider || ''
  ).trim().toLowerCase()
  const providers = session?.user?.app_metadata?.providers
  if (provider === 'google') return true
  if (!Array.isArray(providers)) return false
  const accountProviders = new Set(
    providers
      .map(value => String(value).trim().toLowerCase())
      .filter(value => ['email', 'google'].includes(value))
  )
  return accountProviders.has('google')
}

function getSessionUser(session, claims = null) {
  const user = session?.user
  if (typeof user?.id !== 'string' || !user.id) return null
  return {
    userId: user.id,
    email: typeof user.email === 'string'
      ? String(user.email).trim().toLowerCase()
      : '',
    authMethod: getAuthMethod(user, claims)
  }
}

export function createAccountAuthController({
  client,
  history: historyLike,
  isOnline = () => globalThis.navigator?.onLine !== false,
  location: locationLike,
  onStateChange,
  now = () => Date.now(),
  schedule = callback => setTimeout(callback, 0)
}) {
  if (
    typeof client?.auth?.getSession !== 'function'
    || typeof client?.auth?.onAuthStateChange !== 'function'
    || typeof client?.auth?.signInWithOtp !== 'function'
    || typeof client?.auth?.verifyOtp !== 'function'
    || typeof client?.auth?.signOut !== 'function'
  ) {
    throw new TypeError('Account auth controller requires a Supabase auth client')
  }
  if (
    typeof onStateChange !== 'function'
    || typeof isOnline !== 'function'
    || typeof now !== 'function'
    || typeof schedule !== 'function'
  ) {
    throw new TypeError('Account auth controller requires state callbacks')
  }
  if (!locationLike?.href || typeof historyLike?.replaceState !== 'function') {
    throw new TypeError('Account auth controller requires browser location and history')
  }

  let currentState = Object.freeze({
    sessionState: ACCOUNT_SESSION_STATES.LOADING,
    userId: null,
    email: '',
    authMethod: null,
    busyAction: null,
    error: null,
    notice: null
  })
  let initializedPromise = null
  let authSubscription = null
  let sessionRequestId = 0
  let destroyed = false
  let emailCodeAvailableAt = 0
  let emailVerificationAddress = ''

  function publish(patch) {
    if (destroyed) return currentState
    currentState = Object.freeze({ ...currentState, ...patch })
    onStateChange(currentState)
    return currentState
  }

  function synchronizeSession(session, { claims = null, error = null } = {}) {
    sessionRequestId += 1
    const user = getSessionUser(session, claims)
    emailVerificationAddress = ''
    if (!user) {
      return publish({
        sessionState: ACCOUNT_SESSION_STATES.SIGNED_OUT,
        userId: null,
        email: '',
        authMethod: null,
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
      const session = data?.session || null
      let claims = null
      if (
        sessionNeedsAuthMethodClaims(session)
        && typeof client.auth.getClaims === 'function'
      ) {
        try {
          const claimsResult = await client.auth.getClaims(session.access_token)
          if (!claimsResult?.error) claims = claimsResult?.data?.claims || null
        } catch {}
      }
      if (destroyed || requestId !== sessionRequestId) return currentState
      return synchronizeSession(session, { claims, error: completionError })
    } catch {
      if (destroyed || requestId !== sessionRequestId) return currentState
      return publish({
        sessionState: ACCOUNT_SESSION_STATES.UNAVAILABLE,
        userId: null,
        email: '',
        authMethod: null,
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
        // cannot race the client's token installation.
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

  function requireAllowedLocation() {
    if (getAccountAuthReturnUrl(locationLike)) return true
    publish({
      busyAction: null,
      error: ACCOUNT_AUTH_ERRORS.RETURN_DESTINATION_NOT_ALLOWED,
      notice: null
    })
    return null
  }

  async function signInWithGoogleIdToken({ token, nonce } = {}) {
    if (!requireAllowedLocation()) return false
    const normalizedToken = String(token || '').trim()
    const normalizedNonce = String(nonce || '').trim()
    if (!normalizedToken || !normalizedNonce) {
      publish({
        busyAction: null,
        error: ACCOUNT_AUTH_ERRORS.GOOGLE_SIGN_IN_FAILED,
        notice: null
      })
      return false
    }
    publish({ busyAction: 'google-sign-in', error: null, notice: null })
    let result
    try {
      if (typeof client.auth.signInWithIdToken !== 'function') throw new Error()
      result = await client.auth.signInWithIdToken({
        provider: 'google',
        token: normalizedToken,
        nonce: normalizedNonce
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

  async function requestEmailCode(
    value,
    { captchaRequired = false, captchaToken = '', locale = 'en' } = {}
  ) {
    const email = normalizeEmail(value)
    if (!email) {
      publish({
        busyAction: null,
        error: ACCOUNT_AUTH_ERRORS.INVALID_EMAIL,
        notice: null
      })
      return false
    }
    if (!requireAllowedLocation()) return false
    const normalizedCaptchaToken = String(captchaToken || '').trim()
    const normalizedLocale = normalizeEmailLocale(locale)
    if (captchaRequired && !normalizedCaptchaToken) {
      publish({
        busyAction: null,
        error: ACCOUNT_AUTH_ERRORS.CAPTCHA_REQUIRED,
        notice: null
      })
      return false
    }
    if (captchaToken && (
      !normalizedCaptchaToken
      || normalizedCaptchaToken.length > CAPTCHA_TOKEN_MAX_LENGTH
    )) {
      publish({
        busyAction: null,
        error: ACCOUNT_AUTH_ERRORS.CAPTCHA_REQUIRED,
        notice: null
      })
      return false
    }
    if (now() < emailCodeAvailableAt) {
      publish({
        busyAction: null,
        error: ACCOUNT_AUTH_ERRORS.EMAIL_CODE_COOLDOWN,
        notice: null
      })
      return false
    }
    publish({ busyAction: 'email-code-request', error: null, notice: null })
    let result
    try {
      result = await client.auth.signInWithOtp({
        email,
        options: {
          data: { edenia_auth_locale: normalizedLocale },
          shouldCreateUser: true,
          ...(normalizedCaptchaToken
            ? { captchaToken: normalizedCaptchaToken }
            : {})
        }
      })
    } catch {}
    if (destroyed) return false
    if (!result || result.error) {
      publish({
        busyAction: null,
        error: !isOnline()
          ? ACCOUNT_AUTH_ERRORS.OFFLINE
          : isRateLimitError(result?.error)
            ? ACCOUNT_AUTH_ERRORS.EMAIL_RATE_LIMITED
            : ACCOUNT_AUTH_ERRORS.EMAIL_CODE_REQUEST_FAILED,
        notice: null
      })
      return false
    }
    emailCodeAvailableAt = now() + EMAIL_CODE_COOLDOWN_MS
    emailVerificationAddress = email
    publish({
      busyAction: null,
      error: null,
      notice: ACCOUNT_AUTH_NOTICES.EMAIL_CODE_SENT
    })
    return true
  }

  async function verifyEmailCode(value) {
    const code = normalizeEmailCode(value)
    if (!code || !emailVerificationAddress) {
      publish({
        busyAction: null,
        error: ACCOUNT_AUTH_ERRORS.INVALID_EMAIL_CODE
      })
      return false
    }
    publish({ busyAction: 'email-code-verification', error: null })
    let result
    try {
      result = await client.auth.verifyOtp({
        email: emailVerificationAddress,
        token: code,
        type: 'email'
      })
    } catch {}
    if (destroyed) return false
    if (!result || result.error || !getSessionUser(result.data?.session)) {
      const errorCode = String(result?.error?.code || '').trim().toLowerCase()
      publish({
        busyAction: null,
        error: !isOnline()
          ? ACCOUNT_AUTH_ERRORS.OFFLINE
          : isRateLimitError(result?.error)
            ? ACCOUNT_AUTH_ERRORS.EMAIL_RATE_LIMITED
            : errorCode === 'otp_expired'
              ? ACCOUNT_AUTH_ERRORS.EMAIL_CODE_EXPIRED
              : isInvalidEmailCodeError(result?.error)
                ? ACCOUNT_AUTH_ERRORS.INVALID_EMAIL_CODE
                : ACCOUNT_AUTH_ERRORS.EMAIL_CODE_VERIFICATION_FAILED
      })
      return false
    }
    synchronizeSession(result.data.session)
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
    hasPendingEmailCode: () => Boolean(emailVerificationAddress),
    initialize,
    refresh,
    requestEmailCode,
    signInWithGoogleIdToken,
    signOut,
    verifyEmailCode
  })
}
