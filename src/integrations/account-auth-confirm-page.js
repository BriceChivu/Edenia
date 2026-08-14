export const ACCOUNT_AUTH_CONFIRM_STATES = Object.freeze({
  INVALID: 'invalid',
  OFFLINE: 'offline',
  READY: 'ready',
  RETRYABLE: 'retryable',
  SUCCESS: 'success',
  VERIFYING: 'verifying'
})

const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{20,1024}$/

export function parseAccountAuthConfirmationFragment(fragment) {
  const source = String(fragment || '')
  if (!source.startsWith('#') || source.length > 1100) return null
  const params = new URLSearchParams(source.slice(1))
  const entries = [...params.entries()]
  if (
    entries.length !== 2
    || params.getAll('token_hash').length !== 1
    || params.getAll('type').length !== 1
    || params.get('type') !== 'email'
  ) return null
  const tokenHash = String(params.get('token_hash') || '').trim()
  if (!TOKEN_HASH_PATTERN.test(tokenHash)) return null
  return Object.freeze({ tokenHash, type: 'email' })
}

export function getAccountAuthConfirmationReturnUrl(locationLike) {
  let url
  try {
    url = new URL(locationLike?.href)
  } catch {
    return null
  }
  if (url.search || url.hash || url.pathname !== '/auth/confirm/') return null
  if (url.origin === 'https://www.edenia.study') {
    return 'https://www.edenia.study/?internal_test=1&account=1'
  }
  if (url.origin === 'http://localhost:8000') {
    return 'http://localhost:8000/?internal_test=1&account=1'
  }
  return null
}

function isRetryableError(error) {
  const status = Number(error?.status)
  return error?.name === 'AuthRetryableFetchError'
    || !Number.isFinite(status)
    || status === 0
    || status === 408
    || status === 429
    || status >= 500
}

export function createAccountAuthConfirmPage({
  client,
  fragment,
  isOnline = () => navigator.onLine !== false,
  location: locationLike,
  navigate,
  onStateChange
}) {
  if (
    typeof client?.auth?.verifyOtp !== 'function'
    || typeof isOnline !== 'function'
    || typeof navigate !== 'function'
    || typeof onStateChange !== 'function'
  ) {
    throw new TypeError('Account auth confirmation requires browser callbacks')
  }

  const parsed = parseAccountAuthConfirmationFragment(fragment)
  const returnUrl = getAccountAuthConfirmationReturnUrl(locationLike)
  let tokenHash = parsed?.tokenHash || ''
  let destroyed = false
  let request = null
  let state = Object.freeze({
    status: tokenHash && returnUrl
      ? ACCOUNT_AUTH_CONFIRM_STATES.READY
      : ACCOUNT_AUTH_CONFIRM_STATES.INVALID
  })

  function publish(status) {
    if (destroyed) return state
    state = Object.freeze({ status })
    onStateChange(state)
    return state
  }

  async function verifyOnce() {
    if (
      !tokenHash
      || !returnUrl
      || ![
        ACCOUNT_AUTH_CONFIRM_STATES.READY,
        ACCOUNT_AUTH_CONFIRM_STATES.OFFLINE,
        ACCOUNT_AUTH_CONFIRM_STATES.RETRYABLE
      ].includes(state.status)
    ) return false
    if (!isOnline()) {
      publish(ACCOUNT_AUTH_CONFIRM_STATES.OFFLINE)
      return false
    }

    publish(ACCOUNT_AUTH_CONFIRM_STATES.VERIFYING)
    let result
    try {
      result = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'email'
      })
    } catch {
      if (!destroyed) {
        publish(
          isOnline()
            ? ACCOUNT_AUTH_CONFIRM_STATES.RETRYABLE
            : ACCOUNT_AUTH_CONFIRM_STATES.OFFLINE
        )
      }
      return false
    }
    if (destroyed) return false
    if (result?.error) {
      if (isRetryableError(result.error)) {
        publish(ACCOUNT_AUTH_CONFIRM_STATES.RETRYABLE)
      } else {
        tokenHash = ''
        publish(ACCOUNT_AUTH_CONFIRM_STATES.INVALID)
      }
      return false
    }

    tokenHash = ''
    publish(ACCOUNT_AUTH_CONFIRM_STATES.SUCCESS)
    navigate(returnUrl)
    return true
  }

  function confirm() {
    if (!request) {
      request = verifyOnce().finally(() => { request = null })
    }
    return request
  }

  function destroy() {
    destroyed = true
    tokenHash = ''
  }

  return Object.freeze({
    confirm,
    destroy,
    getState: () => state,
    initialize() {
      onStateChange(state)
      return state
    }
  })
}
