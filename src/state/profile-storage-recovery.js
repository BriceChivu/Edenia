const FAILURE_CONTEXTS = new WeakMap()
const STORAGE_TARGETS = ['primary-profile', 'backup', 'recovery-journal', 'web-storage']
const STORAGE_PHASES = ['database-open', 'transaction-open', 'transaction-complete', 'request', 'readback', 'workspace-write', 'promotion']
export const sanitizeStorageDiagnosticId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value) ? value : null
// Attach only internal, bounded context. Native exception messages can contain data.
export function annotateStorageFailure(error, storageTarget, phase, storageOperation) {
  if (error && typeof error === 'object') {
    const previous = FAILURE_CONTEXTS.get(error)
    FAILURE_CONTEXTS.set(error, {
      storageTarget: STORAGE_TARGETS.includes(storageTarget) ? storageTarget : undefined,
      phase: STORAGE_PHASES.includes(phase) ? phase : undefined,
      ...previous,
      ...(!previous?.storageOperation && storageOperation ? { storageOperation: sanitizeStorageOperation(storageOperation) } : {})
    })
  }
  return error
}

const SAFE_ERROR_NAMES = ['Error','SyntaxError','SecurityError','NotAllowedError','QuotaExceededError','NS_ERROR_DOM_QUOTA_REACHED','NotFoundError','AbortError','UnknownError','InvalidStateError','TransactionInactiveError','DataError','VersionError','ConstraintError','ReadOnlyError','DataCloneError']
const OPERATION_EVENTS = ['request-error', 'abort', 'timeout', 'request-exception', 'database-error', 'database-blocked']
export function sanitizeStorageOperation(value) {
  if (!value || typeof value !== 'object') return undefined
  // Coarse, capped durations cannot be used to smuggle arbitrary data or exact
  // wall-clock times through an offline outbox entry.
  const duration = number => typeof number === 'number' && Number.isFinite(number)
    ? Math.round(Math.max(0, Math.min(86400000, number)) / 100) * 100 : undefined
  const visibility = state => ['visible', 'hidden'].includes(state) ? state : 'unknown'
  const lifecycle = value.lifecycle || {}
  return {
    elapsedMs: duration(value.elapsedMs), timeoutMs: duration(value.timeoutMs), timerLatenessMs: duration(value.timerLatenessMs),
    mode: ['readonly', 'readwrite', 'versionchange', 'open'].includes(value.mode) ? value.mode : 'unknown',
    requestState: ['pending', 'responded'].includes(value.requestState) ? value.requestState : 'unknown',
    eventType: OPERATION_EVENTS.includes(value.eventType) ? value.eventType : 'unknown',
    lifecycle: {
      visibilityAtStart: visibility(lifecycle.visibilityAtStart), visibilityAtEnd: visibility(lifecycle.visibilityAtEnd),
      hiddenDuringOperation: lifecycle.hiddenDuringOperation === true,
      frozenDuringOperation: lifecycle.frozenDuringOperation === true,
      resumedDuringOperation: lifecycle.resumedDuringOperation === true,
      pageHiddenDuringOperation: lifecycle.pageHiddenDuringOperation === true,
      pageRestoredDuringOperation: lifecycle.pageRestoredDuringOperation === true,
      wasDiscarded: lifecycle.wasDiscarded === true
    }
  }
}
const SAFE_ERROR_MESSAGES = ['The migrated learner profile is missing','Invalid durable learner profile','Invalid legacy learner profile','Invalid durable profile body','Missing durable profile body','Profile migration has conflicting durable copies','Profile database opening timed out','Profile database opening blocked','Profile transaction timed out','Profile transaction failed','IndexedDB is unavailable','Profile migration readback failed or became stale','Profile opening marker readback failed','IndexedDB request failed','IndexedDB backup transaction timed out','IndexedDB backup transaction failed','IndexedDB backup database opening timed out','Could not open IndexedDB backup database','IndexedDB existing backup database opening timed out','IndexedDB backup database open was blocked','Could not open the existing IndexedDB backup database','IndexedDB backup store is missing','IndexedDB contains an invalid state backup','IndexedDB backup change verification failed','Recovery archive opening timed out','Recovery archive opening blocked','Recovery archive transaction timed out','Recovery archive transaction failed','Invalid recovery archive']
// Only these stable categories leave the storage boundary. Exception text can
// include saved data; never put it in the UI, clipboard report, or analytics.
export function describeProfileStorageFailure(error) {
  const message = error?.message || ''
  const detail = { ...FAILURE_CONTEXTS.get(error), errorName: SAFE_ERROR_NAMES.includes(error?.name) ? error.name : null, errorMessage: SAFE_ERROR_MESSAGES.includes(message) ? message : null }
  if (message === 'The migrated learner profile is missing') return { ...detail, code: 'profile-missing', retryable: false }
  if (['Invalid durable learner profile', 'Invalid legacy learner profile', 'Invalid durable profile body', 'Missing durable profile body'].includes(message)
    || error?.name === 'SyntaxError' || error?.name === 'NotFoundError' || error?.name === 'DataError') return { ...detail, code: 'profile-invalid', retryable: false }
  if (message === 'Profile migration has conflicting durable copies') return { ...detail, code: 'profile-conflict', retryable: false }
  if (error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return { ...detail, code: 'storage-full', retryable: true }
  }
  if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') return { ...detail, code: 'storage-denied', retryable: true }
  return { ...detail, code: 'storage-unavailable', retryable: true }
}

