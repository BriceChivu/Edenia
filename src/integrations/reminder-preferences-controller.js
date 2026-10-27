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
  SIGN_IN_REQUIRED: 'sign-in-required',
  STALE: 'stale',
  ENROLLED: 'enrolled',
  ENROLLMENT_BLOCKED: 'enrollment-blocked'
})

export const REMINDER_CONSENT_VERSION = 'edenia-email-enrollment-v3'

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
    updatedAt: null,
    enrollmentEpoch: 0,
    streakChoiceVersion: 0,
    discoveryChoiceVersion: 0,
    streakEnrollmentVersion: null,
    discoveryEnrollmentVersion: null,
    deliveryPaused: true,
    enrollmentBlocked: false
  })
}

function normalizeStoredPreference(row, defaults) {
  if (!row || typeof row.streak_reminders_enabled !== 'boolean' || typeof row.discovery_emails_enabled !== 'boolean') {
    throw new TypeError('Invalid stored reminder choices')
  }
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
    updatedAt: row.updated_at || null,
    enrollmentEpoch: row.enrollment_epoch ?? 0,
    streakChoiceVersion: row.streak_choice_version ?? 0,
    discoveryChoiceVersion: row.discovery_choice_version ?? 0,
    streakEnrollmentVersion: row.streak_enrollment_version || null,
    discoveryEnrollmentVersion: row.discovery_enrollment_version || null,
    deliveryPaused: row.delivery_paused !== false,
    enrollmentBlocked: row.enrollment_blocked === true
  })
}

export function createReminderPreferencesController({
  client,
  onStateChange
}) {
  if (typeof client?.rpc !== 'function') {
    throw new TypeError('Reminder preferences require a Supabase data client')
  }
  if (typeof onStateChange !== 'function') {
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
      const { data, error } = await client.rpc('get_my_reminder_preferences', {
        p_timezone: defaults.timezone, p_locale: defaults.locale, p_expected_owner: userId
      })
      if (error) throw error
      if (activeRequest !== requestId || currentState.userId !== userId) {
        return currentState
      }
      if (!data || data.user_id !== userId) throw new Error('Missing owner reminder preferences')
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

  async function mutate(action, rpc, args, draft) {
    const userId = currentState.userId
    const prior = currentState.preference
    const activeRequest = ++requestId
    publish({ preference: draft || prior, busyAction: action, feedback: null })
    try {
      const { data, error } = await client.rpc(rpc, { ...args, p_expected_owner: userId })
      if (error || !data || data.user_id !== userId) throw error || new Error('Missing owner reminder response')
      if (activeRequest !== requestId || currentState.userId !== userId) return false
      publish({ preference: normalizeStoredPreference(data, prior), busyAction: null,
        feedback: action === 'enroll' ? REMINDER_PREFERENCE_FEEDBACK.ENROLLED : REMINDER_PREFERENCE_FEEDBACK.SAVED })
      return true
    } catch (error) {
      if (activeRequest !== requestId || currentState.userId !== userId) return false
      if (error?.code === '40001') {
        await loadForUser(userId)
        if (currentState.userId === userId && currentState.status === REMINDER_PREFERENCE_STATES.READY) {
          publish({ feedback: REMINDER_PREFERENCE_FEEDBACK.STALE })
        }
      } else {
        publish({ preference: prior, busyAction: null,
          feedback: error?.message === 'reminder_enrollment_suppressed'
            ? REMINDER_PREFERENCE_FEEDBACK.ENROLLMENT_BLOCKED : REMINDER_PREFERENCE_FEEDBACK.SAVE_ERROR })
      }
      return false
    }
  }

  function canMutate() {
    if (!currentState.userId) {
      publish({ feedback: REMINDER_PREFERENCE_FEEDBACK.SIGN_IN_REQUIRED })
      return false
    }
    if (currentState.status !== REMINDER_PREFERENCE_STATES.READY || currentState.busyAction) return false
    return true
  }

  async function save(input) {
    if (!canMutate()) return false
    const prior = currentState.preference
    const choices = [
      ['streakRemindersEnabled', 'streak', 'streakChoiceVersion'],
      ['discoveryEmailsEnabled', 'discovery', 'discoveryChoiceVersion']
    ]
    const supplied = choices.filter(([field]) => Object.hasOwn(input || {}, field))
    const changed = supplied.filter(([field]) => input[field] !== prior[field])
    if (!supplied.length || supplied.some(([field]) => typeof input[field] !== 'boolean') || changed.length > 1) {
      publish({ feedback: REMINDER_PREFERENCE_FEEDBACK.INVALID_PREFERENCE })
      return false
    }
    if (!changed.length) return true
    const [field, choice, version] = changed[0]
    return mutate('save', 'save_my_reminder_choice', {
      p_choice: choice, p_enabled: input[field], p_expected_version: prior[version],
      p_enrollment_epoch: prior.enrollmentEpoch, p_timezone: defaults.timezone, p_locale: defaults.locale
    }, Object.freeze({ ...prior, [field]: input[field] }))
  }

  async function enroll() {
    if (!canMutate()) return false
    const prior = currentState.preference
    if (prior.enrollmentBlocked) {
      publish({ feedback: REMINDER_PREFERENCE_FEEDBACK.ENROLLMENT_BLOCKED })
      return false
    }
    if (!prior.streakRemindersEnabled && !prior.discoveryEmailsEnabled) return false
    return mutate('enroll', 'enroll_my_reminder_choices', {
      p_streak: prior.streakRemindersEnabled, p_discovery: prior.discoveryEmailsEnabled,
      p_streak_version: prior.streakChoiceVersion, p_discovery_version: prior.discoveryChoiceVersion,
      p_enrollment_epoch: prior.enrollmentEpoch
    })
  }

  return Object.freeze({
    getState: () => currentState,
    retry,
    save,
    enroll,
    synchronizeAccount
  })
}
