// Only these stable categories leave the storage boundary. Exception text can
// include saved data; never put it in the UI, clipboard report, or analytics.
export function describeProfileStorageFailure(error) {
  const message = error?.message || ''
  if (message === 'The migrated learner profile is missing') return { code: 'profile-missing', retryable: false }
  if (['Invalid durable learner profile', 'Invalid legacy learner profile', 'Invalid durable profile body', 'Missing durable profile body'].includes(message)
    || error?.name === 'SyntaxError' || error?.name === 'NotFoundError') return { code: 'profile-invalid', retryable: false }
  if (message === 'Profile migration has conflicting durable copies') return { code: 'profile-conflict', retryable: false }
  if (error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return { code: 'storage-full', retryable: true }
  }
  if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') return { code: 'storage-denied', retryable: true }
  return { code: 'storage-unavailable', retryable: true }
}

export function getStorageRecoveryPresentation(failure, { checked = false } = {}) {
  const code = failure?.code || 'storage-unavailable'
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

export function createStorageRecoveryReport({ failure, checked, mode, release }) {
  // Deliberately excludes URLs, credentials, profile contents and identifiers.
  return JSON.stringify({
    diagnostic: 'edenia-storage-recovery-v1',
    code: getStorageRecoveryPresentation(failure).code,
    storageCheckedAgain: checked === true,
    mode: ['auth-trial', 'tiny-swords-test', 'public'].includes(mode) ? mode : 'public',
    release: /^[a-zA-Z0-9._-]{1,80}$/.test(release || '') ? release : null
  }, null, 2)
}
