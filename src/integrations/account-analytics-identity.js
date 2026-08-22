const SUPABASE_USER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeSupabaseUserId(value) {
  const userId = String(value || '').trim().toLowerCase()
  return SUPABASE_USER_UUID_PATTERN.test(userId) ? userId : null
}

function getAccountPersonProperties(accountState) {
  const properties = {}
  const email = String(accountState?.email || '').trim().toLowerCase()
  if (email.length <= 254 && EMAIL_PATTERN.test(email)) {
    properties.email = email
  }
  return Object.freeze(properties)
}

export function createAccountAnalyticsIdentity({
  getPersistedAnalyticsUserId,
  identify,
  reset
}) {
  if (
    typeof getPersistedAnalyticsUserId !== 'function'
    || typeof identify !== 'function'
    || typeof reset !== 'function'
  ) {
    throw new TypeError(
      'Account analytics identity requires persisted analytics user, identify, and reset callbacks'
    )
  }

  let identifiedUserId = null
  let identifiedPropertiesKey = ''
  let resetCompleted = false

  function readPersistedAnalyticsUserId() {
    try {
      const rawUserId = getPersistedAnalyticsUserId()
      if (rawUserId === undefined) return null
      return {
        exists: rawUserId !== undefined && rawUserId !== null && rawUserId !== '',
        userId: normalizeSupabaseUserId(rawUserId)
      }
    } catch {
      return null
    }
  }

  function resetIdentity(force = false) {
    if (resetCompleted && !identifiedUserId) return true
    if (!force && !identifiedUserId) {
      const currentIdentity = readPersistedAnalyticsUserId()
      if (!currentIdentity) return false
      if (!currentIdentity.exists) return true
    }
    try {
      if (reset() !== true) return false
    } catch {
      return false
    }
    identifiedUserId = null
    identifiedPropertiesKey = ''
    resetCompleted = true
    return true
  }

  function synchronize(accountState) {
    if (accountState?.sessionState === 'signed-out') return resetIdentity()
    if (accountState?.sessionState !== 'signed-in') return false

    const userId = normalizeSupabaseUserId(accountState?.userId)
    if (!userId) return false
    if (!identifiedUserId && !resetCompleted) {
      const currentIdentity = readPersistedAnalyticsUserId()
      if (!currentIdentity) return false
      if (
        currentIdentity.exists
        && currentIdentity.userId !== userId
        && !resetIdentity(true)
      ) return false
    }
    const properties = getAccountPersonProperties(accountState)
    const propertiesKey = JSON.stringify(properties)
    if (
      identifiedUserId === userId
      && identifiedPropertiesKey === propertiesKey
    ) return true
    if (identifiedUserId && identifiedUserId !== userId && !resetIdentity()) {
      return false
    }

    try {
      if (identify(userId, properties) !== true) return false
    } catch {
      return false
    }
    identifiedUserId = userId
    identifiedPropertiesKey = propertiesKey
    resetCompleted = false
    return true
  }

  return Object.freeze({
    getIdentifiedUserId: () => identifiedUserId,
    synchronize
  })
}