export function getStorageRecoveryPresentation(failure, { checked = false } = {}) {
  const code = ['profile-missing','profile-invalid','profile-conflict','storage-full','storage-denied','storage-unavailable','storage-fallback-saved','storage-recovered'].includes(failure?.code) ? failure.code : 'storage-unavailable'
  const needsRepair = failure?.retryable === false
  return {
    code,
    canCheck: !needsRepair && !checked,
    titleKey: needsRepair ? 'onboarding.recovery.saved.title' : 'onboarding.recovery.storage.title',
    bodyKey: needsRepair ? 'onboarding.recovery.saved.body'
      : code === 'storage-full' ? 'onboarding.recovery.full.body'
      : code === 'storage-denied' ? 'onboarding.recovery.denied.body'
      : 'onboarding.recovery.storage.body'
  }
}

export function createStorageRecoveryReport({ failure, checked, mode, release,
  operation, recovery, outcome, incidentId, testRunId, capabilities = {}, storageState = {} }) {
  // Deliberately excludes URLs, credentials, profile contents and account identifiers.
  const code = getStorageRecoveryPresentation(failure).code
  const finalOutcome = code === 'storage-recovered' ? 'recovered'
    : (outcome === 'fallback-saved' || code === 'storage-fallback-saved') && ['local', 'indexed-db'].includes(recovery)
      ? 'fallback-saved' : 'failure'
  return JSON.stringify({
    diagnostic: 'edenia-storage-recovery-v1',
    code,
    outcome: finalOutcome,
    storageCheckedAgain: checked === true,
    error: {
      name: SAFE_ERROR_NAMES.includes(failure?.errorName) ? failure.errorName : null,
      message: SAFE_ERROR_MESSAGES.includes(failure?.errorMessage) ? failure.errorMessage : null
    },
    mode: ['auth-trial', 'tiny-swords-test', 'public'].includes(mode) ? mode : 'public',
    release: /^[a-zA-Z0-9._-]{1,80}$/.test(release || '') ? release : null,
    operation: ['open','save','recovery','reconcile'].includes(operation) ? operation : null,
    incidentId: sanitizeStorageDiagnosticId(incidentId) || undefined,
    testRunId: sanitizeStorageDiagnosticId(testRunId) || undefined,
    storageTarget: STORAGE_TARGETS.includes(failure?.storageTarget) ? failure.storageTarget : undefined,
    phase: STORAGE_PHASES.includes(failure?.phase) ? failure.phase : undefined,
    storageOperation: sanitizeStorageOperation(failure?.storageOperation),
    recovery: ['local','session','indexed-db','memory','none'].includes(recovery) ? recovery : null,
    storageState: {
      migrationMarker: ['1','empty'].includes(storageState.migrationMarker) ? storageState.migrationMarker : null,
      accessMetadataPresent: storageState.accessMetadataPresent === true,
      cloudOperationPresent: storageState.cloudOperationPresent === true
    },
    capabilities: {
      indexedDb: capabilities.indexedDb === true,
      secureContext: capabilities.secureContext === true,
      online: capabilities.online !== false,
      // Extract only browser/OS product versions, not arbitrary user-agent text.
      browser: String(capabilities.browser || '').match(/(?:Chrome|CriOS|Firefox|FxiOS|Version|Edg|SamsungBrowser)\/[0-9.]+/g)?.join(' ') || null,
      platform: String(capabilities.browser || '').match(/Android [0-9.]+|iPhone OS [0-9_]+|Windows NT [0-9.]+|Mac OS X [0-9_]+/)?.[0] || null
    }
  }, null, 2)
}
