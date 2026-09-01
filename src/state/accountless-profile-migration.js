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
  emergencyRollbackEnabled = false,
  finalCutoverAt = null,
  onStateChange,
  storage,
  storageKey
}) {
  if (
    typeof clock?.now !== 'function'
    || typeof createOperationId !== 'function'
    || (finalCutoverAt !== null && !Number.isFinite(finalCutoverAt))
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
  let finalGateAcknowledged = false
  let authentication = Object.freeze({
    email: '',
    status: 'loading'
  })
  let currentState = Object.freeze({
    status: ACCOUNTLESS_PROFILE_MIGRATION_STATES.HIDDEN
  })

  function isEntryRequired() {
    return eligible
      && Boolean(record)
      && clock.now() >= getEffectiveFinalGateAt()
      && emergencyRollbackEnabled !== true
  }

  function getEffectiveFinalGateAt() {
    return Number.isFinite(finalCutoverAt)
      ? Math.min(record?.finalGateAt ?? finalCutoverAt, finalCutoverAt)
      : record?.finalGateAt ?? null
  }

  function isAwaitingFinalGateAcknowledgement() {
    return isEntryRequired()
      && !finalGateAcknowledged
      && record?.attempt?.status
        === ACCOUNTLESS_PROFILE_MIGRATION_STATES.AWAITING_AUTHENTICATION
  }

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
      const effectiveFinalGateAt = getEffectiveFinalGateAt()
      const daysRemaining = Math.max(
        0,
        Math.ceil((effectiveFinalGateAt - now) / DAY_MS)
      )
      const common = {
        daysRemaining,
        finalGateAt: effectiveFinalGateAt,
        ...(isEntryRequired() ? { entryRequired: true } : {})
      }
      if (emergencyRollbackEnabled === true) {
        currentState = Object.freeze({
          emergencyRollback: true,
          status: ACCOUNTLESS_PROFILE_MIGRATION_STATES.HIDDEN
        })
      } else if (isAwaitingFinalGateAcknowledgement()) {
        currentState = Object.freeze({
          ...common,
          dismissible: false,
          status: ACCOUNTLESS_PROFILE_MIGRATION_STATES.FINAL_GATE
        })
      } else if (record.attempt) {
        currentState = record.attempt.status
          === ACCOUNTLESS_PROFILE_MIGRATION_STATES.COMPARING
          ? Object.freeze({
              ...common,
              status: ACCOUNTLESS_PROFILE_MIGRATION_STATES.HIDDEN
            })
          : Object.freeze({
              ...common,
              ...(record.attempt.status
                === ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION
                ? { email: authentication.email }
                : {}),
              status: record.attempt.status
            })
      } else if (daysRemaining === 0) {
        currentState = Object.freeze({
          ...common,
          dismissible: false,
          status: ACCOUNTLESS_PROFILE_MIGRATION_STATES.FINAL_GATE
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

  function start({ hasAccountlessProfile, hasLegacyProfile } = {}) {
    eligible = hasAccountlessProfile === true || hasLegacyProfile === true
    finalGateAcknowledged = false
    if (!eligible) return publish()
    record = readRecord(storage, storageKey)
    if (
      record?.attempt?.status
      === ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION
    ) {
      const upgradedRecord = {
        ...record,
        attempt: {
          ...record.attempt,
          status: ACCOUNTLESS_PROFILE_MIGRATION_STATES.AWAITING_AUTHENTICATION
        }
      }
      if (!writeRecord(upgradedRecord)) record = upgradedRecord
    }
    if (!record) {
      const now = clock.now()
      const effectiveFinalGateAt = Number.isFinite(finalCutoverAt)
        ? Math.min(now + GRACE_PERIOD_MS, finalCutoverAt)
        : now + GRACE_PERIOD_MS
      const nextRecord = {
        attempt: null,
        finalGateAt: effectiveFinalGateAt,
        graceStartedAt: effectiveFinalGateAt - GRACE_PERIOD_MS,
        nextNoticeAt: null,
        version: RECORD_VERSION
      }
      if (!writeRecord(nextRecord)) record = nextRecord
    }
    return publish()
  }

  function later() {
    if (!eligible || !record) return false
    if (isEntryRequired()) return false
    if (
      !record.attempt
      && Math.ceil((getEffectiveFinalGateAt() - clock.now()) / DAY_MS) <= 7
    ) return false
    const written = writeRecord({
      ...record,
      attempt: record.attempt?.status
        === ACCOUNTLESS_PROFILE_MIGRATION_STATES.BACKUP_FAILED
        ? record.attempt
        : null,
      nextNoticeAt: clock.now() + NOTICE_SNOOZE_MS
    })
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
    if (!attempt) {
      if (
        eligible
        && record
        && emergencyRollbackEnabled !== true
        && authentication.status === 'signed-in'
      ) {
        const operationId = createOperationId()
        if (typeof operationId === 'string' && operationId) {
          const written = writeRecord({
            ...record,
            attempt: {
              id: operationId,
              retryCount: 0,
              startedAt: clock.now(),
              status: ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
            },
            nextNoticeAt: null
          })
          if (written) return publish()
        }
      }
      return currentState
    }
    let status = attempt.status
    if (
      [
        ACCOUNTLESS_PROFILE_MIGRATION_STATES.AWAITING_AUTHENTICATION,
        ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION
      ].includes(status)
      && emergencyRollbackEnabled !== true
      && authentication.status === 'signed-in'
    ) status = ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
    if (
      [
        ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION,
        ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
      ].includes(status)
      && ['signed-out', 'unavailable'].includes(authentication.status)
    ) status = ACCOUNTLESS_PROFILE_MIGRATION_STATES.AWAITING_AUTHENTICATION
    if (status !== attempt.status) {
      const written = writeRecord({
        ...record,
        attempt: { ...attempt, status }
      })
      if (written) return publish()
    }
    return currentState
  }

  function begin() {
    if (!eligible || !record) return false
    if (record.attempt) {
      if (isAwaitingFinalGateAcknowledgement()) {
        finalGateAcknowledged = true
        publish()
        return true
      }
      return false
    }
    const operationId = createOperationId()
    if (typeof operationId !== 'string' || !operationId) return false
    finalGateAcknowledged = true
    const written = writeRecord({
      ...record,
      attempt: {
        id: operationId,
        retryCount: 0,
        startedAt: clock.now(),
        status: authentication.status === 'signed-in'
          ? ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
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

  function markConflictReady() {
    if (
      record?.attempt?.status
      !== ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
    ) return false
    const written = writeRecord({
      ...record,
      attempt: {
        ...record.attempt,
        status: ACCOUNTLESS_PROFILE_MIGRATION_STATES.COMPARING
      }
    })
    publish()
    return written
  }

  function hasPendingMigration() {
    return Boolean(record?.attempt)
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
        status: authentication.status === 'signed-in'
          ? ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
          : ACCOUNTLESS_PROFILE_MIGRATION_STATES.AWAITING_AUTHENTICATION
      },
      nextNoticeAt: null
    })
    publish()
    return written
  }

  function complete() {
    if (
      ![
        ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING,
        ACCOUNTLESS_PROFILE_MIGRATION_STATES.COMPARING
      ].includes(record?.attempt?.status)
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
    hasPendingMigration,
    isEntryRequired,
    later,
    markSignedInProfilePresent,
    markBackupFailed,
    markConflictReady,
    observeAuthentication,
    refresh: publish,
    retry,
    start
  })
}
