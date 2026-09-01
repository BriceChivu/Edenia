import { createPendingStarterFeed } from './onboarding-state.js'

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

const OWNER_REPLACEMENT_PROTECTIONS = new Set([
  'discarded',
  'exported',
  'synchronized'
])

function isOwnerReplacement(value) {
  return isRecord(value)
    && typeof value.id === 'string'
    && Boolean(value.id)
    && typeof value.nextOwnerId === 'string'
    && Boolean(value.nextOwnerId)
    && OWNER_REPLACEMENT_PROTECTIONS.has(value.protection)
    && Number.isFinite(value.startedAt)
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
        record.legacy !== undefined
        && record.legacy !== true
      )
      || (
        record.legacy === true
        && record.ownerId !== null
        && (
          record.generation !== undefined
          || record.revision !== undefined
        )
      )
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
      || (
        record.replacement !== undefined
        && !isOwnerReplacement(record.replacement)
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
  clearLearnerDerivedData = async () => true,
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
    if (access.record?.replacement) {
      return {
        nextOwnerId: access.record.replacement.nextOwnerId,
        previousOwnerId: access.record.ownerId,
        previousProfileId: access.record.profileId,
        protection: access.record.replacement.protection,
        startedAt: access.record.replacement.startedAt,
        status: 'replacing',
        transitionId: access.record.replacement.id
      }
    }
    const localProfile = {
      ...(access.record?.legacy === true ? { legacy: true } : {}),
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

  function installLegacyAccountlessProfile(profile, { createdAt } = {}) {
    if (!isRecord(profile) || !Number.isFinite(createdAt) || hasProfile()) {
      return false
    }
    const existingAccess = readAccessRecord(storage, accessStorageKey)
    if (existingAccess.present) return false
    const record = {
      activatedAt: createdAt,
      activationId: null,
      legacy: true,
      ownerId: null,
      profileId: accountlessProfileId,
      version: PROFILE_ACCESS_RECORD_VERSION
    }
    const isInstallCurrent = () => {
      const current = readAccessRecord(storage, accessStorageKey).record
      return current?.activationId === null
        && current.legacy === true
        && current.ownerId === null
        && current.profileId === accountlessProfileId
    }
    try {
      storage.setItem(accessStorageKey, JSON.stringify(record))
      if (!isInstallCurrent()) return false
      const result = replaceProfile(profile, {
        backup: false,
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

  function installSignedInProfile(profile, {
    generation,
    installedAt,
    onboardingFinalizationPending = false,
    ownerId,
    profileId,
    replaceExisting = false,
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
      || typeof replaceExisting !== 'boolean'
      || !Number.isFinite(installedAt)
    ) return false
    const hadProfile = hasProfile()
    const previousAccess = readAccessRecord(storage, accessStorageKey)
    const previousProfile = hadProfile ? loadProfile() : null
    if (
      hadProfile
      && (
        !replaceExisting
        || previousAccess.record?.ownerId !== ownerId
        || !previousProfile
      )
    ) return false
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
      if (isInstallCurrent()) {
        if (replaceExisting && previousAccess.record) {
          storage.setItem(accessStorageKey, JSON.stringify(previousAccess.record))
        } else if (!hasProfile()) {
          storage.removeItem(accessStorageKey)
        }
      }
      return false
    } catch {
      try {
        if (replaceExisting && previousAccess.record && isInstallCurrent()) {
          storage.setItem(accessStorageKey, JSON.stringify(previousAccess.record))
        } else if (!hasProfile() && isInstallCurrent()) {
          storage.removeItem(accessStorageKey)
        }
      } catch {}
      return false
    }
  }

  function attachAccountlessProfile({
    attachedAt,
    generation,
    ownerId,
    previousProfileId,
    profileId,
    revision
  } = {}) {
    if (
      !Number.isFinite(attachedAt)
      || !isPositiveInteger(generation)
      || typeof ownerId !== 'string'
      || !ownerId
      || previousProfileId !== accountlessProfileId
      || typeof profileId !== 'string'
      || !profileId
      || !isPositiveInteger(revision)
      || !hasProfile()
    ) return false
    const access = readAccessRecord(storage, accessStorageKey)
    const current = access.record
    if (
      (access.present && !current)
      || (current && current.activationId !== null)
      || current?.ownerId
      || (current && current.profileId !== previousProfileId)
      || current?.replacement
      || current?.generation !== undefined
      || current?.revision !== undefined
    ) return false
    const attached = {
      activatedAt: attachedAt,
      activationId: null,
      generation,
      onboardingFinalizationPending: false,
      ownerId,
      profileId,
      revision,
      version: PROFILE_ACCESS_RECORD_VERSION
    }
    const isAttachmentCurrent = () => {
      const next = readAccessRecord(storage, accessStorageKey).record
      return next?.activationId === null
        && next.ownerId === ownerId
        && next.profileId === profileId
        && next.generation === generation
        && next.revision === revision
    }
    try {
      storage.setItem(accessStorageKey, JSON.stringify(attached))
      if (isAttachmentCurrent()) return true
      if (current) {
        storage.setItem(accessStorageKey, JSON.stringify(current))
      } else {
        storage.removeItem(accessStorageKey)
      }
      return false
    } catch {
      try {
        if (current) {
          storage.setItem(accessStorageKey, JSON.stringify(current))
        } else {
          storage.removeItem(accessStorageKey)
        }
      } catch {}
      return false
    }
  }

  function claimAccountlessProfileForMigration({
    claimedAt,
    ownerId,
    previousProfileId,
    profileId
  } = {}) {
    if (
      !Number.isFinite(claimedAt)
      || typeof ownerId !== 'string'
      || !ownerId
      || previousProfileId !== accountlessProfileId
      || typeof profileId !== 'string'
      || !profileId
      || !hasProfile()
    ) return false
    const access = readAccessRecord(storage, accessStorageKey)
    const current = access.record
    if (
      (access.present && !current)
      || (current && current.activationId !== null)
      || current?.ownerId
      || (current && current.profileId !== previousProfileId)
      || current?.replacement
      || current?.generation !== undefined
      || current?.revision !== undefined
    ) return false
    const claimed = {
      activatedAt: claimedAt,
      activationId: null,
      legacy: true,
      ownerId,
      profileId,
      version: PROFILE_ACCESS_RECORD_VERSION
    }
    try {
      storage.setItem(accessStorageKey, JSON.stringify(claimed))
      const next = readAccessRecord(storage, accessStorageKey).record
      return next?.activationId === null
        && next.legacy === true
        && next.ownerId === ownerId
        && next.profileId === profileId
        && next.generation === undefined
        && next.revision === undefined
    } catch {
      return false
    }
  }

  function claimActivation(fence) {
    if (!isValidFence(fence)) return false
    const current = readAccessRecord(storage, accessStorageKey).record
    if (current?.replacement) return false
    const record = {
      activatedAt: fence.activatedAt,
      activationId: fence.id,
      generation: current?.generation,
      ...(current?.legacy === true ? { legacy: true } : {}),
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

  function isOwnerReplacementCurrent(transition) {
    if (
      !isRecord(transition)
      || typeof transition.id !== 'string'
      || !transition.id
      || typeof transition.nextOwnerId !== 'string'
      || !transition.nextOwnerId
      || typeof transition.previousOwnerId !== 'string'
      || !transition.previousOwnerId
      || typeof transition.previousProfileId !== 'string'
      || !transition.previousProfileId
      || !OWNER_REPLACEMENT_PROTECTIONS.has(transition.protection)
      || !Number.isFinite(transition.startedAt)
    ) return false
    try {
      const current = readAccessRecord(storage, accessStorageKey).record
      return current?.ownerId === transition.previousOwnerId
        && current.profileId === transition.previousProfileId
        && current.replacement?.id === transition.id
        && current.replacement.nextOwnerId === transition.nextOwnerId
        && current.replacement.protection === transition.protection
        && current.replacement.startedAt === transition.startedAt
    } catch {
      return false
    }
  }

  function beginOwnerReplacement({
    id,
    nextOwnerId,
    previousOwnerId,
    previousProfileId,
    protection,
    startedAt
  } = {}) {
    const transition = Object.freeze({
      id,
      nextOwnerId,
      previousOwnerId,
      previousProfileId,
      protection,
      startedAt
    })
    if (
      typeof id !== 'string'
      || !id.startsWith('replacement-')
      || typeof nextOwnerId !== 'string'
      || !nextOwnerId
      || typeof previousOwnerId !== 'string'
      || !previousOwnerId
      || nextOwnerId === previousOwnerId
      || typeof previousProfileId !== 'string'
      || !previousProfileId
      || !OWNER_REPLACEMENT_PROTECTIONS.has(protection)
      || !Number.isFinite(startedAt)
    ) return null
    const current = readAccessRecord(storage, accessStorageKey).record
    if (
      !current
      || current.activationId !== null
      || current.replacement
      || current.ownerId !== previousOwnerId
      || current.profileId !== previousProfileId
      || !hasProfile()
    ) return null
    try {
      storage.setItem(accessStorageKey, JSON.stringify({
        ...current,
        activatedAt: startedAt,
        replacement: {
          id,
          nextOwnerId,
          protection,
          startedAt
        }
      }))
      return isOwnerReplacementCurrent(transition) ? transition : null
    } catch {
      return null
    }
  }

  async function completeOwnerReplacement(
    profile,
    {
      generation,
      onboardingFinalizationPending = false,
      ownerId,
      profileId,
      revision
    } = {},
    transition
  ) {
    if (
      !isRecord(profile)
      || typeof ownerId !== 'string'
      || ownerId !== transition?.nextOwnerId
      || typeof profileId !== 'string'
      || !profileId
      || !isPositiveInteger(generation)
      || !isPositiveInteger(revision)
      || !isOwnerReplacementCurrent(transition)
    ) return false
    const isCurrent = () => isOwnerReplacementCurrent(transition)
    let result
    try {
      result = replaceProfile(profile, {
        backup: false,
        syncAnalytics: false
      }, isCurrent)
    } catch {
      return false
    }
    if (!result?.persisted || !isCurrent()) return false
    try {
      if (await clearLearnerDerivedData() !== true || !isCurrent()) {
        return false
      }
      storage.setItem(accessStorageKey, JSON.stringify({
        activatedAt: transition.startedAt,
        activationId: null,
        generation,
        onboardingFinalizationPending:
          onboardingFinalizationPending === true,
        ownerId,
        profileId,
        revision,
        version: PROFILE_ACCESS_RECORD_VERSION
      }))
      const completed = read()
      return completed.status === 'ready'
        && completed.ownerId === ownerId
        && completed.profileId === profileId
        && completed.generation === generation
        && completed.revision === revision
    } catch {
      return false
    }
  }

  function reconcileSignedInProfile(profile, {
    generation,
    ownerId,
    previousProfileId = null,
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
    const replacesProvisionalIdentity = previousProfileId !== null
      && current?.profileId === previousProfileId
      && current?.generation === undefined
      && current?.revision === undefined
    if (
      !current
      || current.activationId !== null
      || current.ownerId !== ownerId
      || (
        current.profileId !== profileId
        && !replacesProvisionalIdentity
      )
      || !hasProfile()
    ) return false
    const reconciled = {
      ...current,
      generation,
      profileId,
      revision
    }
    delete reconciled.legacy
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

  function adoptCloudIdentity({
    generation,
    ownerId,
    previousProfileId,
    profileId,
    revision
  }) {
    if (
      typeof ownerId !== 'string'
      || !ownerId
      || typeof previousProfileId !== 'string'
      || !previousProfileId
      || typeof profileId !== 'string'
      || !profileId
      || !isPositiveInteger(generation)
      || !isPositiveInteger(revision)
    ) return false
    const current = readAccessRecord(storage, accessStorageKey).record
    const hasProvisionalIdentity = current?.generation === undefined
      && current?.revision === undefined
    const hasMatchingCloudIdentity = current?.profileId === profileId
      && current?.generation === generation
      && isPositiveInteger(current?.revision)
    if (
      !current
      || current.activationId !== null
      || current.ownerId !== ownerId
      || current.profileId !== previousProfileId
      || (!hasProvisionalIdentity && !hasMatchingCloudIdentity)
      || !hasProfile()
    ) return false
    const adopted = {
      ...current,
      generation,
      profileId,
      revision
    }
    const isAdoptionCurrent = () => {
      const next = readAccessRecord(storage, accessStorageKey).record
      return next?.activationId === null
        && next.ownerId === ownerId
        && next.profileId === profileId
        && next.generation === generation
        && next.revision === revision
    }
    try {
      storage.setItem(accessStorageKey, JSON.stringify(adopted))
      return isAdoptionCurrent()
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
      const current = readAccessRecord(storage, accessStorageKey).record
      storage.setItem(accessStorageKey, JSON.stringify({
        activatedAt: fence.activatedAt,
        activationId: null,
        generation: current?.generation,
        ...(current?.legacy === true ? { legacy: true } : {}),
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
      const profile = loadProfile()
      if (!isRecord(profile)) return false
      const finalizedProfile = {
        ...profile,
        onboarding: {
          ...profile.onboarding,
          starterFeed: createPendingStarterFeed(
            profile.learnerProfile?.selectedChannelCatalogIds,
            profile.onboarding?.setupCompletedAt
          )
        }
      }
      if (!saveProfile(finalizedProfile, {
        backup: false,
        syncAnalytics: false
      }, () => isActivationCurrent(fence))) return false
      if (!isActivationCurrent(fence)) return false
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
    adoptCloudIdentity,
    attachAccountlessProfile,
    beginOwnerReplacement,
    claimActivation,
    claimAccountlessProfileForMigration,
    completeOwnerReplacement,
    completeOnboardingFinalization,
    installSignedInProfile,
    installLegacyAccountlessProfile,
    isActivationCurrent,
    read,
    reconcileSignedInProfile,
    releaseActivation,
    replace,
    save,
    subscribe
  })
}
