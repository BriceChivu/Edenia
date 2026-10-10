const SAFE_ERROR_NAMES = ['Error','SyntaxError','SecurityError','NotAllowedError','QuotaExceededError','NS_ERROR_DOM_QUOTA_REACHED','NotFoundError','AbortError','UnknownError','InvalidStateError','TransactionInactiveError']
const SAFE_ERROR_MESSAGES = ['The migrated learner profile is missing','Invalid durable learner profile','Invalid legacy learner profile','Invalid durable profile body','Missing durable profile body','Profile migration has conflicting durable copies','Profile database opening timed out','Profile database opening blocked','Profile transaction timed out','Profile transaction failed','IndexedDB is unavailable','Profile migration readback failed or became stale','Profile opening marker readback failed','IndexedDB request failed','IndexedDB backup transaction timed out','IndexedDB backup transaction failed','IndexedDB backup database opening timed out','Could not open IndexedDB backup database','IndexedDB existing backup database opening timed out','IndexedDB backup database open was blocked','Could not open the existing IndexedDB backup database','IndexedDB backup store is missing','IndexedDB contains an invalid state backup','IndexedDB backup change verification failed']
// Only these stable categories leave the storage boundary. Exception text can
// include saved data; never put it in the UI, clipboard report, or analytics.
export function describeProfileStorageFailure(error) {
  const message = error?.message || ''
  const detail = { errorName: SAFE_ERROR_NAMES.includes(error?.name) ? error.name : null, errorMessage: SAFE_ERROR_MESSAGES.includes(message) ? message : null }
  if (message === 'The migrated learner profile is missing') return { ...detail, code: 'profile-missing', retryable: false }
  if (['Invalid durable learner profile', 'Invalid legacy learner profile', 'Invalid durable profile body', 'Missing durable profile body'].includes(message)
    || error?.name === 'SyntaxError' || error?.name === 'NotFoundError') return { ...detail, code: 'profile-invalid', retryable: false }
  if (message === 'Profile migration has conflicting durable copies') return { ...detail, code: 'profile-conflict', retryable: false }
  if (error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return { ...detail, code: 'storage-full', retryable: true }
  }
  if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') return { ...detail, code: 'storage-denied', retryable: true }
  return { ...detail, code: 'storage-unavailable', retryable: true }
}

export function getStorageRecoveryPresentation(failure, { checked = false } = {}) {
  const code = ['profile-missing','profile-invalid','profile-conflict','storage-full','storage-denied','storage-unavailable','storage-recovered'].includes(failure?.code) ? failure.code : 'storage-unavailable'
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
  operation, recovery, capabilities = {}, storageState = {} }) {
  // Deliberately excludes URLs, credentials, profile contents and identifiers.
  return JSON.stringify({
    diagnostic: 'edenia-storage-recovery-v1',
    code: getStorageRecoveryPresentation(failure).code,
    storageCheckedAgain: checked === true,
    error: {
      name: SAFE_ERROR_NAMES.includes(failure?.errorName) ? failure.errorName : null,
      message: SAFE_ERROR_MESSAGES.includes(failure?.errorMessage) ? failure.errorMessage : null
    },
    mode: ['auth-trial', 'tiny-swords-test', 'public'].includes(mode) ? mode : 'public',
    release: /^[a-zA-Z0-9._-]{1,80}$/.test(release || '') ? release : null,
    operation: ['open','save','recovery','reconcile'].includes(operation) ? operation : null,
    recovery: ['local','session','memory','none'].includes(recovery) ? recovery : null,
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
