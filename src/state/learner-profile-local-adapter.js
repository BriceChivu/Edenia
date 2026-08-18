const PROFILE_ACCESS_RECORD_VERSION = 1

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNullableString(value) {
  return value === null || (typeof value === 'string' && Boolean(value))
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
      || !Number.isFinite(record.activatedAt)
    ) return { present: true, record: null }
    return { present: true, record }
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
  loadProfile,
  replaceProfile,
  saveProfile,
  storage
}) {
  function read() {
    let profile
    let access
    try {
      profile = loadProfile()
      access = readAccessRecord(storage, accessStorageKey)
    } catch {
      return { status: 'invalid' }
    }
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      return access.present ? { status: 'invalid' } : { status: 'empty' }
    }
    if (access.present && !access.record) return { status: 'invalid' }
    return {
      ownerId: access.record?.ownerId || null,
      profile,
      profileId: access.record?.profileId || accountlessProfileId,
      status: 'ready'
    }
  }

  function claimActivation(fence) {
    if (!isValidFence(fence)) return false
    const record = {
      activatedAt: fence.activatedAt,
      activationId: fence.id,
      ownerId: fence.ownerId,
      profileId: fence.profileId,
      version: PROFILE_ACCESS_RECORD_VERSION
    }
    try {
      storage.setItem(accessStorageKey, JSON.stringify(record))
      return isActivationCurrent(fence)
    } catch {
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
      storage.setItem(accessStorageKey, JSON.stringify({
        activatedAt: fence.activatedAt,
        activationId: null,
        ownerId: fence.ownerId,
        profileId: fence.profileId,
        version: PROFILE_ACCESS_RECORD_VERSION
      }))
      return true
    } catch {
      return false
    }
  }

  function save(profile, options, fence) {
    if (!isActivationCurrent(fence)) return false
    const persisted = saveProfile(profile, {
      ...options,
      syncAnalytics: false
    })
    return persisted === true && isActivationCurrent(fence)
  }

  function replace(profile, options, fence) {
    if (!isActivationCurrent(fence)) {
      return { persisted: false, error: null }
    }
    const result = replaceProfile(profile, {
      ...options,
      syncAnalytics: false
    })
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
    isActivationCurrent,
    read,
    releaseActivation,
    replace,
    save,
    subscribe
  })
}
