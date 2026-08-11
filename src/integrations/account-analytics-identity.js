const SUPABASE_USER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeSupabaseUserId(value) {
  const userId = String(value || '').trim().toLowerCase()
  return SUPABASE_USER_UUID_PATTERN.test(userId) ? userId : null
}

export function createAccountAnalyticsIdentity({ identify, reset }) {
  if (typeof identify !== 'function' || typeof reset !== 'function') {
    throw new TypeError('Account analytics identity requires identify and reset callbacks')
  }

  let identifiedUserId = null

  function resetIdentity() {
    if (!identifiedUserId) return true
    try {
      if (reset() !== true) return false
    } catch {
      return false
    }
    identifiedUserId = null
    return true
  }

  function synchronize(accountState) {
    if (accountState?.sessionState === 'signed-out') return resetIdentity()
    if (accountState?.sessionState !== 'signed-in') return false

    const userId = normalizeSupabaseUserId(accountState?.userId)
    if (!userId) return false
    if (identifiedUserId === userId) return true
    if (identifiedUserId && !resetIdentity()) return false

    try {
      if (identify(userId) !== true) return false
    } catch {
      return false
    }
    identifiedUserId = userId
    return true
  }

  return Object.freeze({
    getIdentifiedUserId: () => identifiedUserId,
    synchronize
  })
}
