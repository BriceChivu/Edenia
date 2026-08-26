import {
  ACCOUNTLESS_PROFILE_MIGRATION_STATES
} from '../domain/accountless-profile-migration.js'
import {
  LEARNER_PROFILE_RECOVERY_FEEDBACK,
  LEARNER_PROFILE_RECOVERY_SOURCES
} from '../domain/learner-profile-resolution.js'

export const LEARNER_PROFILE_ACCESS_STATES = Object.freeze({
  ACTIVE: 'active',
  ACCOUNT_CHANGE: 'account-change',
  CONFLICTING: 'conflicting',
  LOCKED: 'locked',
  MIGRATING: 'migrating',
  RECOVERING: 'recovering',
  RESOLVING: 'resolving',
  RELOADING: 'reloading',
  REPLACING: 'replacing',
  WAITING_AUTHENTICATION: 'waiting-authentication',
  WAITING_CLOUD: 'waiting-cloud'
})

const EMPTY_ACCESS_STATE = Object.freeze({
  activation: null,
  ownerId: null,
  profileId: null,
  status: LEARNER_PROFILE_ACCESS_STATES.RESOLVING
})
const OWNER_VERIFICATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const OFFLINE_EXPIRY_TIMER_MAX_DELAY_MS = 24 * 60 * 60 * 1000

function isAccountlessProfile(localProfile) {
  return localProfile?.status === 'ready' && !localProfile.ownerId
}

function isSignedInProfile(localProfile) {
  return localProfile?.status === 'ready'
    && typeof localProfile.ownerId === 'string'
    && Boolean(localProfile.ownerId)
}

