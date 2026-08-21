const PROFILE_ACCESS_RECORD_VERSION = 1

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNullableString(value) {
  return value === null || (typeof value === 'string' && Boolean(value))
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function readAccessRecord(storage, accessStorageKey) {
  const serialized = storage.getItem(accessStorageKey)
  if (serialized === null) return { present: false, record: null }
  try {
    const record = JSON.parse(serialized)
    if (
      !isRecord(record)
      || record.version !== PROFILE_ACCESS_RECORD_VERSION
      || typeof record.profileId !== 'string'
      || !record.profileId
      || !isNullableString(record.ownerId)
      || !isNullableString(record.activationId)
      || (
        record.generation !== undefined
        && !isPositiveInteger(record.generation)
      )
      || (
        record.revision !== undefined
        && !isPositiveInteger(record.revision)
      )
      || ((record.generation === undefined) !== (record.revision === undefined))
      || (
        record.onboardingFinalizationPending !== undefined
        && typeof record.onboardingFinalizationPending !== 'boolean'
      )
      || !Number.isFinite(record.activatedAt)
    ) return { present: true, record: null }
    return {
      present: true,
      record: {
        ...record,
        onboardingFinalizationPending:
          record.onboardingFinalizationPending === true
      }
    }
  } catch {
    return { present: true, record: null }
  }
}

function isValidFence(fence) {
  return isRecord(fence)
    && typeof fence.id === 'string'
    && Boolean(fence.id)
    && typeof fence.profileId === 'string'
    && Boolean(fence.profileId)
    && isNullableString(fence.ownerId)
    && Number.isFinite(fence.activatedAt)
}

export function createLearnerProfileLocalPersistenceAdapter({
  accessStorageKey,
  accountlessProfileId,
  eventTarget,
  hasProfile = () => true,
  loadProfile,
  replaceProfile,
  saveProfile,
  storage
}) {
  function read() {
    let profile
    let access
    try {
      profile = hasProfile() ? loadProfile() : null
      access = readAccessRecord(storage, accessStorageKey)
    } catch {
      return { status: 'invalid' }
    }
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      return access.present ? { status: 'invalid' } : { status: 'empty' }
    }
    if (access.present && !access.record) return { status: 'invalid' }
    const localProfile = {
      ownerId: access.record?.ownerId || null,
      profile,
      profileId: access.record?.profileId || accountlessProfileId,
      status: 'ready'
    }
    if (
      isPositiveInteger(access.record?.generation)
      && isPositiveInteger(access.record?.revision)
    ) {
      localProfile.generation = access.record.generation
      localProfile.revision = access.record.revision
    }
    if (access.record?.onboardingFinalizationPending === true) {
      localProfile.onboardingFinalizationPending = true
    }
    return localProfile
  }

  function installSignedInProfile(profile, {
    generation,
    installedAt,
    onboardingFinalizationPending = false,
    ownerId,
    profileId,
    revision
  }) {
    if (
      !isRecord(profile)
      || typeof onboardingFinalizationPending !== 'boolean'
      || typeof ownerId !== 'string'
      || !ownerId
      || typeof profileId !== 'string'
      || !profileId
      || !isPositiveInteger(generation)
      || !isPositiveInteger(revision)
      || !Number.isFinite(installedAt)
    ) return false
    if (hasProfile()) return false
    const record = {
      activatedAt: installedAt,
      activationId: null,
      generation,
      onboardingFinalizationPending,
      ownerId,
      profileId,
      revision,
      version: PROFILE_ACCESS_RECORD_VERSION
    }
    const isInstallCurrent = () => {
      const current = readAccessRecord(storage, accessStorageKey).record
      return current?.activationId === null
        && current.ownerId === ownerId
        && current.profileId === profileId
        && current.generation === generation
        && current.revision === revision
    }
    try {
      storage.setItem(accessStorageKey, JSON.stringify(record))
      if (!isInstallCurrent()) return false
      const result = replaceProfile(profile, {
        syncAnalytics: false
      }, isInstallCurrent)
      if (result?.persisted && isInstallCurrent()) return true
      if (!hasProfile() && isInstallCurrent()) {
        storage.removeItem(accessStorageKey)
      }
      return false
    } catch {
      try {
        if (!hasProfile() && isInstallCurrent()) {
          storage.removeItem(accessStorageKey)
        }
      } catch {}
      return false
    }
  }

  function claimActivation(fence) {
    if (!isValidFence(fence)) return false
    const current = readAccessRecord(storage, accessStorageKey).record
    const record = {
      activatedAt: fence.activatedAt,
      activationId: fence.id,
      generation: current?.generation,
      onboardingFinalizationPending: Boolean(
        current?.onboardingFinalizationPending
        && current.ownerId === fence.ownerId
        && current.profileId === fence.profileId
      ),
      ownerId: fence.ownerId,
      profileId: fence.profileId,
      revision: current?.revision,
      version: PROFILE_ACCESS_RECORD_VERSION
    }
    try {
      storage.setItem(accessStorageKey, JSON.stringify(record))
      return isActivationCurrent(fence)
    } catch {
      return false
    }
  }

  function reconcileSignedInProfile(profile, {
    generation,
    ownerId,
    profileId,
    revision
  }) {
    if (
      !isRecord(profile)
      || typeof ownerId !== 'string'
      || !ownerId
      || typeof profileId !== 'string'
      || !profileId
      || !isPositiveInteger(generation)
      || !isPositiveInteger(revision)
    ) return false
    const current = readAccessRecord(storage, accessStorageKey).record
    if (
      !current
      || current.activationId !== null
      || current.ownerId !== ownerId
      || current.profileId !== profileId
      || !hasProfile()
    ) return false
    const reconciled = {
      ...current,
      generation,
      revision
    }
    const isReconcileCurrent = () => {
      const next = readAccessRecord(storage, accessStorageKey).record
      return next?.activationId === null
        && next.ownerId === ownerId
        && next.profileId === profileId
        && next.generation === generation
        && next.revision === revision
    }
    try {
      storage.setItem(accessStorageKey, JSON.stringify(reconciled))
      if (!isReconcileCurrent()) return false
      const result = replaceProfile(profile, {
        syncAnalytics: false
      }, isReconcileCurrent)
      if (result?.persisted && isReconcileCurrent()) return true
      if (isReconcileCurrent()) {
        storage.setItem(accessStorageKey, JSON.stringify(current))
      }
      return false
    } catch {
      try {
        if (isReconcileCurrent()) {
          storage.setItem(accessStorageKey, JSON.stringify(current))
        }
      } catch {}
      return false
    }
  }

  function isActivationCurrent(fence) {
    if (!isValidFence(fence)) return false
    try {
      const { record } = readAccessRecord(storage, accessStorageKey)
      return record?.activationId === fence.id
        && record.profileId === fence.profileId
        && record.ownerId === fence.ownerId
    } catch {
      return false
    }
  }

  function releaseActivation(fence) {
    if (!isActivationCurrent(fence)) return false
    try {
      const current = readAccessRecord(storage, accessStorageKey).record
      storage.setItem(accessStorageKey, JSON.stringify({
        activatedAt: fence.activatedAt,
        activationId: null,
        generation: current?.generation,
        onboardingFinalizationPending:
          current?.onboardingFinalizationPending === true,
        ownerId: fence.ownerId,
        profileId: fence.profileId,
        revision: current?.revision,
        version: PROFILE_ACCESS_RECORD_VERSION
      }))
      return true
    } catch {
      return false
    }
  }

  function completeOnboardingFinalization(fence) {
    if (!isActivationCurrent(fence)) return false
    try {
      const current = readAccessRecord(storage, accessStorageKey).record
      if (!current?.onboardingFinalizationPending) return true
      storage.setItem(accessStorageKey, JSON.stringify({
        ...current,
        onboardingFinalizationPending: false
      }))
      const completed = readAccessRecord(storage, accessStorageKey).record
      return completed?.onboardingFinalizationPending === false
        && isActivationCurrent(fence)
    } catch {
      return false
    }
  }

  function save(profile, options, fence) {
    if (!isActivationCurrent(fence)) return false
    const persisted = saveProfile(profile, {
      ...options,
      syncAnalytics: false
    }, () => isActivationCurrent(fence))
    return persisted === true && isActivationCurrent(fence)
  }

  function replace(profile, options, fence) {
    if (!isActivationCurrent(fence)) {
      return { persisted: false, error: null }
    }
    const result = replaceProfile(profile, {
      ...options,
      syncAnalytics: false
    }, () => isActivationCurrent(fence))
    if (result?.persisted && !isActivationCurrent(fence)) {
      return { persisted: false, error: result.error || null }
    }
    return result
  }

  function subscribe(listener) {
    if (!eventTarget?.addEventListener || !eventTarget?.removeEventListener) {
      return () => {}
    }
    const handleStorage = event => {
      if (event.key !== accessStorageKey) return
      if (event.storageArea && event.storageArea !== storage) return
      listener()
    }
    eventTarget.addEventListener('storage', handleStorage)
    return () => eventTarget.removeEventListener('storage', handleStorage)
  }

  return Object.freeze({
    claimActivation,
    completeOnboardingFinalization,
    installSignedInProfile,
    isActivationCurrent,
    read,
    reconcileSignedInProfile,
    releaseActivation,
    replace,
    save,
    subscribe
  })
}
