import { ACCOUNT_SESSION_STATES } from './account-auth-controller.js'

export const REMINDER_PREFERENCE_STATES = Object.freeze({
  LOADING: 'loading',
  READY: 'ready',
  SIGNED_OUT: 'signed-out',
  UNAVAILABLE: 'unavailable'
})

export const REMINDER_PREFERENCE_FEEDBACK = Object.freeze({
  CONSENT_REQUIRED: 'consent-required',
  INVALID_DAYS: 'invalid-days',
  INVALID_TIME: 'invalid-time',
  INVALID_TIMEZONE: 'invalid-timezone',
  LOAD_ERROR: 'load-error',
  SAVED: 'saved',
  SAVE_ERROR: 'save-error',
  SIGN_IN_REQUIRED: 'sign-in-required'
})

export const REMINDER_CONSENT_VERSION = 'reminder-email-v1'

const REMINDER_COLUMNS = [
  'user_id',
  'enabled',
  'days',
  'local_time',
  'timezone',
  'locale',
  'consent_granted_at',
  'consent_revoked_at',
  'consent_version',
  'consent_source',
  'created_at',
  'updated_at'
].join(',')
const SUPPORTED_LOCALES = new Set(['en', 'zh-Hant', 'zh-Hans', 'es', 'fr'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d{1,6})?)?$/
const TIMEZONE_PATTERN = /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+)$/

function normalizeDays(value) {
  if (!Array.isArray(value)) return null
  const days = [...new Set(value.map(Number))]
    .filter(day => Number.isInteger(day) && day >= 1 && day <= 7)
    .sort((a, b) => a - b)
  return days.length === value.length && days.length > 0 ? days : null
}

function normalizeLocalTime(value) {
  const match = String(value || '').trim().match(TIME_PATTERN)
  return match ? `${match[1]}:${match[2]}` : null
}

export function isValidIanaTimezone(value, DateTimeFormat = Intl.DateTimeFormat) {
  const timezone = String(value || '').trim()
  if (!TIMEZONE_PATTERN.test(timezone)) return false
  try {
    new DateTimeFormat('en', { timeZone: timezone }).format(new Date(0))
    return true
  } catch {
    return false
  }
}

export function createDefaultReminderPreference({
  locale = 'en',
  timezone = 'UTC'
} = {}) {
  return Object.freeze({
    enabled: false,
    days: Object.freeze([1, 2, 3, 4, 5]),
    localTime: '19:00',
    timezone: isValidIanaTimezone(timezone) ? timezone : 'UTC',
    locale: SUPPORTED_LOCALES.has(locale) ? locale : 'en',
    consentGrantedAt: null,
    consentRevokedAt: null,
    consentVersion: REMINDER_CONSENT_VERSION,
    consentSource: 'settings',
    createdAt: null,
    updatedAt: null
  })
}

function normalizeStoredPreference(row, defaults) {
  if (!row) return defaults
  return Object.freeze({
    enabled: row.enabled === true,
    days: Object.freeze(normalizeDays(row.days) || [...defaults.days]),
    localTime: normalizeLocalTime(row.local_time) || defaults.localTime,
    timezone: isValidIanaTimezone(row.timezone)
      ? String(row.timezone).trim()
      : defaults.timezone,
    locale: SUPPORTED_LOCALES.has(row.locale) ? row.locale : defaults.locale,
    consentGrantedAt: row.consent_granted_at || null,
    consentRevokedAt: row.consent_revoked_at || null,
    consentVersion: row.consent_version || REMINDER_CONSENT_VERSION,
    consentSource: row.consent_source || 'settings',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  })
}

function normalizeSaveInput(input) {
  const days = normalizeDays(input?.days)
  if (!days) return { error: REMINDER_PREFERENCE_FEEDBACK.INVALID_DAYS }
  const localTime = normalizeLocalTime(input?.localTime)
  if (!localTime) return { error: REMINDER_PREFERENCE_FEEDBACK.INVALID_TIME }
  const timezone = String(input?.timezone || '').trim()
  if (!isValidIanaTimezone(timezone)) {
    return { error: REMINDER_PREFERENCE_FEEDBACK.INVALID_TIMEZONE }
  }
  const locale = SUPPORTED_LOCALES.has(input?.locale) ? input.locale : 'en'
  const enabled = input?.enabled === true
  if (enabled && input?.consent !== true) {
    return { error: REMINDER_PREFERENCE_FEEDBACK.CONSENT_REQUIRED }
  }
  return { enabled, days, localTime, timezone, locale }
}