export function createLearnerProfileLifecycleAuthority({
  adapters,
  createActivationId,
  onStateChange
}) {
  const {
    analytics,
    authentication,
    clock,
    cloudPersistence,
    connectivity,
    exportDownload,
    accountlessProfileMigration,
    localPersistence,
    ownerVerification
  } = adapters
  let currentState = EMPTY_ACCESS_STATE
  let activeProfile = null
  let offlineVerificationExpiresAt = null
  let offlineExpiryTimer = null
  let started = false
  let resolutionId = 0
  const profileActivations = new WeakMap()
  let unsubscribeAuthentication = null
  let unsubscribeCloudPersistence = null
  let unsubscribeConnectivity = null
  let unsubscribeLocalPersistence = null
  let unsubscribeOwnerVerification = null

  function publish(status, {
    activation = null,
    conflict = null,
    ownerId = null,
    profileId = null,
    protectedConflicts = [],
    protectedReset = null,
    recovery = null,
    replacement = null
  } = {}) {
    const retainedConflicts = Object.freeze([...protectedConflicts])
    currentState = Object.freeze({
      activation,
      ...(conflict ? { conflict } : {}),
      ownerId,
      profileId,
      ...(retainedConflicts.length
        ? { protectedConflicts: retainedConflicts }
        : {}),
      ...(protectedReset ? { protectedReset } : {}),
      ...(recovery ? { recovery: Object.freeze({
        ...recovery,
        candidates: Object.freeze([...(recovery.candidates || [])])
      }) } : {}),
      ...(replacement ? { replacement: Object.freeze(replacement) } : {}),
      status
    })
    onStateChange(currentState)
    analytics.accessChanged(currentState)
    return currentState
  }

  function publishAccountChange(localProfile) {
    const protectionStatus = cloudPersistence.getReplacementProtection?.(
      localProfile
    ) || 'blocked'
    return publish(LEARNER_PROFILE_ACCESS_STATES.ACCOUNT_CHANGE, {
      replacement: { protectionStatus }
    })
  }

  function releaseActiveProfile() {
    const activation = currentState.activation
    activeProfile = null
    offlineVerificationExpiresAt = null
    if (offlineExpiryTimer !== null) {
      clock.clearTimer?.(offlineExpiryTimer)
      offlineExpiryTimer = null
    }
    if (activation) localPersistence.releaseActivation(activation)
  }

  function scheduleOfflineExpiryCheck() {
    if (
      offlineVerificationExpiresAt === null
      || typeof clock.setTimer !== 'function'
    ) return
    if (offlineExpiryTimer !== null) clock.clearTimer?.(offlineExpiryTimer)
    const remaining = offlineVerificationExpiresAt - clock.now()
    const delay = Math.min(
      OFFLINE_EXPIRY_TIMER_MAX_DELAY_MS,
      Math.max(1, remaining + 1)
    )
    offlineExpiryTimer = clock.setTimer(() => {
      offlineExpiryTimer = null
      if (
        currentState.status !== LEARNER_PROFILE_ACCESS_STATES.ACTIVE
        || offlineVerificationExpiresAt === null
      ) return
      if (clock.now() > offlineVerificationExpiresAt) {
        releaseActiveProfile()
        publish(LEARNER_PROFILE_ACCESS_STATES.LOCKED)
        return
      }
      scheduleOfflineExpiryCheck()
    }, delay)
  }

  function prepareActivation(localProfile) {
    releaseActiveProfile()
    const activation = Object.freeze({
      activatedAt: clock.now(),
      generation: localProfile.generation,
      id: createActivationId(),
      ownerId: localProfile.ownerId || null,
      profileId: localProfile.profileId,
      revision: localProfile.revision
    })
    if (!localPersistence.claimActivation(activation)) {
      return null
    }
    return activation
  }

  function activateProfile(localProfile, activation, {
    offlineExpiresAt = null,
    protectedConflicts = [],
    protectedReset = null
  } = {}) {
    if (!localPersistence.isActivationCurrent(activation)) {
      activeProfile = null
      localPersistence.releaseActivation(activation)
      return publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
    }
    activeProfile = localProfile.profile
    offlineVerificationExpiresAt = Number.isFinite(offlineExpiresAt)
      ? offlineExpiresAt
      : null
    profileActivations.set(activeProfile, activation)
    publish(LEARNER_PROFILE_ACCESS_STATES.ACTIVE, {
      activation,
      ownerId: activation.ownerId,
      profileId: activation.profileId,
      protectedConflicts,
      protectedReset
    })
    scheduleOfflineExpiryCheck()
    analytics.profileActivated({
      activation,
      ownerId: activation.ownerId,
      profileId: activation.profileId
    })
    if (activation.ownerId && typeof cloudPersistence.activate === 'function') {
      cloudPersistence.activate({
        activation,
        generation: activation.generation,
        isCurrent: () => Boolean(getCurrentActivationFor(activeProfile)),
        profile: activeProfile,
        revision: activation.revision
      })
    }
    return currentState
  }

  function activate(localProfile, options = {}) {
    const activation = prepareActivation(localProfile)
    if (!activation) {
      return publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
    }
    return activateProfile(localProfile, activation, options)
  }

  function getCurrentOfflineVerification(localProfile) {
    if (!isSignedInProfile(localProfile)) return null
    const verification = ownerVerification?.read?.()
    const now = clock.now()
    return verification?.ownerId === localProfile.ownerId
      && Number.isFinite(verification.verifiedAt)
      && verification.verifiedAt <= now
      && now - verification.verifiedAt <= OWNER_VERIFICATION_MAX_AGE_MS
      ? verification
      : null
  }

  function activateOffline(localProfile, verification) {
    return activate(localProfile, {
      offlineExpiresAt:
        verification.verifiedAt + OWNER_VERIFICATION_MAX_AGE_MS
    })
  }

  function enqueueCloudSave(profile, activation) {
    if (!activation.ownerId) return false
    try {
      Promise.resolve(cloudPersistence.save(profile, {
        activation,
        isCurrent: () => Boolean(getCurrentActivationFor(profile))
      })).catch(() => {})
      return true
    } catch {
      return false
    }
  }

  function markCloudSaveRequired(profile, activation) {
    if (!activation.ownerId || typeof cloudPersistence.markDirty !== 'function') {
      return true
    }
    if (
      cloudPersistence.requiresCloudHeadResolution?.() === true
      && (!Number.isSafeInteger(activation.generation)
        || !Number.isSafeInteger(activation.revision))
    ) return true
    return cloudPersistence.markDirty({
      activation,
      isCurrent: () => getCurrentActivationFor(profile) === activation
    }) === true
  }

  function restoreAccountlessAfterMigrationFailure(localProfile) {
    if (accountlessProfileMigration?.isEntryRequired?.() === true) {
      releaseActiveProfile()
      return publish(LEARNER_PROFILE_ACCESS_STATES.LOCKED)
    }
    return activate(localProfile)
  }

  function resolveCloudProfile({
    auth,
    accountlessAttachment = null,
    localProfile,
    purpose,
    requestId
  }) {
    Promise.resolve(cloudPersistence.resolve({
      authentication: auth,
      connectivity: connectivity.getObservation(),
      ...(accountlessAttachment ? { accountlessAttachment } : {}),
      localProfile,
      purpose
    })).then(async result => {
      if (requestId !== resolutionId) return
      if (!result || result.status === 'waiting') return
      if (
        purpose === 'migrate-accountless-profile'
        && result.status === 'migration-backup-failed'
      ) {
        accountlessProfileMigration?.markBackupFailed?.()
        restoreAccountlessAfterMigrationFailure(localProfile)
        return
      }
      if (
        purpose === 'migrate-accountless-profile'
        && result.status === 'migration-signed-in-profile-present'
      ) {
        accountlessProfileMigration?.markSignedInProfilePresent?.()
        restoreAccountlessAfterMigrationFailure(localProfile)
        return
      }
      if (
        purpose === 'migrate-accountless-profile'
        && result.status === 'activate'
        && result.backupRequired === true
      ) {
        accountlessProfileMigration?.markBackupFailed?.()
        restoreAccountlessAfterMigrationFailure(localProfile)
        return
      }
      if (result.status === 'waiting-cloud') {
        const matchingOwnedLocalProfile =
          auth.userId === localProfile?.ownerId
          && isSignedInProfile(localProfile)
        const verification = matchingOwnedLocalProfile
          ? getCurrentOfflineVerification(localProfile)
          : null
        if (verification) {
          activateOffline(localProfile, verification)
          return
        }
        if (matchingOwnedLocalProfile) {
          activate(localProfile)
          return
        }
      }
      if (
        result.status === 'activate'
        && result.ownerId === auth.userId
        && typeof result.profileId === 'string'
        && result.profileId
        && result.profile
        && typeof result.profile === 'object'
        && Number.isSafeInteger(result.generation)
        && result.generation > 0
        && Number.isSafeInteger(result.revision)
        && result.revision > 0
      ) {
        let protectedReset = result.protectedReset || null
        if (
          !protectedReset
          && typeof cloudPersistence.readProtectedReset === 'function'
        ) {
          try {
            protectedReset = await cloudPersistence.readProtectedReset({
              generation: result.generation,
              ownerId: result.ownerId,
              profileId: result.profileId
            })
          } catch {
            protectedReset = null
          }
          if (requestId !== resolutionId) return
        }
        if (currentState.status === LEARNER_PROFILE_ACCESS_STATES.ACTIVE) {
          releaseActiveProfile()
        }
        let resolvedProfile = result.profile
        if (
          purpose === 'migrate-accountless-profile'
          && isAccountlessProfile(localProfile)
        ) {
          if (!localPersistence.attachAccountlessProfile?.({
            attachedAt: clock.now(),
            generation: result.generation,
            ownerId: result.ownerId,
            previousProfileId: localProfile.profileId,
            profileId: result.profileId,
            revision: result.revision
          })) {
            publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
            return
          }
          const attachedProfile = localPersistence.read()
          if (
            !isSignedInProfile(attachedProfile)
            || attachedProfile.ownerId !== result.ownerId
            || attachedProfile.profileId !== result.profileId
            || attachedProfile.generation !== result.generation
            || attachedProfile.revision !== result.revision
          ) {
            publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
            return
          }
          resolvedProfile = attachedProfile.profile
        } else if (localProfile?.status === 'empty') {
          if (!localPersistence.installSignedInProfile(result.profile, {
            generation: result.generation,
            installedAt: clock.now(),
            onboardingFinalizationPending: result.created === true,
            ownerId: result.ownerId,
            profileId: result.profileId,
            revision: result.revision
          })) {
            publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
            return
          }
          const installedProfile = localPersistence.read()
          if (
            !isSignedInProfile(installedProfile)
            || installedProfile.ownerId !== result.ownerId
            || installedProfile.profileId !== result.profileId
          ) {
            publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
            return
          }
          resolvedProfile = installedProfile.profile
        } else if (isSignedInProfile(localProfile)) {
          const identity = {
            generation: result.generation,
            ownerId: result.ownerId,
            profileId: result.profileId,
            revision: result.revision
          }
          const reconciled = result.backupRequired === true
            ? localPersistence.adoptCloudIdentity?.({
                ...identity,
                previousProfileId: localProfile.profileId
              })
            : localPersistence.reconcileSignedInProfile(
                result.profile,
                identity
              )
          if (!reconciled) {
            publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
            return
          }
          const reconciledProfile = localPersistence.read()
          if (
            !isSignedInProfile(reconciledProfile)
            || reconciledProfile.ownerId !== result.ownerId
            || reconciledProfile.profileId !== result.profileId
            || reconciledProfile.generation !== result.generation
            || reconciledProfile.revision !== result.revision
          ) {
            publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
            return
          }
          resolvedProfile = reconciledProfile.profile
        }
        const activationProfile = {
          generation: result.generation,
          ownerId: result.ownerId,
          profile: resolvedProfile,
          profileId: result.profileId,
          revision: result.revision,
          status: 'ready'
        }
        const activation = prepareActivation(activationProfile)
        if (!activation) {
          publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
          return
        }
        let localFinalizationCompleted = true
        try {
          if (typeof localPersistence.completeOnboardingFinalization === 'function') {
            localFinalizationCompleted =
              localPersistence.completeOnboardingFinalization(activation)
          }
        } catch {
          localFinalizationCompleted = false
        }
        if (
          !localFinalizationCompleted
          || !localPersistence.isActivationCurrent(activation)
        ) {
          localPersistence.releaseActivation(activation)
          publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
          return
        }
        const finalizedLocalProfile = localPersistence.read()
        if (
          !isSignedInProfile(finalizedLocalProfile)
          || finalizedLocalProfile.ownerId !== result.ownerId
          || finalizedLocalProfile.profileId !== result.profileId
          || finalizedLocalProfile.generation !== result.generation
          || finalizedLocalProfile.revision !== result.revision
        ) {
          localPersistence.releaseActivation(activation)
          publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
          return
        }
        activationProfile.profile = finalizedLocalProfile.profile
        const activationState = activateProfile(activationProfile, activation, {
          protectedConflicts: result.protectedConflicts || [],
          protectedReset
        })
        if (activationState.status !== LEARNER_PROFILE_ACCESS_STATES.ACTIVE) {
          return
        }
        ownerVerification?.record?.({
          ownerId: auth.userId,
          verifiedAt: clock.now()
        })
        if (purpose === 'migrate-accountless-profile') {
          accountlessProfileMigration?.complete?.()
        }
        try {
          if (typeof result.finalize === 'function') {
            result.finalize({
              isCurrent: () =>
                localPersistence.isActivationCurrent(activation)
            })
          }
        } catch {}
        if (!localPersistence.isActivationCurrent(activation)) {
          releaseActiveProfile()
          publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
          return
        }
        if (result.backupRequired === true) {
          enqueueCloudSave(resolvedProfile, activation)
        }
        return
      }
      if (
        purpose === 'migrate-accountless-profile'
        && result.status === 'conflicting'
        && result.conflict?.status === 'open'
        && result.conflict.ownerId === auth.userId
        && typeof result.conflict.profileId === 'string'
        && result.conflict.profileId
        && isAccountlessProfile(localProfile)
      ) {
        if (!localPersistence.claimAccountlessProfileForMigration?.({
          claimedAt: clock.now(),
          ownerId: auth.userId,
          previousProfileId: localProfile.profileId,
          profileId: result.conflict.profileId
        })) {
          publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
          return
        }
        const claimedProfile = localPersistence.read()
        if (
          !isSignedInProfile(claimedProfile)
          || claimedProfile.ownerId !== auth.userId
          || claimedProfile.profileId !== result.conflict.profileId
          || claimedProfile.generation !== undefined
          || claimedProfile.revision !== undefined
        ) {
          publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
          return
        }
        if (!accountlessProfileMigration?.markConflictReady?.()) {
          publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
          return
        }
        publish(LEARNER_PROFILE_ACCESS_STATES.CONFLICTING, {
          conflict: result.conflict,
          ownerId: result.conflict.ownerId,
          profileId: result.conflict.profileId
        })
        return
      }
      const resultStates = {
        conflicting: LEARNER_PROFILE_ACCESS_STATES.CONFLICTING,
        locked: LEARNER_PROFILE_ACCESS_STATES.LOCKED,
        migrating: LEARNER_PROFILE_ACCESS_STATES.MIGRATING,
        recovering: LEARNER_PROFILE_ACCESS_STATES.RECOVERING,
        'waiting-authentication':
          LEARNER_PROFILE_ACCESS_STATES.WAITING_AUTHENTICATION,
        'waiting-cloud': LEARNER_PROFILE_ACCESS_STATES.WAITING_CLOUD
      }
      if (
        result.status === 'conflicting'
        && accountlessProfileMigration?.hasPendingMigration?.()
      ) {
        accountlessProfileMigration.markConflictReady?.()
      }
      if (result.status !== 'waiting-cloud') ownerVerification?.clear?.()
      publish(
        resultStates[result.status]
          || LEARNER_PROFILE_ACCESS_STATES.RECOVERING,
        result.status === 'conflicting' && result.conflict
          ? {
              conflict: result.conflict,
              ownerId: result.conflict.ownerId,
              profileId: result.conflict.profileId
            }
          : result.status === 'recovering' && result.recovery
            ? { recovery: result.recovery }
          : undefined
      )
    }).catch(() => {
      if (requestId === resolutionId) {
        if (
          purpose === 'migrate-accountless-profile'
          && isAccountlessProfile(localProfile)
        ) {
          accountlessProfileMigration?.markBackupFailed?.()
          restoreAccountlessAfterMigrationFailure(localProfile)
        } else {
          publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
        }
      }
    })
  }

  function evaluate() {
    const requestId = ++resolutionId
    const auth = authentication.getObservation()
    const localProfile = localPersistence.read()
    if (!auth || auth.status === 'loading') {
      releaseActiveProfile()
      return publish(LEARNER_PROFILE_ACCESS_STATES.RESOLVING)
    }
    if (isAccountlessProfile(localProfile) && accountlessProfileMigration) {
      const accountlessAttachment = accountlessProfileMigration.getAttachment?.()
      if (
        auth.status === 'signed-in'
        && auth.userId
        && accountlessProfileMigration.getState?.().status
          === ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
        && accountlessAttachment
      ) {
        releaseActiveProfile()
        publish(LEARNER_PROFILE_ACCESS_STATES.MIGRATING)
        resolveCloudProfile({
          auth,
          accountlessAttachment,
          localProfile,
          purpose: 'migrate-accountless-profile',
          requestId
        })
        return currentState
      }
      if (accountlessProfileMigration.isEntryRequired?.() === true) {
        releaseActiveProfile()
        return publish(LEARNER_PROFILE_ACCESS_STATES.LOCKED)
      }
      return activate(localProfile)
    }
    if (auth?.status === 'signed-in' && isAccountlessProfile(localProfile)) {
      releaseActiveProfile()
      publish(LEARNER_PROFILE_ACCESS_STATES.MIGRATING)
      resolveCloudProfile({
        auth,
        localProfile,
        purpose: 'link-accountless-profile',
        requestId
      })
      return currentState
    }
    if (auth.status === 'signed-in') {
      releaseActiveProfile()
      if (!auth.userId || localProfile?.status === 'invalid') {
        return publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
      }
      if (localProfile?.status === 'replacing') {
        if (localProfile.nextOwnerId !== auth.userId) {
          return publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
        }
        publish(LEARNER_PROFILE_ACCESS_STATES.REPLACING)
        void finishOwnerReplacement({
          auth,
          localProfile,
          protection: localProfile.protection,
          requestId,
          transition: {
            id: localProfile.transitionId,
            nextOwnerId: localProfile.nextOwnerId,
            previousOwnerId: localProfile.previousOwnerId,
            previousProfileId: localProfile.previousProfileId,
            protection: localProfile.protection,
            startedAt: localProfile.startedAt
          }
        })
        return currentState
      }
      if (isSignedInProfile(localProfile) && localProfile.ownerId !== auth.userId) {
        ownerVerification?.clear?.()
        return publishAccountChange(localProfile)
      }
      if (
        connectivity.getObservation()?.status !== 'online'
        && isSignedInProfile(localProfile)
      ) {
        const verification = getCurrentOfflineVerification(localProfile)
        if (verification) return activateOffline(localProfile, verification)
      }
      publish(LEARNER_PROFILE_ACCESS_STATES.WAITING_CLOUD)
      resolveCloudProfile({
        auth,
        localProfile,
        purpose: 'resolve-signed-in-profile',
        requestId
      })
      return currentState
    }
    if (auth.status === 'signed-out') {
      ownerVerification?.clear?.()
      if (isAccountlessProfile(localProfile)) return activate(localProfile)
      releaseActiveProfile()
      return publish(
        isSignedInProfile(localProfile)
          ? LEARNER_PROFILE_ACCESS_STATES.LOCKED
          : localProfile?.status === 'invalid'
            ? LEARNER_PROFILE_ACCESS_STATES.RECOVERING
            : LEARNER_PROFILE_ACCESS_STATES.WAITING_AUTHENTICATION
      )
    }
    if (auth.status === 'unavailable') {
      if (isAccountlessProfile(localProfile)) return activate(localProfile)
      if (
        auth.failure === 'network'
      ) {
        const verification = getCurrentOfflineVerification(localProfile)
        if (verification) return activateOffline(localProfile, verification)
      } else {
        ownerVerification?.clear?.()
      }
      releaseActiveProfile()
      return publish(
        isSignedInProfile(localProfile)
          ? LEARNER_PROFILE_ACCESS_STATES.LOCKED
          : localProfile?.status === 'invalid'
            ? LEARNER_PROFILE_ACCESS_STATES.RECOVERING
            : LEARNER_PROFILE_ACCESS_STATES.WAITING_AUTHENTICATION
      )
    }
    releaseActiveProfile()
    return publish(LEARNER_PROFILE_ACCESS_STATES.RESOLVING)
  }

  function handleOwnerVerificationChange() {
    if (currentState.status !== LEARNER_PROFILE_ACCESS_STATES.ACTIVE) {
      evaluate()
      return
    }
    const verification = requireCurrentOwnerVerification()
    if (!verification || offlineVerificationExpiresAt === null) return
    applyOfflineVerificationDeadline(verification)
  }

  function requireCurrentOwnerVerification() {
    const verification = getCurrentOfflineVerification(
      localPersistence.read()
    )
    if (verification) return verification
    releaseActiveProfile()
    publish(LEARNER_PROFILE_ACCESS_STATES.LOCKED)
    return null
  }

  function applyOfflineVerificationDeadline(verification) {
    offlineVerificationExpiresAt =
      verification.verifiedAt + OWNER_VERIFICATION_MAX_AGE_MS
    scheduleOfflineExpiryCheck()
  }

  function getCurrentActivationFor(profile) {
    const activation = profile && typeof profile === 'object'
      ? profileActivations.get(profile)
      : null
    if (
      currentState.status !== LEARNER_PROFILE_ACCESS_STATES.ACTIVE
      || activeProfile !== profile
      || currentState.activation !== activation
    ) return null
    if (
      offlineVerificationExpiresAt !== null
      && clock.now() > offlineVerificationExpiresAt
    ) {
      releaseActiveProfile()
      publish(LEARNER_PROFILE_ACCESS_STATES.LOCKED)
      return null
    }
    if (!localPersistence.isActivationCurrent(activation)) {
      releaseActiveProfile()
      publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
      return null
    }
    return activation
  }

  function handleCloudPersistenceState(state) {
    if (state?.status !== 'conflicting') return
    const activation = state.conflict?.activation
    if (
      !activation
      || activation !== currentState.activation
      || getCurrentActivationFor(activeProfile) !== activation
    ) return
    releaseActiveProfile()
    ownerVerification?.clear?.()
    publish(LEARNER_PROFILE_ACCESS_STATES.CONFLICTING, {
      conflict: state.conflict,
      ownerId: state.conflict.ownerId,
      profileId: state.conflict.profileId
    })
  }

  function readActiveProfile() {
    if (!getCurrentActivationFor(activeProfile)) return null
    return activeProfile
  }

  function saveActiveProfile(profile, options = {}) {
    const activation = getCurrentActivationFor(profile)
    if (!activation) return false
    if (!markCloudSaveRequired(profile, activation)) return false
    const persisted = localPersistence.save(profile, options, activation)
    if (!persisted || !getCurrentActivationFor(profile)) return false
    analytics.profileSaved(profile, { activation })
    enqueueCloudSave(profile, activation)
    return true
  }

  function replaceActiveProfile(profile, options = {}) {
    const previousProfile = readActiveProfile()
    if (
      !previousProfile
      || !profile
      || typeof profile !== 'object'
      || Array.isArray(profile)
    ) return { persisted: false, error: null }
    const previousState = currentState
    const previousOfflineExpiresAt = offlineVerificationExpiresAt
    if (!markCloudSaveRequired(previousProfile, previousState.activation)) {
      return { persisted: false, error: null }
    }
    releaseActiveProfile()
    const activation = Object.freeze({
      activatedAt: clock.now(),
      generation: previousState.activation?.generation,
      id: createActivationId(),
      ownerId: previousState.ownerId,
      profileId: previousState.profileId,
      revision: previousState.activation?.revision
    })
    if (!localPersistence.claimActivation(activation)) {
      publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
      return { persisted: false, error: null }
    }
    const result = localPersistence.replace(profile, options, activation)
    if (
      !result?.persisted
      || !localPersistence.isActivationCurrent(activation)
    ) {
      localPersistence.releaseActivation(activation)
      publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
      return result || { persisted: false, error: null }
    }
    activateProfile({ profile }, activation, {
      offlineExpiresAt: previousOfflineExpiresAt
    })
    analytics.profileSaved(profile, { activation })
    enqueueCloudSave(profile, activation)
    return result
  }

  async function importActiveProfile(profile, { confirmed = false } = {}) {
    if (confirmed !== true) return { status: 'confirmation-required' }
    const previousProfile = readActiveProfile()
    const previousState = currentState
    const previousActivation = previousState.activation
    const previousOfflineExpiresAt = offlineVerificationExpiresAt
    const auth = authentication.getObservation()
    if (
      !previousProfile
      || !profile
      || typeof profile !== 'object'
      || Array.isArray(profile)
      || previousState.status !== LEARNER_PROFILE_ACCESS_STATES.ACTIVE
      || auth?.status !== 'signed-in'
      || !previousState.ownerId
      || auth.userId !== previousState.ownerId
      || previousActivation?.ownerId !== previousState.ownerId
      || !Number.isSafeInteger(previousActivation.generation)
      || !Number.isSafeInteger(previousActivation.revision)
      || typeof cloudPersistence.importProfile !== 'function'
    ) return { status: 'owner-required' }

    let protectedImport
    try {
      protectedImport = await cloudPersistence.importProfile(profile, {
        activation: previousActivation,
        confirmed: true,
        isCurrent: () => (
          getCurrentActivationFor(previousProfile) === previousActivation
        )
      })
    } catch {
      protectedImport = { status: 'unavailable' }
    }

    const currentAuth = authentication.getObservation()
    if (
      getCurrentActivationFor(previousProfile) !== previousActivation
      || currentAuth?.status !== 'signed-in'
      || currentAuth.userId !== previousState.ownerId
    ) {
      if (protectedImport?.status === 'protected') {
        try {
          await cloudPersistence.rollbackImport?.(protectedImport)
        } catch {}
      }
      return { status: 'owner-required' }
    }
    if (protectedImport?.status !== 'protected') {
      return { status: protectedImport?.status || 'failed' }
    }
    if (
      protectedImport.ownerId !== previousState.ownerId
      || protectedImport.profileId !== previousState.profileId
      || protectedImport.generation !== previousActivation.generation
      || protectedImport.baseRevision < previousActivation.revision
      || protectedImport.revision !== protectedImport.baseRevision + 1
      || !Number.isFinite(protectedImport.protectedUntil)
      || protectedImport.protectedUntil <= clock.now()
    ) {
      try {
        await cloudPersistence.rollbackImport?.(protectedImport)
      } catch {}
      return { status: 'failed' }
    }

    releaseActiveProfile()
    const identity = {
      generation: protectedImport.generation,
      ownerId: protectedImport.ownerId,
      profileId: protectedImport.profileId,
      revision: protectedImport.revision
    }
    let replacementActivation = null
    const rollbackToPreviousProfile = async () => {
      if (replacementActivation) {
        localPersistence.releaseActivation(replacementActivation)
        replacementActivation = null
      }
      let rollback = null
      try {
        rollback = await cloudPersistence.rollbackImport?.(protectedImport)
      } catch {}
      if (!['rolled-back', 'already-rolled-back'].includes(rollback?.status)) {
        publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
        return { status: 'recovery-required' }
      }
      if (rollback.revision !== protectedImport.revision + 1) {
        publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
        return { status: 'recovery-required' }
      }
      const restored = localPersistence.reconcileSignedInProfile(
        previousProfile,
        {
          generation: protectedImport.generation,
          ownerId: protectedImport.ownerId,
          profileId: protectedImport.profileId,
          revision: rollback.revision
        }
      )
      const localProfile = restored ? localPersistence.read() : null
      if (
        !isSignedInProfile(localProfile)
        || localProfile.ownerId !== previousState.ownerId
        || localProfile.profileId !== previousState.profileId
        || localProfile.generation !== previousActivation.generation
        || localProfile.revision !== rollback.revision
      ) {
        publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
        return { status: 'recovery-required' }
      }
      if (rollback.cleanupPending || rollback.syncRecordPending) {
        publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
        return { status: 'recovery-required' }
      }
      activate(localProfile, {
        offlineExpiresAt: previousState.ownerId
          ? previousOfflineExpiresAt
          : null
      })
      return { status: 'rolled-back' }
    }
    const reconciled = localPersistence.reconcileSignedInProfile(
      profile,
      identity
    )
    if (!reconciled) return rollbackToPreviousProfile()
    const localProfile = localPersistence.read()
    if (
      !isSignedInProfile(localProfile)
      || localProfile.ownerId !== identity.ownerId
      || localProfile.profileId !== identity.profileId
      || localProfile.generation !== identity.generation
      || localProfile.revision !== identity.revision
    ) return rollbackToPreviousProfile()
    replacementActivation = prepareActivation(localProfile)
    if (!replacementActivation) return rollbackToPreviousProfile()
    if (cloudPersistence.confirmImport?.(protectedImport, {
      isCurrent: () => {
        const auth = authentication.getObservation()
        const local = localPersistence.read()
        return auth?.status === 'signed-in'
          && auth.userId === identity.ownerId
          && localPersistence.isActivationCurrent(replacementActivation)
          && isSignedInProfile(local)
          && local.ownerId === identity.ownerId
          && local.profileId === identity.profileId
          && local.generation === identity.generation
          && local.revision === identity.revision
      }
    }) !== true) {
      return rollbackToPreviousProfile()
    }
    const activated = activateProfile(localProfile, replacementActivation)
    const activation = replacementActivation
    replacementActivation = null
    if (activated.status !== LEARNER_PROFILE_ACCESS_STATES.ACTIVE) {
      return rollbackToPreviousProfile()
    }
    ownerVerification?.record?.({
      ownerId: identity.ownerId,
      verifiedAt: clock.now()
    })
    analytics.profileSaved(profile, { activation })
    return { status: 'imported' }
  }

  async function exportActiveProfile() {
    const profile = readActiveProfile()
    if (!profile) return false
    const activation = currentState.activation
    return await exportDownload.download(profile, {
      activation,
      exportedAt: clock.now(),
      isCurrent: () => getCurrentActivationFor(profile) === activation
    }) === true
  }

  function readRecoveryCandidate(candidateId) {
    if (
      currentState.status !== LEARNER_PROFILE_ACCESS_STATES.RECOVERING
      || typeof candidateId !== 'string'
      || !candidateId
    ) return null
    return currentState.recovery?.candidates?.find(
      candidate => candidate?.id === candidateId
    ) || null
  }

  async function exportRecoveryCandidate(candidateId) {
    const recovery = currentState.recovery
    const candidate = readRecoveryCandidate(candidateId)
    if (!candidate) return false
    let profile = null
    if (candidate.source === LEARNER_PROFILE_RECOVERY_SOURCES.LOCAL) {
      const auth = authentication.getObservation()
      const localProfile = localPersistence.read()
      if (
        auth?.status !== 'signed-in'
        || localProfile?.status !== 'ready'
        || localProfile.ownerId !== auth.userId
      ) return false
      profile = localProfile.profile
    } else if (candidate.source === LEARNER_PROFILE_RECOVERY_SOURCES.PROTECTED) {
      let result
      try {
        result = await cloudPersistence.readRecoveryCandidate({ candidate })
      } catch {
        result = null
      }
      if (
        currentState.recovery !== recovery
        || result?.status !== 'ready'
        || !result.profile
        || typeof result.profile !== 'object'
      ) return false
      profile = result.profile
    }
    if (!profile || typeof profile !== 'object') return false
    return await exportDownload.download(profile, {
      exportedAt: clock.now(),
      isCurrent: () => currentState.recovery === recovery
        && readRecoveryCandidate(candidateId) === candidate,
      side: candidate.source === LEARNER_PROFILE_RECOVERY_SOURCES.LOCAL
        ? 'device'
        : 'cloud'
    }) === true
  }

  async function restoreRecoveryCandidate(
    candidateId,
    { confirmed = false } = {}
  ) {
    if (confirmed !== true) return false
    const recovery = currentState.recovery
    const candidate = readRecoveryCandidate(candidateId)
    const auth = authentication.getObservation()
    if (!candidate || auth?.status !== 'signed-in' || !auth.userId) {
      return false
    }
    let result
    try {
      result = await cloudPersistence.restoreRecoveryCandidate({
        authentication: auth,
        candidate,
        confirmed: true,
        localProfile: localPersistence.read()
      })
    } catch {
      result = null
    }
    if (
      currentState.recovery !== recovery
      || readRecoveryCandidate(candidateId) !== candidate
    ) return false
    if (result?.status === 'restored') {
      evaluate()
      return true
    }
    publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING, {
      recovery: {
        ...recovery,
        feedback: LEARNER_PROFILE_RECOVERY_FEEDBACK.RESTORE_FAILED
      }
    })
    return false
  }

  function retryCloudBackup() {
    const profile = readActiveProfile()
    const activation = currentState.activation
    if (!profile || !activation?.ownerId) return false
    if (cloudPersistence.requiresCloudHeadResolution?.() === true) {
      const auth = authentication.getObservation()
      const localProfile = localPersistence.read()
      if (
        auth?.status !== 'signed-in'
        || auth.userId !== activation.ownerId
        || !isSignedInProfile(localProfile)
        || localProfile.ownerId !== activation.ownerId
      ) return false
      const requestId = ++resolutionId
      resolveCloudProfile({
        auth,
        localProfile,
        purpose: 'resolve-signed-in-profile',
        requestId
      })
      return true
    }
    try {
      if (cloudPersistence.retry?.() === true) return true
    } catch {}
    return enqueueCloudSave(profile, activation)
  }

  function installCloudProfileTransition(result, {
    protectedConflicts = [],
    protectedReset = null
  } = {}) {
    if (
      !result
      || typeof result.ownerId !== 'string'
      || !result.ownerId
      || typeof result.profileId !== 'string'
      || !result.profileId
      || !result.profile
      || typeof result.profile !== 'object'
      || Array.isArray(result.profile)
      || !Number.isSafeInteger(result.generation)
      || result.generation <= 0
      || !Number.isSafeInteger(result.revision)
      || result.revision <= 0
    ) return false
    releaseActiveProfile()
    const localBeforeChoice = localPersistence.read()
    const provisionalProfileId = isSignedInProfile(localBeforeChoice)
        && localBeforeChoice.ownerId === result.ownerId
        && localBeforeChoice.generation === undefined
        && localBeforeChoice.revision === undefined
      ? localBeforeChoice.profileId
      : null
    const reconciled = localPersistence.reconcileSignedInProfile(
      result.profile,
      {
        generation: result.generation,
        ownerId: result.ownerId,
        ...(provisionalProfileId
          ? { previousProfileId: provisionalProfileId }
          : {}),
        profileId: result.profileId,
        revision: result.revision
      }
    )
    if (!reconciled) {
      publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
      return false
    }
    const localProfile = localPersistence.read()
    if (
      !isSignedInProfile(localProfile)
      || localProfile.ownerId !== result.ownerId
      || localProfile.profileId !== result.profileId
      || localProfile.generation !== result.generation
      || localProfile.revision !== result.revision
    ) {
      publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
      return false
    }
    const activation = prepareActivation(localProfile)
    if (!activation) {
      publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
      return false
    }
    const activated = activateProfile(localProfile, activation, {
      protectedConflicts,
      protectedReset
    })
    if (activated.status !== LEARNER_PROFILE_ACCESS_STATES.ACTIVE) return false
    ownerVerification?.record?.({
      ownerId: result.ownerId,
      verifiedAt: clock.now()
    })
    if (accountlessProfileMigration?.hasPendingMigration?.()) {
      accountlessProfileMigration.complete?.()
    }
    return true
  }

  async function startOverProfile(profile, { confirmed = false } = {}) {
    const previousProfile = readActiveProfile()
    const previousState = currentState
    if (
      confirmed !== true
      || !previousProfile
      || !profile
      || typeof profile !== 'object'
      || Array.isArray(profile)
      || !previousState.ownerId
      || typeof cloudPersistence.startOver !== 'function'
    ) return false
    let result
    try {
      result = await cloudPersistence.startOver(profile, {
        activation: previousState.activation,
        confirmed: true,
        isCurrent: () => (
          currentState === previousState
          && getCurrentActivationFor(previousProfile)
            === previousState.activation
        )
      })
    } catch {
      result = null
    }
    const auth = authentication.getObservation()
    if (
      currentState !== previousState
      || getCurrentActivationFor(previousProfile) !== previousState.activation
      || auth?.status !== 'signed-in'
      || auth.userId !== previousState.ownerId
      || result?.status !== 'started-over'
      || result.ownerId !== previousState.ownerId
      || result.profileId !== previousState.profileId
      || result.protectedReset?.status !== 'available'
    ) return false
    const installed = installCloudProfileTransition(result, {
      protectedConflicts: previousState.protectedConflicts || [],
      protectedReset: result.protectedReset
    })
    if (!installed) return false
    analytics.profileStartedOver()
    return true
  }

  async function undoStartOver({ confirmed = false } = {}) {
    const previousProfile = readActiveProfile()
    const previousState = currentState
    const protectedReset = previousState.protectedReset
    if (
      confirmed !== true
      || !previousProfile
      || !previousState.ownerId
      || protectedReset?.status !== 'available'
      || typeof cloudPersistence.undoStartOver !== 'function'
    ) return false
    let result
    try {
      result = await cloudPersistence.undoStartOver({
        activation: previousState.activation,
        confirmed: true,
        isCurrent: () => (
          currentState === previousState
          && getCurrentActivationFor(previousProfile)
            === previousState.activation
        ),
        protectedReset
      })
    } catch {
      result = null
    }
    const auth = authentication.getObservation()
    if (
      currentState !== previousState
      || getCurrentActivationFor(previousProfile) !== previousState.activation
      || auth?.status !== 'signed-in'
      || auth.userId !== previousState.ownerId
      || result?.status !== 'undone'
      || result.ownerId !== previousState.ownerId
      || result.profileId !== previousState.profileId
      || result.generation !== previousState.activation?.generation
      || result.revision <= previousState.activation?.revision
    ) return false
    return installCloudProfileTransition(result, {
      protectedConflicts: previousState.protectedConflicts || []
    })
  }

  function exportConflictVersion(side, conflictId = null) {
    const protectedConflicts = currentState.protectedConflicts || []
    const conflict = currentState.status
        === LEARNER_PROFILE_ACCESS_STATES.CONFLICTING
      ? currentState.conflict
      : currentState.status === LEARNER_PROFILE_ACCESS_STATES.ACTIVE
        ? protectedConflicts.find(item => (
            conflictId ? item.id === conflictId : protectedConflicts.length === 1
          ))
        : null
    const version = ['device', 'cloud'].includes(side)
      ? conflict?.[side]
      : null
    if (!version?.profile || typeof version.profile !== 'object') return false
    return exportDownload.download(version.profile, {
      conflictId: conflict.id,
      exportedAt: clock.now(),
      isCurrent: () => (
        currentState.status === LEARNER_PROFILE_ACCESS_STATES.CONFLICTING
          && currentState.conflict === conflict
      ) || (
        currentState.status === LEARNER_PROFILE_ACCESS_STATES.ACTIVE
          && currentState.protectedConflicts?.includes(conflict)
      ),
      side
    }) === true
  }

  async function chooseConflictVersion(side, { confirmed = false } = {}) {
    if (
      confirmed !== true
      || !['device', 'cloud'].includes(side)
      || currentState.status !== LEARNER_PROFILE_ACCESS_STATES.CONFLICTING
      || !currentState.conflict
      || typeof cloudPersistence.chooseConflict !== 'function'
    ) return false
    const conflict = currentState.conflict
    let result
    try {
      result = await cloudPersistence.chooseConflict({
        confirmed: true,
        conflict,
        selectedSide: side
      })
    } catch {
      result = null
    }
    const auth = authentication.getObservation()
    if (
      currentState.status !== LEARNER_PROFILE_ACCESS_STATES.CONFLICTING
      || currentState.conflict !== conflict
      || auth?.status !== 'signed-in'
      || auth.userId !== conflict.ownerId
    ) return false
    if (
      result?.status === 'conflict-changed'
      && result.conflict?.status === 'open'
      && result.conflict.ownerId === conflict.ownerId
      && result.conflict.profileId === conflict.profileId
      && result.conflict.id === conflict.id
    ) {
      publish(LEARNER_PROFILE_ACCESS_STATES.CONFLICTING, {
        conflict: result.conflict,
        ownerId: result.conflict.ownerId,
        profileId: result.conflict.profileId
      })
      return false
    }
    if (
      result?.status !== 'chosen'
      || result.ownerId !== conflict.ownerId
      || typeof result.profileId !== 'string'
      || !result.profileId
      || !result.profile
      || typeof result.profile !== 'object'
      || !Number.isSafeInteger(result.generation)
      || result.generation <= 0
      || !Number.isSafeInteger(result.revision)
      || result.revision <= 0
      || result.selectedSide !== side
      || result.conflict?.status !== 'resolved'
      || result.conflict.id !== conflict.id
      || !Array.isArray(result.protectedConflicts)
      || !result.protectedConflicts.some(item => (
        item?.id === result.conflict.id
        && item.selectedSide === result.conflict.selectedSide
        && item.protectedUntil === result.conflict.protectedUntil
      ))
      || !Number.isFinite(result.protectedUntil)
      || result.protectedUntil <= clock.now()
    ) {
      publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
      return false
    }
    return installCloudProfileTransition(result, {
      protectedConflicts: result.protectedConflicts
    })
  }

  async function finishOwnerReplacement({
    auth,
    localProfile,
    protection,
    requestId,
    transition: existingTransition = null
  }) {
    let transition = existingTransition
    try {
      const result = await cloudPersistence.resolve({
        authentication: auth,
        connectivity: connectivity.getObservation(),
        localProfile,
        purpose: 'replace-owner-profile'
      })
      const currentAuth = authentication.getObservation()
      const currentLocal = localPersistence.read()
      const localIsCurrent = transition
        ? currentLocal?.status === 'replacing'
          && currentLocal.transitionId === transition.id
          && currentLocal.nextOwnerId === transition.nextOwnerId
        : currentLocal?.status === 'ready'
          && currentLocal.ownerId === localProfile.ownerId
          && currentLocal.profileId === localProfile.profileId
      if (
        requestId !== resolutionId
        || currentState.status !== LEARNER_PROFILE_ACCESS_STATES.REPLACING
        || currentAuth?.status !== 'signed-in'
        || currentAuth.userId !== auth.userId
        || !localIsCurrent
        || result?.status !== 'activate'
        || result.ownerId !== auth.userId
        || typeof result.profileId !== 'string'
        || !result.profileId
        || !result.profile
        || typeof result.profile !== 'object'
        || !Number.isSafeInteger(result.generation)
        || result.generation <= 0
        || !Number.isSafeInteger(result.revision)
        || result.revision <= 0
      ) throw new TypeError('Owner replacement could not be prepared')

      if (!transition) {
        transition = localPersistence.beginOwnerReplacement({
          id: `replacement-${createActivationId()}`,
          nextOwnerId: result.ownerId,
          previousOwnerId: localProfile.ownerId,
          previousProfileId: localProfile.profileId,
          protection,
          startedAt: clock.now()
        })
      }
      if (!transition) {
        throw new TypeError('Owner replacement could not be fenced')
      }
      if (cloudPersistence.commitReplacement(result, transition) !== true) {
        throw new TypeError('Owner replacement sync state could not be installed')
      }
      const completed = await localPersistence.completeOwnerReplacement(
        result.profile,
        {
          generation: result.generation,
          ownerId: result.ownerId,
          profileId: result.profileId,
          revision: result.revision
        },
        transition
      )
      if (!completed) {
        throw new TypeError('Owner replacement could not be persisted')
      }
      ownerVerification?.record?.({
        ownerId: result.ownerId,
        verifiedAt: clock.now()
      })
      publish(LEARNER_PROFILE_ACCESS_STATES.RELOADING)
      return true
    } catch {
      if (requestId !== resolutionId) return false
      if (transition) {
        publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
      } else {
        publishAccountChange(localPersistence.read())
      }
      return false
    }
  }

  async function replaceOwnerProfile({
    confirmed = false,
    protection
  } = {}) {
    if (
      currentState.status !== LEARNER_PROFILE_ACCESS_STATES.ACCOUNT_CHANGE
      || !['discarded', 'exported', 'synchronized'].includes(protection)
    ) return false
    const auth = authentication.getObservation()
    const localProfile = localPersistence.read()
    if (
      auth?.status !== 'signed-in'
      || !auth.userId
      || !isSignedInProfile(localProfile)
      || localProfile.ownerId === auth.userId
    ) return false

    const protectionStatus = cloudPersistence.getReplacementProtection?.(
      localProfile
    ) || 'blocked'
    if (
      protection === 'synchronized'
      && protectionStatus !== 'synchronized'
    ) return false
    if (protection === 'discarded' && confirmed !== true) return false
    if (protection === 'exported') {
      const downloaded = await exportDownload.download(localProfile.profile, {
        exportedAt: clock.now(),
        isCurrent: () => {
          const currentAuth = authentication.getObservation()
          const currentLocal = localPersistence.read()
          return currentState.status
              === LEARNER_PROFILE_ACCESS_STATES.ACCOUNT_CHANGE
            && currentAuth?.status === 'signed-in'
            && currentAuth.userId === auth.userId
            && currentLocal?.status === 'ready'
            && currentLocal.ownerId === localProfile.ownerId
            && currentLocal.profileId === localProfile.profileId
        }
      })
      if (downloaded !== true) return false
    }

    const requestId = ++resolutionId
    publish(LEARNER_PROFILE_ACCESS_STATES.REPLACING)
    return finishOwnerReplacement({
      auth,
      localProfile,
      protection,
      requestId
    })
  }

  function start() {
    if (started) return currentState
    started = true
    cloudPersistence.start?.()
    unsubscribeAuthentication = authentication.subscribe(evaluate)
    if (typeof cloudPersistence.subscribe === 'function') {
      unsubscribeCloudPersistence = cloudPersistence.subscribe(
        handleCloudPersistenceState
      )
    }
    unsubscribeConnectivity = connectivity.subscribe(() => {
      if (
        currentState.status === LEARNER_PROFILE_ACCESS_STATES.ACTIVE
        && getCurrentActivationFor(activeProfile)
      ) {
        if (
          !currentState.ownerId
          || connectivity.getObservation()?.status === 'online'
        ) return
        const verification = requireCurrentOwnerVerification()
        if (verification) applyOfflineVerificationDeadline(verification)
        return
      }
      evaluate()
    })
    unsubscribeLocalPersistence = localPersistence.subscribe(() => {
      if (currentState.status !== LEARNER_PROFILE_ACCESS_STATES.ACTIVE) {
        evaluate()
        return
      }
      if (localPersistence.isActivationCurrent(currentState.activation)) return
      releaseActiveProfile()
      publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
    })
    if (typeof ownerVerification?.subscribe === 'function') {
      unsubscribeOwnerVerification = ownerVerification.subscribe(
        handleOwnerVerificationChange
      )
    }
    return evaluate()
  }

  function refresh() {
    return started ? evaluate() : currentState
  }

  function destroy() {
    resolutionId += 1
    releaseActiveProfile()
    unsubscribeAuthentication?.()
    unsubscribeCloudPersistence?.()
    unsubscribeConnectivity?.()
    unsubscribeLocalPersistence?.()
    unsubscribeOwnerVerification?.()
    cloudPersistence.destroy?.()
    unsubscribeAuthentication = null
    unsubscribeCloudPersistence = null
    unsubscribeConnectivity = null
    unsubscribeLocalPersistence = null
    unsubscribeOwnerVerification = null
    started = false
  }

  return Object.freeze({
    chooseConflictVersion,
    destroy,
    exportActiveProfile,
    exportConflictVersion,
    exportRecoveryCandidate,
    getState: () => currentState,
    importActiveProfile,
    readActiveProfile,
    refresh,
    replaceOwnerProfile,
    replaceActiveProfile,
    retryCloudBackup,
    restoreRecoveryCandidate,
    saveActiveProfile,
    start,
    startOverProfile,
    undoStartOver
  })
}
