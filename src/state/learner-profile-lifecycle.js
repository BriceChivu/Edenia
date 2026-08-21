export const LEARNER_PROFILE_ACCESS_STATES = Object.freeze({
  ACTIVE: 'active',
  CONFLICTING: 'conflicting',
  LOCKED: 'locked',
  MIGRATING: 'migrating',
  RECOVERING: 'recovering',
  RESOLVING: 'resolving',
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
    ownerId = null,
    profileId = null
  } = {}) {
    currentState = Object.freeze({
      activation,
      ownerId,
      profileId,
      status
    })
    onStateChange(currentState)
    analytics.accessChanged(currentState)
    return currentState
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
    offlineExpiresAt = null
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
      profileId: activation.profileId
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
    if (!activation.ownerId) return
    Promise.resolve(cloudPersistence.save(profile, {
      activation,
      isCurrent: () => Boolean(getCurrentActivationFor(profile))
    })).catch(() => {})
  }

  function resolveCloudProfile({ auth, localProfile, purpose, requestId }) {
    Promise.resolve(cloudPersistence.resolve({
      authentication: auth,
      connectivity: connectivity.getObservation(),
      localProfile,
      purpose
    })).then(result => {
      if (requestId !== resolutionId) return
      if (!result || result.status === 'waiting') return
      if (result.status === 'waiting-cloud') {
        const verification = auth.userId === localProfile?.ownerId
          ? getCurrentOfflineVerification(localProfile)
          : null
        if (verification) {
          activateOffline(localProfile, verification)
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
        let resolvedProfile = result.profile
        if (localProfile?.status === 'empty') {
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
          if (!localPersistence.reconcileSignedInProfile(result.profile, {
            generation: result.generation,
            ownerId: result.ownerId,
            profileId: result.profileId,
            revision: result.revision
          })) {
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
        const activationState = activateProfile(activationProfile, activation)
        if (activationState.status !== LEARNER_PROFILE_ACCESS_STATES.ACTIVE) {
          return
        }
        ownerVerification?.record?.({
          ownerId: auth.userId,
          verifiedAt: clock.now()
        })
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
        }
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
      if (result.status !== 'waiting-cloud') ownerVerification?.clear?.()
      publish(
        resultStates[result.status]
          || LEARNER_PROFILE_ACCESS_STATES.RECOVERING
      )
    }).catch(() => {
      if (requestId === resolutionId) {
        publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
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
      if (isSignedInProfile(localProfile) && localProfile.ownerId !== auth.userId) {
        ownerVerification?.clear?.()
        return publish(LEARNER_PROFILE_ACCESS_STATES.CONFLICTING)
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
    publish(LEARNER_PROFILE_ACCESS_STATES.CONFLICTING)
  }

  function readActiveProfile() {
    if (!getCurrentActivationFor(activeProfile)) return null
    return activeProfile
  }

  function saveActiveProfile(profile, options = {}) {
    const activation = getCurrentActivationFor(profile)
    if (!activation) return false
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

  function exportActiveProfile() {
    const profile = readActiveProfile()
    if (!profile) return false
    const activation = currentState.activation
    return exportDownload.download(profile, {
      activation,
      exportedAt: clock.now(),
      isCurrent: () => getCurrentActivationFor(profile) === activation
    }) === true
  }

  function retryCloudBackup() {
    const profile = readActiveProfile()
    const activation = currentState.activation
    if (!profile || !activation?.ownerId) return false
    try {
      if (cloudPersistence.retry?.() === true) return true
    } catch {}
    enqueueCloudSave(profile, activation)
    return true
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
    destroy,
    exportActiveProfile,
    getState: () => currentState,
    readActiveProfile,
    refresh,
    replaceActiveProfile,
    retryCloudBackup,
    saveActiveProfile,
    start
  })
}