export function createReminderPreferencesController({
  client,
  onStateChange,
  now = () => new Date().toISOString()
}) {
  if (typeof client?.from !== 'function') {
    throw new TypeError('Reminder preferences require a Supabase data client')
  }
  if (typeof onStateChange !== 'function' || typeof now !== 'function') {
    throw new TypeError('Reminder preferences require state callbacks')
  }

  let defaults = createDefaultReminderPreference()
  let currentState = Object.freeze({
    status: REMINDER_PREFERENCE_STATES.SIGNED_OUT,
    userId: null,
    preference: defaults,
    busyAction: null,
    feedback: null
  })
  let requestId = 0

  function publish(patch) {
    currentState = Object.freeze({ ...currentState, ...patch })
    onStateChange(currentState)
    return currentState
  }

  async function loadForUser(userId) {
    const activeRequest = ++requestId
    publish({
      status: REMINDER_PREFERENCE_STATES.LOADING,
      userId,
      preference: defaults,
      busyAction: 'load',
      feedback: null
    })
    try {
      const { data, error } = await client
        .from('reminder_preferences')
        .select(REMINDER_COLUMNS)
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      if (activeRequest !== requestId || currentState.userId !== userId) {
        return currentState
      }
      return publish({
        status: REMINDER_PREFERENCE_STATES.READY,
        preference: normalizeStoredPreference(data, defaults),
        busyAction: null,
        feedback: null
      })
    } catch {
      if (activeRequest !== requestId || currentState.userId !== userId) {
        return currentState
      }
      return publish({
        status: REMINDER_PREFERENCE_STATES.UNAVAILABLE,
        preference: defaults,
        busyAction: null,
        feedback: REMINDER_PREFERENCE_FEEDBACK.LOAD_ERROR
      })
    }
  }

  function synchronizeAccount(accountState, nextDefaults = {}) {
    defaults = createDefaultReminderPreference(nextDefaults)
    const userId = accountState?.userId
    if (
      accountState?.sessionState === ACCOUNT_SESSION_STATES.SIGNED_IN
      && typeof userId === 'string'
      && UUID_PATTERN.test(userId)
    ) {
      if (
        currentState.userId === userId
        && currentState.status !== REMINDER_PREFERENCE_STATES.SIGNED_OUT
      ) {
        return Promise.resolve(currentState)
      }
      return loadForUser(userId)
    }

    requestId += 1
    const status = accountState?.sessionState === ACCOUNT_SESSION_STATES.UNAVAILABLE
      ? REMINDER_PREFERENCE_STATES.UNAVAILABLE
      : accountState?.sessionState === ACCOUNT_SESSION_STATES.LOADING
        ? REMINDER_PREFERENCE_STATES.LOADING
        : REMINDER_PREFERENCE_STATES.SIGNED_OUT
    return Promise.resolve(publish({
      status,
      userId: null,
      preference: defaults,
      busyAction: null,
      feedback: null
    }))
  }

  function retry() {
    if (!currentState.userId) return Promise.resolve(currentState)
    return loadForUser(currentState.userId)
  }

  async function save(input) {
    const userId = currentState.userId
    if (!userId) {
      publish({ feedback: REMINDER_PREFERENCE_FEEDBACK.SIGN_IN_REQUIRED })
      return false
    }
    const normalized = normalizeSaveInput(input)
    if (normalized.error) {
      publish({ feedback: normalized.error })
      return false
    }

    const savedAt = now()
    const prior = currentState.preference
    const consentGrantedAt = normalized.enabled
      ? (prior.enabled && prior.consentGrantedAt) || savedAt
      : prior.consentGrantedAt
    const consentRevokedAt = normalized.enabled
      ? null
      : prior.enabled && prior.consentGrantedAt
        ? savedAt
        : prior.consentRevokedAt
    const draft = Object.freeze({
      ...prior,
      ...normalized,
      consentGrantedAt,
      consentRevokedAt,
      consentVersion: REMINDER_CONSENT_VERSION,
      consentSource: 'settings',
      updatedAt: savedAt
    })
    const activeRequest = ++requestId
    publish({
      status: REMINDER_PREFERENCE_STATES.READY,
      preference: draft,
      busyAction: 'save',
      feedback: null
    })

    const row = {
      user_id: userId,
      enabled: draft.enabled,
      days: draft.days,
      local_time: draft.localTime,
      timezone: draft.timezone,
      locale: draft.locale,
      consent_granted_at: draft.consentGrantedAt,
      consent_revoked_at: draft.consentRevokedAt,
      consent_version: REMINDER_CONSENT_VERSION,
      consent_source: 'settings',
      updated_at: savedAt
    }
    try {
      const { data, error } = await client
        .from('reminder_preferences')
        .upsert(row, { onConflict: 'user_id' })
        .select(REMINDER_COLUMNS)
        .single()
      if (error) throw error
      if (activeRequest !== requestId || currentState.userId !== userId) return false
      publish({
        status: REMINDER_PREFERENCE_STATES.READY,
        preference: normalizeStoredPreference(data, draft),
        busyAction: null,
        feedback: REMINDER_PREFERENCE_FEEDBACK.SAVED
      })
      return true
    } catch {
      if (activeRequest !== requestId || currentState.userId !== userId) return false
      publish({
        status: REMINDER_PREFERENCE_STATES.READY,
        preference: draft,
        busyAction: null,
        feedback: REMINDER_PREFERENCE_FEEDBACK.SAVE_ERROR
      })
      return false
    }
  }

  return Object.freeze({
    getState: () => currentState,
    retry,
    save,
    synchronizeAccount
  })
}
