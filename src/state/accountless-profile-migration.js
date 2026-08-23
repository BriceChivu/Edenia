import {
  ACCOUNTLESS_PROFILE_MIGRATION_ATTEMPT_STATES,
  ACCOUNTLESS_PROFILE_MIGRATION_STATES
} from '../domain/accountless-profile-migration.js'

const DAY_MS = 24 * 60 * 60 * 1000
const GRACE_PERIOD_MS = 30 * DAY_MS
const NOTICE_SNOOZE_MS = DAY_MS
const RECORD_VERSION = 1
const ATTEMPT_STATUSES = new Set(
  ACCOUNTLESS_PROFILE_MIGRATION_ATTEMPT_STATES
)

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readRecord(storage, storageKey) {
  try {
    const value = JSON.parse(storage.getItem(storageKey))
    if (
      !isRecord(value)
      || value.version !== RECORD_VERSION
      || !Number.isFinite(value.graceStartedAt)
      || !Number.isFinite(value.finalGateAt)
      || value.finalGateAt - value.graceStartedAt < GRACE_PERIOD_MS
      || (
        value.nextNoticeAt !== null
        && !Number.isFinite(value.nextNoticeAt)
      )
      || (
        value.attempt !== null
        && (
          !isRecord(value.attempt)
          || typeof value.attempt.id !== 'string'
          || !value.attempt.id
          || !Number.isFinite(value.attempt.startedAt)
          || !Number.isSafeInteger(value.attempt.retryCount)
          || value.attempt.retryCount < 0
          || !ATTEMPT_STATUSES.has(value.attempt.status)
        )
      )
    ) return null
    return value
  } catch {
    return null
  }
}

