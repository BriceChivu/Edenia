export const ACCOUNT_EXPORT_FEEDBACK = Object.freeze({
  COMPLETE: 'complete',
  FAILED: 'failed',
  RATE_LIMITED: 'rate-limited',
  SIGN_IN_REQUIRED: 'sign-in-required'
})

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeSignedInUserId(accountState) {
  const userId = accountState?.sessionState === 'signed-in'
    ? accountState.userId
    : null
  return typeof userId === 'string' && USER_ID_PATTERN.test(userId)
    ? userId.toLowerCase()
    : null
}

function isValidExport(value, userId) {
  return isRecord(value)
    && value.schema_version === 'edenia-account-export-v1'
    && isRecord(value.account)
    && String(value.account.id).toLowerCase() === userId
    && isRecord(value.scope)
    && value.scope.server_data === true
    && value.scope.current_device_progress === false
}

async function readFunctionErrorCode(error) {
  try {
    const body = await error?.context?.clone?.().json?.()
      ?? await error?.context?.json?.()
    return typeof body?.code === 'string' ? body.code : ''
  } catch {
    return ''
  }
}

function feedbackForErrorCode(code) {
  if (code === 'rate_limited') return ACCOUNT_EXPORT_FEEDBACK.RATE_LIMITED
  if (
    code === 'authentication_required'
    || code === 'UNAUTHORIZED_NO_AUTH_HEADER'
    || code === 'INVALID_JWT'
  ) {
    return ACCOUNT_EXPORT_FEEDBACK.SIGN_IN_REQUIRED
  }
  return ACCOUNT_EXPORT_FEEDBACK.FAILED
}

export function createAccountExportController({
  client,
  download,
  onStateChange,
  now = () => new Date()
}) {
  if (!client?.functions?.invoke) {
    throw new TypeError('Account export controller requires a Supabase client')
  }
  if (typeof download !== 'function') {
    throw new TypeError('Account export controller requires a download callback')
  }
  if (typeof onStateChange !== 'function') {
    throw new TypeError('Account export controller requires a state callback')
  }
  if (typeof now !== 'function') {
    throw new TypeError('Account export controller requires a clock')
  }

  let generation = 0
  let currentState = Object.freeze({
    userId: null,
    busyAction: null,
    feedback: null
  })

  function publish(patch) {
    currentState = Object.freeze({ ...currentState, ...patch })
    onStateChange(currentState)
    return currentState
  }

  function synchronizeAccount(accountState) {
    const userId = normalizeSignedInUserId(accountState)
    if (userId === currentState.userId) return currentState
    generation += 1
    return publish({ userId, busyAction: null, feedback: null })
  }

  async function exportData() {
    const userId = currentState.userId
    if (!userId) {
      publish({ feedback: ACCOUNT_EXPORT_FEEDBACK.SIGN_IN_REQUIRED })
      return false
    }
    if (currentState.busyAction) return false

    const requestGeneration = generation
    publish({ busyAction: 'download', feedback: null })
    const { data, error } = await client.functions.invoke(
      'export-account-data',
      { body: {} }
    ).catch(error => ({ data: null, error }))

    if (requestGeneration !== generation || currentState.userId !== userId) {
      return false
    }
    if (error) {
      publish({
        busyAction: null,
        feedback: feedbackForErrorCode(await readFunctionErrorCode(error))
      })
      return false
    }
    if (!isValidExport(data, userId)) {
      publish({ busyAction: null, feedback: ACCOUNT_EXPORT_FEEDBACK.FAILED })
      return false
    }

    const date = now()
    const dateKey = date instanceof Date && Number.isFinite(date.getTime())
      ? date.toISOString().slice(0, 10)
      : 'account'
    try {
      download(data, `edenia-account-data-${dateKey}.json`)
    } catch {
      publish({ busyAction: null, feedback: ACCOUNT_EXPORT_FEEDBACK.FAILED })
      return false
    }
    publish({ busyAction: null, feedback: ACCOUNT_EXPORT_FEEDBACK.COMPLETE })
    return true
  }

  return Object.freeze({
    exportData,
    getState: () => currentState,
    synchronizeAccount
  })
}
