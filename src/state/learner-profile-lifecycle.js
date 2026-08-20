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

function isAccountlessProfile(localProfile) {
  return localProfile?.status === 'ready' && !localProfile.ownerId
}

function isOwnedProfile(localProfile) {
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
    localPersistence
  } = adapters
  let currentState = EMPTY_ACCESS_STATE
  let activeProfile = null
  let started = false
  let resolutionId = 0
  const profileActivations = new WeakMap()
  let unsubscribeAuthentication = null
  let unsubscribeConnectivity = null
  let unsubscribeLocalPersistence = null

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
    if (activation) localPersistence.releaseActivation(activation)
  }

  function activate(localProfile) {
    releaseActiveProfile()
    const activation = Object.freeze({
      activatedAt: clock.now(),
      id: createActivationId(),
      ownerId: localProfile.ownerId || null,
      profileId: localProfile.profileId
    })
    if (!localPersistence.claimActivation(activation)) {
      return publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
    }
    activeProfile = localProfile.profile
    profileActivations.set(activeProfile, activation)
    publish(LEARNER_PROFILE_ACCESS_STATES.ACTIVE, {
      activation,
      ownerId: activation.ownerId,
      profileId: activation.profileId
    })
    analytics.profileActivated({
      activation,
      ownerId: activation.ownerId,
      profileId: activation.profileId
    })
    return currentState
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
      if (
        result.status === 'activate'
        && result.ownerId === auth.userId
        && typeof result.profileId === 'string'
        && result.profileId
        && result.profile
        && typeof result.profile === 'object'
      ) {
        let resolvedProfile = result.profile
        if (localProfile?.status === 'empty') {
          if (!localPersistence.installOwnedProfile(result.profile, {
            installedAt: clock.now(),
            ownerId: result.ownerId,
            profileId: result.profileId
          })) {
            publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
            return
          }
          const installedProfile = localPersistence.read()
          if (
            !isOwnedProfile(installedProfile)
            || installedProfile.ownerId !== result.ownerId
            || installedProfile.profileId !== result.profileId
          ) {
            publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
            return
          }
          resolvedProfile = installedProfile.profile
        }
        if (typeof result.finalize === 'function' && !result.finalize()) {
          publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
          return
        }
        activate({
          ownerId: result.ownerId,
          profile: resolvedProfile,
          profileId: result.profileId,
          status: 'ready'
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
      if (isOwnedProfile(localProfile) && localProfile.ownerId !== auth.userId) {
        return publish(LEARNER_PROFILE_ACCESS_STATES.CONFLICTING)
      }
      publish(LEARNER_PROFILE_ACCESS_STATES.WAITING_CLOUD)
      resolveCloudProfile({
        auth,
        localProfile,
        purpose: 'resolve-owned-profile',
        requestId
      })
      return currentState
    }
    if (auth.status === 'signed-out') {
      if (isAccountlessProfile(localProfile)) return activate(localProfile)
      releaseActiveProfile()
      return publish(
        isOwnedProfile(localProfile)
          ? LEARNER_PROFILE_ACCESS_STATES.LOCKED
          : localProfile?.status === 'invalid'
            ? LEARNER_PROFILE_ACCESS_STATES.RECOVERING
            : LEARNER_PROFILE_ACCESS_STATES.WAITING_AUTHENTICATION
      )
    }
    if (auth.status === 'unavailable') {
      if (isAccountlessProfile(localProfile)) return activate(localProfile)
      releaseActiveProfile()
      return publish(
        isOwnedProfile(localProfile) || localProfile?.status === 'invalid'
          ? LEARNER_PROFILE_ACCESS_STATES.RECOVERING
          : LEARNER_PROFILE_ACCESS_STATES.WAITING_AUTHENTICATION
      )
    }
    releaseActiveProfile()
    return publish(LEARNER_PROFILE_ACCESS_STATES.RESOLVING)
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
    if (!localPersistence.isActivationCurrent(activation)) {
      releaseActiveProfile()
      publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
      return null
    }
    return activation
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
    releaseActiveProfile()
    const activation = Object.freeze({
      activatedAt: clock.now(),
      id: createActivationId(),
      ownerId: previousState.ownerId,
      profileId: previousState.profileId
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
    activeProfile = profile
    profileActivations.set(profile, activation)
    publish(LEARNER_PROFILE_ACCESS_STATES.ACTIVE, {
      activation,
      ownerId: activation.ownerId,
      profileId: activation.profileId
    })
    analytics.profileActivated({
      activation,
      ownerId: activation.ownerId,
      profileId: activation.profileId
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

  function start() {
    if (started) return currentState
    started = true
    unsubscribeAuthentication = authentication.subscribe(evaluate)
    unsubscribeConnectivity = connectivity.subscribe(evaluate)
    unsubscribeLocalPersistence = localPersistence.subscribe(() => {
      if (currentState.status !== LEARNER_PROFILE_ACCESS_STATES.ACTIVE) {
        evaluate()
        return
      }
      if (localPersistence.isActivationCurrent(currentState.activation)) return
      releaseActiveProfile()
      publish(LEARNER_PROFILE_ACCESS_STATES.RECOVERING)
    })
    return evaluate()
  }

  function refresh() {
    return started ? evaluate() : currentState
  }

  function destroy() {
    resolutionId += 1
    releaseActiveProfile()
    unsubscribeAuthentication?.()
    unsubscribeConnectivity?.()
    unsubscribeLocalPersistence?.()
    unsubscribeAuthentication = null
    unsubscribeConnectivity = null
    unsubscribeLocalPersistence = null
    started = false
  }

  return Object.freeze({
    destroy,
    exportActiveProfile,
    getState: () => currentState,
    readActiveProfile,
    refresh,
    replaceActiveProfile,
    saveActiveProfile,
    start
  })
}
