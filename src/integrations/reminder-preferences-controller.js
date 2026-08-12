import { ACCOUNT_SESSION_STATES } from './account-auth-controller.js'

export const REMINDER_PREFERENCE_STATES = Object.freeze({
  LOADING: 'loading',
  READY: 'ready',
  SIGNED_OUT: 'signed-out',
  UNAVAILABLE: 'unavailable'
})

export const REMINDER_PREFERENCE_FEEDBACK = Object.freeze({
  INVALID_PREFERENCE: 'invalid-preference',
  LOAD_ERROR: 'load-error',
  SAVED: 'saved',
  SAVE_ERROR: 'save-error',
  SIGN_IN_REQUIRED: 'sign-in-required'
})

export const REMINDER_CONSENT_VERSION = 'edenia-email-preferences-v2'

const REMINDER_COLUMNS = [
  'user_id',
  'streak_reminders_enabled',
  'discovery_emails_enabled',
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
const TIMEZONE_PATTERN = /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+)$/

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
    streakRemindersEnabled: true,
    discoveryEmailsEnabled: true,
    timezone: isValidIanaTimezone(timezone) ? timezone : 'UTC',
    locale: SUPPORTED_LOCALES.has(locale) ? locale : 'en',
    consentGrantedAt: null,
    consentRevokedAt: null,
    consentVersion: REMINDER_CONSENT_VERSION,
    consentSource: 'account-default',
    createdAt: null,
    updatedAt: null
  })
}

function normalizeStoredPreference(row, defaults) {
  if (!row) return defaults
  return Object.freeze({
    streakRemindersEnabled: row.streak_reminders_enabled === true,
    discoveryEmailsEnabled: row.discovery_emails_enabled === true,
    timezone: isValidIanaTimezone(row.timezone)
      ? String(row.timezone).trim()
      : defaults.timezone,
    locale: SUPPORTED_LOCALES.has(row.locale) ? row.locale : defaults.locale,
    consentGrantedAt: row.consent_granted_at || null,
    consentRevokedAt: row.consent_revoked_at || null,
    consentVersion: row.consent_version || REMINDER_CONSENT_VERSION,
    consentSource: row.consent_source || 'account-default',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  })
}

function getPreferenceRow(userId, preference) {
  return {
    user_id: userId,
    enabled: false,
    streak_reminders_enabled: preference.streakRemindersEnabled,
    discovery_emails_enabled: preference.discoveryEmailsEnabled,
    timezone: preference.timezone,
    locale: preference.locale,
    consent_granted_at: preference.consentGrantedAt,
    consent_revoked_at: preference.consentRevokedAt,
    consent_version: REMINDER_CONSENT_VERSION,
    consent_source: preference.consentSource,
    updated_at: preference.updatedAt
  }
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

  async function createForUser(userId, activeRequest) {
    const savedAt = now()
    const preference = Object.freeze({
      ...defaults,
      consentGrantedAt: savedAt,
      consentRevokedAt: null,
      consentSource: 'account-default',
      updatedAt: savedAt
    })
    const { data, error } = await client
      .from('reminder_preferences')
      .insert(getPreferenceRow(userId, preference))
      .select(REMINDER_COLUMNS)
      .single()
    if (error?.code === '23505') {
      const { data: existing, error: reloadError } = await client
        .from('reminder_preferences')
        .select(REMINDER_COLUMNS)
        .eq('user_id', userId)
        .maybeSingle()
      if (reloadError || !existing) throw reloadError || error
      if (activeRequest !== requestId || currentState.userId !== userId) {
        return currentState
      }
      return publish({
        status: REMINDER_PREFERENCE_STATES.READY,
        preference: normalizeStoredPreference(existing, preference),
        busyAction: null,
        feedback: null
      })
    }
    if (error) throw error
    if (activeRequest !== requestId || currentState.userId !== userId) {
      return currentState
    }
    return publish({
      status: REMINDER_PREFERENCE_STATES.READY,
      preference: normalizeStoredPreference(data, preference),
      busyAction: null,
      feedback: null
    })
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
      if (!data) return createForUser(userId, activeRequest)
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
    if (
      currentState.status !== REMINDER_PREFERENCE_STATES.READY
      || currentState.busyAction
      || typeof input?.streakRemindersEnabled !== 'boolean'
      || typeof input?.discoveryEmailsEnabled !== 'boolean'
    ) {
      publish({ feedback: REMINDER_PREFERENCE_FEEDBACK.INVALID_PREFERENCE })
      return false
    }

    const savedAt = now()
    const prior = currentState.preference
    const wasEnabled = prior.streakRemindersEnabled || prior.discoveryEmailsEnabled
    const isEnabled = input.streakRemindersEnabled || input.discoveryEmailsEnabled
    const consentGrantedAt = isEnabled
      ? (wasEnabled && !prior.consentRevokedAt && prior.consentGrantedAt) || savedAt
      : prior.consentGrantedAt
    const consentRevokedAt = isEnabled
      ? null
      : wasEnabled && prior.consentGrantedAt
        ? savedAt
        : prior.consentRevokedAt
    const draft = Object.freeze({
      ...prior,
      streakRemindersEnabled: input.streakRemindersEnabled,
      discoveryEmailsEnabled: input.discoveryEmailsEnabled,
      timezone: defaults.timezone,
      locale: defaults.locale,
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

    try {
      const { data, error } = await client
        .from('reminder_preferences')
        .upsert(getPreferenceRow(userId, draft), { onConflict: 'user_id' })
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
        preference: prior,
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