export function createAccountlessProfileMigrationController({
  clock,
  createOperationId,
  onStateChange,
  storage,
  storageKey
}) {
  if (
    typeof clock?.now !== 'function'
    || typeof createOperationId !== 'function'
    || typeof onStateChange !== 'function'
    || typeof storage?.getItem !== 'function'
    || typeof storage?.removeItem !== 'function'
    || typeof storage?.setItem !== 'function'
    || typeof storageKey !== 'string'
    || !storageKey
  ) {
    throw new TypeError('Accountless-profile migration requires browser adapters')
  }

  let eligible = false
  let record = null
  let confirmedSessionForAttempt = false
  let authentication = Object.freeze({
    email: '',
    status: 'loading'
  })
  let currentState = Object.freeze({
    status: ACCOUNTLESS_PROFILE_MIGRATION_STATES.HIDDEN
  })

  function writeRecord(nextRecord) {
    try {
      storage.setItem(storageKey, JSON.stringify(nextRecord))
      const written = readRecord(storage, storageKey)
      if (!written) return false
      record = written
      return true
    } catch {
      return false
    }
  }

  function publish() {
    if (!eligible || !record) {
      currentState = Object.freeze({
        status: ACCOUNTLESS_PROFILE_MIGRATION_STATES.HIDDEN
      })
    } else {
      const now = clock.now()
      const daysRemaining = Math.max(
        0,
        Math.ceil((record.finalGateAt - now) / DAY_MS)
      )
      const common = {
        daysRemaining,
        finalGateAt: record.finalGateAt
      }
      if (record.attempt) {
        currentState = Object.freeze({
          ...common,
          ...(record.attempt.status
            === ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION
            ? { email: authentication.email }
            : {}),
          status: record.attempt.status
        })
      } else if (daysRemaining <= 7) {
        currentState = Object.freeze({
          ...common,
          dismissible: false,
          status: ACCOUNTLESS_PROFILE_MIGRATION_STATES.COUNTDOWN,
          urgencyLevel: Math.min(8, Math.max(1, 8 - daysRemaining))
        })
      } else {
        currentState = Object.freeze({
          ...common,
          status: Number.isFinite(record.nextNoticeAt)
            && record.nextNoticeAt > now
            ? ACCOUNTLESS_PROFILE_MIGRATION_STATES.HIDDEN
            : ACCOUNTLESS_PROFILE_MIGRATION_STATES.NOTICE
        })
      }
    }
    onStateChange(currentState)
    return currentState
  }

  function start({ hasAccountlessProfile } = {}) {
    eligible = hasAccountlessProfile === true
    if (!eligible) return publish()
    record = readRecord(storage, storageKey)
    if (!record) {
      const now = clock.now()
      if (!writeRecord({
        attempt: null,
        finalGateAt: now + GRACE_PERIOD_MS,
        graceStartedAt: now,
        nextNoticeAt: null,
        version: RECORD_VERSION
      })) return publish()
    }
    return publish()
  }

  function later() {
    if (!eligible || !record) return false
    if (
      !record.attempt
      && Math.ceil((record.finalGateAt - clock.now()) / DAY_MS) <= 7
    ) return false
    const written = writeRecord({
      ...record,
      attempt: record.attempt?.status
        === ACCOUNTLESS_PROFILE_MIGRATION_STATES.BACKUP_FAILED
        ? record.attempt
        : null,
      nextNoticeAt: clock.now() + NOTICE_SNOOZE_MS
    })
    if (written && record.attempt === null) {
      confirmedSessionForAttempt = false
    }
    publish()
    return written
  }

  function observeAuthentication(observation = {}) {
    authentication = Object.freeze({
      email: typeof observation.email === 'string'
        ? observation.email.trim()
        : '',
      status: typeof observation.status === 'string'
        ? observation.status
        : typeof observation.sessionState === 'string'
          ? observation.sessionState
          : 'unavailable'
    })
    const attempt = record?.attempt
    if (!attempt) return publish()
    if (['signed-out', 'unavailable'].includes(authentication.status)) {
      confirmedSessionForAttempt = false
    }
    let status = attempt.status
    if (
      status === ACCOUNTLESS_PROFILE_MIGRATION_STATES.AWAITING_AUTHENTICATION
      && authentication.status === 'signed-in'
    ) status = ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION
    if (
      status === ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
      && authentication.status === 'signed-in'
      && !confirmedSessionForAttempt
    ) status = ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION
    if (
      [
        ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION,
        ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
      ].includes(status)
      && ['signed-out', 'unavailable'].includes(authentication.status)
    ) status = ACCOUNTLESS_PROFILE_MIGRATION_STATES.AWAITING_AUTHENTICATION
    if (status !== attempt.status) {
      writeRecord({
        ...record,
        attempt: { ...attempt, status }
      })
    }
    return publish()
  }

  function begin() {
    if (!eligible || !record || record.attempt) return false
    const operationId = createOperationId()
    if (typeof operationId !== 'string' || !operationId) return false
    confirmedSessionForAttempt = false
    const written = writeRecord({
      ...record,
      attempt: {
        id: operationId,
        retryCount: 0,
        startedAt: clock.now(),
        status: authentication.status === 'signed-in'
          ? ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION
          : ACCOUNTLESS_PROFILE_MIGRATION_STATES.AWAITING_AUTHENTICATION
      },
      nextNoticeAt: null
    })
    publish()
    return written
  }

  function confirmInheritedSession() {
    if (
      authentication.status !== 'signed-in'
      || record?.attempt?.status
        !== ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION
    ) return false
    const written = writeRecord({
      ...record,
      attempt: {
        ...record.attempt,
        status: ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
      }
    })
    if (written) confirmedSessionForAttempt = true
    publish()
    return written
  }

  function getAttachment() {
    return record?.attempt?.status
      === ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
      ? Object.freeze({ operationId: record.attempt.id })
      : null
  }

  function markBackupFailed() {
    if (
      record?.attempt?.status
      !== ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
    ) return false
    const written = writeRecord({
      ...record,
      attempt: {
        ...record.attempt,
        status: ACCOUNTLESS_PROFILE_MIGRATION_STATES.BACKUP_FAILED
      }
    })
    publish()
    return written
  }

  function markSignedInProfilePresent() {
    if (
      record?.attempt?.status
      !== ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
    ) return false
    const written = writeRecord({
      ...record,
      attempt: {
        ...record.attempt,
        status: ACCOUNTLESS_PROFILE_MIGRATION_STATES.SIGNED_IN_PROFILE_PRESENT
      }
    })
    publish()
    return written
  }

  function retry() {
    if (
      record?.attempt?.status
      !== ACCOUNTLESS_PROFILE_MIGRATION_STATES.BACKUP_FAILED
    ) return false
    const written = writeRecord({
      ...record,
      attempt: {
        ...record.attempt,
        retryCount: record.attempt.retryCount + 1,
        status: authentication.status !== 'signed-in'
          ? ACCOUNTLESS_PROFILE_MIGRATION_STATES.AWAITING_AUTHENTICATION
          : confirmedSessionForAttempt
            ? ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
            : ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION
      },
      nextNoticeAt: null
    })
    publish()
    return written
  }

  function complete() {
    if (
      record?.attempt?.status
      !== ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
    ) return false
    try {
      storage.removeItem(storageKey)
      if (storage.getItem(storageKey) !== null) return false
      record = null
      eligible = false
      publish()
      return true
    } catch {
      return false
    }
  }

  return Object.freeze({
    begin,
    complete,
    confirmInheritedSession,
    getAttachment,
    getState: () => currentState,
    later,
    markSignedInProfilePresent,
    markBackupFailed,
    observeAuthentication,
    refresh: publish,
    retry,
    start
  })
}
