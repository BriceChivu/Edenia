import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLearnerProfileLifecycleAuthority,
  LEARNER_PROFILE_ACCESS_STATES
} from '../../src/state/learner-profile-lifecycle.js'
import {
  createLearnerProfileLocalPersistenceAdapter
} from '../../src/state/learner-profile-local-adapter.js'
import {
  createLearnerProfileAuthenticationAdapter
} from '../../src/integrations/learner-profile-authentication-adapter.js'
import {
  createStateStore
} from '../../src/state/store.js'

function deferred() {
  let resolve
  const promise = new Promise(next => { resolve = next })
  return { promise, resolve }
}

function createObservationAdapter(initialObservation) {
  let observation = initialObservation
  const listeners = new Set()
  return {
    getObservation: () => observation,
    publish(nextObservation) {
      observation = nextObservation
      for (const listener of listeners) listener(observation)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

function createHarness({
  authentication = { status: 'signed-out', userId: null },
  connectivity = { status: 'online' },
  local = {
    status: 'ready',
    profile: { learnerProfile: { languages: ['french'] } },
    profileId: 'accountless:browser',
    ownerId: null
  },
  claimActivationResult = true,
  cloudChoice = { status: 'recovering' },
  cloudImport = { status: 'failed' },
  cloudImportConfirmationResult = true,
  cloudImportRollback = context => ({
    revision: context.revision + 1,
    status: 'rolled-back'
  }),
  cloudResolution = { status: 'waiting' },
  cloudRetryResult = false,
  cloudSyncState = { status: 'idle' },
  completeOnboardingFinalizationResult = true,
  reconcileSignedInProfileResult = true,
  markDirtyResult = null,
  now = 1_786_982_400_000,
  ownerVerification = null
} = {}) {
  const authenticationAdapter = createObservationAdapter(authentication)
  const connectivityAdapter = createObservationAdapter(connectivity)
  const cloudDeferred = deferred()
  const cloudListeners = new Set()
  const ownerVerificationListeners = new Set()
  const calls = []
  let currentNow = now
  let currentFence = null
  let currentLocal = local
  let currentOwnerVerification = ownerVerification
  let scheduledTimer = null
  const authority = createLearnerProfileLifecycleAuthority({
    adapters: {
      analytics: {
        accessChanged(state) {
          calls.push(['analytics-access', state.status])
        },
        profileActivated(context) {
          calls.push(['analytics-activated', context.profileId])
        },
        profileSaved(profile, context) {
          calls.push(['analytics-saved', profile, context.activation.id])
        }
      },
      authentication: authenticationAdapter,
      clock: {
        clearTimer(timer) {
          calls.push(['clock-clear', timer])
          if (scheduledTimer?.id === timer) scheduledTimer = null
        },
        now: () => currentNow,
        setTimer(callback, delay) {
          scheduledTimer = { callback, delay, id: 'offline-expiry-timer' }
          calls.push(['clock-set', delay])
          return scheduledTimer.id
        }
      },
      cloudPersistence: {
        activate(context) {
          calls.push(['cloud-activate', context])
          return true
        },
        chooseConflict(context) {
          calls.push(['cloud-choose-conflict', context])
          return Promise.resolve(cloudChoice)
        },
        confirmImport(context) {
          calls.push(['cloud-confirm-import', context])
          return cloudImportConfirmationResult
        },
        importProfile(profile, context) {
          calls.push(['cloud-import', profile, context])
          return Promise.resolve(
            typeof cloudImport === 'function'
              ? cloudImport(profile, context)
              : cloudImport
          )
        },
        rollbackImport(context) {
          calls.push(['cloud-rollback-import', context])
          return Promise.resolve(
            typeof cloudImportRollback === 'function'
              ? cloudImportRollback(context)
              : cloudImportRollback
          )
        },
        ...(markDirtyResult === null ? {} : {
          markDirty(context) {
            calls.push(['cloud-mark-dirty', context])
            return markDirtyResult
          }
        }),
        resolve(context) {
          calls.push(['cloud-resolve', context])
          return cloudResolution === 'deferred'
            ? cloudDeferred.promise
            : typeof cloudResolution === 'function'
              ? cloudResolution(context)
              : cloudResolution
        },
        getState() {
          return cloudSyncState
        },
        requiresCloudHeadResolution() {
          return cloudSyncState.status === 'not-yet-backed-up'
        },
        retry() {
          calls.push(['cloud-retry'])
          return cloudRetryResult
        },
        save(profile, context) {
          calls.push(['cloud-save', profile, context])
          return Promise.resolve({ status: 'saved' })
        },
        subscribe(listener) {
          cloudListeners.add(listener)
          return () => cloudListeners.delete(listener)
        }
      },
      connectivity: connectivityAdapter,
      exportDownload: {
        download(profile, context) {
          calls.push([
            'download',
            profile,
            context.activation?.id || null,
            context
          ])
          return true
        }
      },
      ownerVerification: {
        clear() {
          calls.push(['owner-verification-clear'])
          currentOwnerVerification = null
          return true
        },
        read() {
          calls.push(['owner-verification-read'])
          return currentOwnerVerification
        },
        record(record) {
          calls.push(['owner-verification-record', record])
          currentOwnerVerification = record
          return true
        },
        subscribe(listener) {
          ownerVerificationListeners.add(listener)
          return () => ownerVerificationListeners.delete(listener)
        }
      },
      localPersistence: {
        adoptCloudIdentity(identity) {
          calls.push(['adopt-cloud-identity', identity])
          currentLocal = {
            ...currentLocal,
            generation: identity.generation,
            profileId: identity.profileId,
            revision: identity.revision
          }
          return true
        },
        installSignedInProfile(profile, identity) {
          calls.push(['install', profile, identity])
          currentLocal = {
            generation: identity.generation,
            ownerId: identity.ownerId,
            profile,
            profileId: identity.profileId,
            revision: identity.revision,
            status: 'ready'
          }
          if (identity.onboardingFinalizationPending) {
            currentLocal.onboardingFinalizationPending = true
          }
          return true
        },
        claimActivation(fence) {
          calls.push(['claim', fence])
          if (!claimActivationResult) return false
          currentFence = fence
          return true
        },
        completeOnboardingFinalization(fence) {
          calls.push(['complete-onboarding-finalization', fence])
          if (!completeOnboardingFinalizationResult) return false
          delete currentLocal.onboardingFinalizationPending
          return true
        },
        isActivationCurrent(fence) {
          return currentFence?.id === fence?.id
        },
        read() {
          calls.push(['local-read'])
          return currentLocal
        },
        reconcileSignedInProfile(profile, identity) {
          calls.push(['reconcile', profile, identity])
          const reconciled = typeof reconcileSignedInProfileResult === 'function'
            ? reconcileSignedInProfileResult(profile, identity)
            : reconcileSignedInProfileResult
          if (!reconciled) return false
          currentLocal = {
            generation: identity.generation,
            ownerId: identity.ownerId,
            profile,
            profileId: identity.profileId,
            revision: identity.revision,
            status: 'ready'
          }
          return true
        },
        releaseActivation(fence) {
          calls.push(['release', fence.id])
          if (currentFence?.id === fence.id) currentFence = null
        },
        replace(profile, options, fence) {
          calls.push(['replace', profile, options, fence])
          return { persisted: true, error: null }
        },
        save(profile, options, fence) {
          calls.push(['local-save', profile, options, fence])
          return true
        },
        subscribe() {
          return () => {}
        }
      }
    },
    createActivationId: () => `activation-${calls.length + 1}`,
    onStateChange(state) {
      calls.push(['state', state.status])
    }
  })
  return {
    authentication: authenticationAdapter,
    authority,
    calls,
    cloudDeferred,
    connectivity: connectivityAdapter,
    getCurrentFence: () => currentFence,
    getLocal: () => currentLocal,
    getOwnerVerification: () => currentOwnerVerification,
    publishCloud(state) {
      for (const listener of cloudListeners) listener(state)
    },
    publishOwnerVerification() {
      for (const listener of ownerVerificationListeners) listener()
    },
    revokeOwnerVerification() {
      currentOwnerVerification = null
      for (const listener of ownerVerificationListeners) listener()
    },
    runScheduledTimer() {
      const timer = scheduledTimer
      scheduledTimer = null
      timer?.callback()
    },
    scheduledTimerDelay: () => scheduledTimer?.delay ?? null,
    setCurrentFence: fence => { currentFence = fence },
    setNow: value => { currentNow = value },
    setOwnerVerification: value => { currentOwnerVerification = value }
  }
}

function createPersistenceInterleavingHarness() {
  const accessStorageKey = 'edenia_v1_profile_access_v1'
  const storageKey = 'edenia_v1'
  const originalProfile = {
    config: {},
    learnerProfile: { languages: ['french'] }
  }
  const values = new Map([[storageKey, JSON.stringify(originalProfile)]])
  let prepareForPersistence = () => {}
  const storage = {
    getItem(key) {
      return values.get(key) ?? null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, value)
    }
  }
  const stateStore = createStateStore({
    storage,
    storageKey,
    normalizeLoadedState: () => false,
    normalizeStateBeforeSave() {
      prepareForPersistence()
      prepareForPersistence = () => {}
    },
    createStateBackup() {},
    pruneOldestStateBackup: () => false,
    saveConfigCookie() {},
    syncPersistedStateToAnalytics() {},
    getLatestBackupState: () => null,
    loadConfigCookie: () => null,
    createDefaultStateFromConfig: () => null
  })
  const createAdapter = () => createLearnerProfileLocalPersistenceAdapter({
    accessStorageKey,
    accountlessProfileId: `accountless:${storageKey}`,
    eventTarget: null,
    loadProfile: () => stateStore.loadState({ persistCleanup: false }),
    replaceProfile: stateStore.saveImportedState,
    saveProfile: stateStore.saveState,
    storage
  })
  const earlierTab = createAdapter()
  const laterTab = createAdapter()
  const earlierFence = {
    activatedAt: 100,
    id: 'earlier-tab',
    ownerId: null,
    profileId: `accountless:${storageKey}`
  }
  const laterFence = { ...earlierFence, activatedAt: 200, id: 'later-tab' }

  assert.equal(earlierTab.claimActivation(earlierFence), true)

  return {
    earlierFence,
    earlierTab,
    laterFence,
    laterTab,
    originalProfile,
    stateStore,
    interleaveNewerActivation() {
      prepareForPersistence = () => {
        assert.equal(laterTab.claimActivation(laterFence), true)
      }
    }
  }
}

test('authentication alone cannot expose or save an accountless learner profile', async () => {
  const harness = createHarness({
    authentication: {
      status: 'signed-in',
      userId: '123e4567-e89b-42d3-a456-426614174000'
    },
    cloudResolution: 'deferred'
  })

  harness.authority.start()

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.MIGRATING
  )
  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(
    harness.authority.saveActiveProfile({ learnerProfile: {} }),
    false
  )
  assert.equal(
    harness.calls.some(([name]) => name === 'local-save'),
    false
  )
  assert.equal(
    harness.calls.some(([name]) => name === 'cloud-save'),
    false
  )

  harness.cloudDeferred.resolve({ status: 'waiting' })
  await Promise.resolve()

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.MIGRATING
  )
  assert.equal(harness.authority.readActiveProfile(), null)
})

test('a restored owner session cannot write a matching local copy before cloud activation', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const localProfile = { learnerProfile: { languages: ['french'] } }
  const cloudProfile = { learnerProfile: { languages: ['mandarin'] } }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: 'deferred',
    local: {
      ownerId,
      profile: localProfile,
      profileId,
      status: 'ready'
    }
  })

  harness.authority.start()

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.WAITING_CLOUD
  )
  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(harness.authority.saveActiveProfile(localProfile), false)
  assert.equal(
    harness.calls.some(([name]) => name === 'local-save'),
    false
  )

  harness.cloudDeferred.resolve({
    finalize: () => true,
    generation: 1,
    ownerId,
    profile: cloudProfile,
    profileId,
    revision: 1,
    status: 'activate'
  })
  await Promise.resolve()

  assert.equal(harness.authority.readActiveProfile(), cloudProfile)
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.ACTIVE
  )
  assert.deepEqual(harness.getOwnerVerification(), {
    ownerId,
    verifiedAt: 1_786_982_400_000
  })
})

test('one fenced accountless profile becomes the only writable and exportable profile', async () => {
  const harness = createHarness()

  harness.authority.start()

  const profile = harness.authority.readActiveProfile()
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.ACTIVE
  )
  assert.equal(profile.learnerProfile.languages[0], 'french')
  assert.equal(harness.authority.getState().profileId, 'accountless:browser')
  assert.equal(harness.authority.getState().ownerId, null)
  assert.match(harness.authority.getState().activation.id, /^activation-/)

  profile.learnerProfile.languages = ['spanish']
  assert.equal(
    harness.authority.saveActiveProfile(profile, { backupReason: 'study' }),
    true
  )
  assert.equal(await harness.authority.exportActiveProfile(), true)
  assert.equal(
    harness.calls.filter(([name]) => name === 'local-save').length,
    1
  )
  assert.equal(
    harness.calls.filter(([name]) => name === 'cloud-save').length,
    0
  )
  assert.equal(
    harness.calls.filter(([name]) => name === 'download').length,
    1
  )
  const downloadContext = harness.calls.find(([name]) => name === 'download')[3]
  assert.equal(downloadContext.isCurrent(), true)

  harness.authentication.publish({ status: 'loading', userId: null })
  assert.equal(downloadContext.isCurrent(), false)
})

test('an explicit signed-in profile resolution fences delayed work from an earlier activation', async () => {
  const signedInProfile = {
    learnerProfile: { languages: ['mandarin'] },
    videos: { delayed: { id: 'delayed' } }
  }
  const harness = createHarness({
    authentication: {
      status: 'signed-in',
      userId: '123e4567-e89b-42d3-a456-426614174000'
    },
    cloudResolution: {
      generation: 1,
      status: 'activate',
      ownerId: '123e4567-e89b-42d3-a456-426614174000',
      profileId: 'owner:123e4567-e89b-42d3-a456-426614174000',
      profile: signedInProfile,
      revision: 1
    },
    local: { status: 'empty' }
  })

  harness.authority.start()
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.WAITING_CLOUD
  )
  await Promise.resolve()

  assert.equal(harness.authority.readActiveProfile(), signedInProfile)
  assert.ok(
    harness.calls.findIndex(([name]) => name === 'install')
      < harness.calls.findIndex(([name]) => name === 'claim')
  )
  assert.equal(harness.authority.saveActiveProfile(signedInProfile), true)
  const cloudSave = harness.calls.find(([name]) => name === 'cloud-save')
  assert.equal(cloudSave[2].isCurrent(), true)

  harness.authentication.publish({ status: 'signed-out', userId: null })

  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(harness.authority.saveActiveProfile(signedInProfile), false)
  assert.equal(await harness.authority.exportActiveProfile(), false)
  assert.equal(cloudSave[2].isCurrent(), false)
  assert.equal(
    harness.calls.filter(([name]) => name === 'local-save').length,
    1
  )
  assert.equal(harness.getLocal().profile, signedInProfile)
  assert.equal(
    harness.getLocal().ownerId,
    '123e4567-e89b-42d3-a456-426614174000'
  )
  assert.equal(harness.getOwnerVerification(), null)
})

test('cloud revision identity is installed and activated before signed-in saves can synchronize', async () => {
  const signedInProfile = {
    learnerProfile: { languages: ['mandarin'] },
    videos: {}
  }
  const harness = createHarness({
    authentication: {
      status: 'signed-in',
      userId: '123e4567-e89b-42d3-a456-426614174000'
    },
    cloudResolution: {
      generation: 2,
      ownerId: '123e4567-e89b-42d3-a456-426614174000',
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      profile: signedInProfile,
      revision: 7,
      status: 'activate'
    },
    local: { status: 'empty' }
  })

  harness.authority.start()
  await Promise.resolve()

  const install = harness.calls.find(([name]) => name === 'install')
  assert.equal(install[2].generation, 2)
  assert.equal(install[2].revision, 7)
  const claim = harness.calls.find(([name]) => name === 'claim')
  assert.equal(claim[1].generation, 2)
  assert.equal(claim[1].revision, 7)
  const cloudActivation = harness.calls.find(
    ([name]) => name === 'cloud-activate'
  )
  assert.equal(cloudActivation[1].activation, claim[1])
  assert.equal(cloudActivation[1].generation, 2)
  assert.equal(cloudActivation[1].revision, 7)
  assert.equal(harness.authority.saveActiveProfile(signedInProfile), true)
  assert.ok(
    harness.calls.findIndex(([name]) => name === 'cloud-activate')
      < harness.calls.findIndex(([name]) => name === 'cloud-save')
  )
})

test('a signed-in local write is refused unless unsynchronized work is durably marked', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const profile = { learnerProfile: { languages: ['mandarin'] } }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: {
      generation: 1,
      ownerId,
      profile,
      profileId,
      revision: 1,
      status: 'activate'
    },
    local: { status: 'empty' },
    markDirtyResult: false
  })

  harness.authority.start()
  await Promise.resolve()

  assert.equal(harness.authority.saveActiveProfile(profile), false)
  assert.equal(
    harness.calls.filter(([name]) => name === 'cloud-mark-dirty').length,
    1
  )
  assert.equal(
    harness.calls.some(([name]) => name === 'local-save'),
    false
  )
  assert.equal(
    harness.calls.some(([name]) => name === 'cloud-save'),
    false
  )
})

test('backup retry resubmits the active local profile and keeps recovery export available', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const profile = { marker: 'local-not-backed-up' }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: {
      generation: 1,
      ownerId,
      profile,
      profileId,
      revision: 4,
      status: 'activate'
    },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId,
      revision: 4,
      status: 'ready'
    }
  })
  harness.authority.start()
  await Promise.resolve()

  assert.equal(harness.authority.retryCloudBackup(), true)
  assert.equal(await harness.authority.exportActiveProfile(), true)
  assert.equal(
    harness.calls.filter(([name]) => name === 'cloud-retry').length,
    1
  )
  const cloudSave = harness.calls.find(([name]) => name === 'cloud-save')
  assert.equal(cloudSave[1], profile)
  assert.equal(cloudSave[2].isCurrent(), true)
  assert.equal(
    harness.calls.filter(([name]) => name === 'local-save').length,
    0
  )
  assert.equal(
    harness.calls.filter(([name]) => name === 'download').length,
    1
  )
})

test('a newer cloud head is saved locally before a returning device activates it', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const localProfile = { marker: 'revision-6' }
  const cloudProfile = { marker: 'revision-7' }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: {
      generation: 2,
      ownerId,
      profile: cloudProfile,
      profileId,
      revision: 7,
      status: 'activate'
    },
    local: {
      generation: 2,
      ownerId,
      profile: localProfile,
      profileId,
      revision: 6,
      status: 'ready'
    }
  })

  harness.authority.start()
  await Promise.resolve()

  assert.equal(harness.authority.readActiveProfile(), cloudProfile)
  assert.ok(
    harness.calls.findIndex(([name]) => name === 'reconcile')
      < harness.calls.findIndex(([name]) => name === 'claim')
  )
  assert.equal(
    harness.calls.find(([name]) => name === 'reconcile')[2].revision,
    7
  )
})

test('an active signed-in profile stays writable when connectivity drops', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const profile = { marker: 'active-offline' }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: {
      generation: 1,
      ownerId,
      profile,
      profileId,
      revision: 4,
      status: 'activate'
    },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId,
      revision: 4,
      status: 'ready'
    }
  })
  harness.authority.start()
  await Promise.resolve()
  const resolveCount = harness.calls.filter(
    ([name]) => name === 'cloud-resolve'
  ).length

  harness.connectivity.publish({ status: 'offline' })

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.ACTIVE
  )
  assert.equal(harness.authority.readActiveProfile(), profile)
  assert.equal(harness.authority.saveActiveProfile(profile), true)
  assert.equal(
    harness.calls.filter(([name]) => name === 'cloud-resolve').length,
    resolveCount
  )
})

test('an online-verified profile expires 30 days after connectivity drops', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const profile = { marker: 'online-then-offline' }
  const verifiedAt = 1_786_982_400_000
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: {
      generation: 1,
      ownerId,
      profile,
      profileId,
      revision: 4,
      status: 'activate'
    },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId,
      revision: 4,
      status: 'ready'
    },
    now: verifiedAt
  })
  harness.authority.start()
  await Promise.resolve()

  harness.connectivity.publish({ status: 'offline' })
  harness.setNow(verifiedAt + (30 * 24 * 60 * 60 * 1000) + 1)

  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.LOCKED
  )
})

test('replacing an offline profile preserves its verification deadline', () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const verifiedAt = 1_786_982_400_000
  const profile = { marker: 'before-offline-import' }
  const replacement = { marker: 'after-offline-import' }
  const harness = createHarness({
    authentication: {
      failure: 'network',
      status: 'unavailable',
      userId: null
    },
    connectivity: { status: 'offline' },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      revision: 4,
      status: 'ready'
    },
    now: verifiedAt + 1_000,
    ownerVerification: { ownerId, verifiedAt }
  })
  harness.authority.start()

  assert.deepEqual(
    harness.authority.replaceActiveProfile(replacement),
    { persisted: true, error: null }
  )
  assert.equal(harness.authority.readActiveProfile(), replacement)
  harness.setNow(verifiedAt + (30 * 24 * 60 * 60 * 1000) + 1)

  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.LOCKED
  )
})

test('another tab renewing verification does not start an online resolution loop', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const profile = { marker: 'online-renewal' }
  const now = 1_786_982_400_000
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: {
      generation: 1,
      ownerId,
      profile,
      profileId,
      revision: 4,
      status: 'activate'
    },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId,
      revision: 4,
      status: 'ready'
    },
    now
  })
  harness.authority.start()
  await Promise.resolve()
  const resolveCount = harness.calls.filter(
    ([name]) => name === 'cloud-resolve'
  ).length

  harness.setNow(now + 1)
  harness.setOwnerVerification({ ownerId, verifiedAt: now + 1 })
  harness.publishOwnerVerification()

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.ACTIVE
  )
  assert.equal(harness.authority.readActiveProfile(), profile)
  assert.equal(
    harness.calls.filter(([name]) => name === 'cloud-resolve').length,
    resolveCount
  )
})

test('a verified owner can reopen the matching local profile at the exact offline boundary', () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profile = { marker: 'verified-offline' }
  const now = 1_786_982_400_000
  const harness = createHarness({
    authentication: {
      failure: 'network',
      status: 'unavailable',
      userId: null
    },
    connectivity: { status: 'offline' },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      revision: 4,
      status: 'ready'
    },
    now,
    ownerVerification: {
      ownerId,
      verifiedAt: now - (30 * 24 * 60 * 60 * 1000)
    }
  })

  harness.authority.start()

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.ACTIVE
  )
  assert.equal(harness.authority.readActiveProfile(), profile)
  assert.equal(harness.authority.saveActiveProfile(profile), true)
  assert.equal(
    harness.calls.some(([name]) => name === 'cloud-resolve'),
    false
  )
  assert.deepEqual(harness.getOwnerVerification(), {
    ownerId,
    verifiedAt: now - (30 * 24 * 60 * 60 * 1000)
  })
})

test('offline reopening locks one millisecond after owner verification expires', () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profile = { marker: 'expired-offline' }
  const now = 1_786_982_400_000
  const harness = createHarness({
    authentication: {
      failure: 'network',
      status: 'unavailable',
      userId: null
    },
    connectivity: { status: 'offline' },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      revision: 4,
      status: 'ready'
    },
    now,
    ownerVerification: {
      ownerId,
      verifiedAt: now - (30 * 24 * 60 * 60 * 1000) - 1
    }
  })

  harness.authority.start()

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.LOCKED
  )
  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(harness.authority.saveActiveProfile(profile), false)
})

test('a cached owner session opens its verified local profile without connectivity', () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profile = { marker: 'cached-session-offline' }
  const now = 1_786_982_400_000
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    connectivity: { status: 'offline' },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      revision: 4,
      status: 'ready'
    },
    now,
    ownerVerification: {
      ownerId,
      verifiedAt: now - 10_000
    }
  })

  harness.authority.start()

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.ACTIVE
  )
  assert.equal(harness.authority.readActiveProfile(), profile)
  assert.equal(
    harness.calls.some(([name]) => name === 'cloud-resolve'),
    false
  )
})

test('temporary cloud unavailability falls back to the verified matching local profile', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profile = { marker: 'cloud-unavailable' }
  const now = 1_786_982_400_000
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: { status: 'waiting-cloud' },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      revision: 4,
      status: 'ready'
    },
    now,
    ownerVerification: {
      ownerId,
      verifiedAt: now - 10_000
    }
  })

  harness.authority.start()
  await Promise.resolve()

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.ACTIVE
  )
  assert.equal(harness.authority.readActiveProfile(), profile)
  assert.deepEqual(harness.getOwnerVerification(), {
    ownerId,
    verifiedAt: now - 10_000
  })
})

test('temporary cloud unavailability keeps a matching owned local profile active without a verification receipt', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const cloudProfileId = '223e4567-e89b-42d3-a456-426614174001'
  const profile = { marker: 'owned-local-with-unknown-cloud-head' }
  let resolutionCount = 0
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: () => {
      resolutionCount += 1
      return resolutionCount === 1
        ? { status: 'waiting-cloud' }
        : {
            backupRequired: true,
            generation: 1,
            ownerId,
            profile,
            profileId: cloudProfileId,
            revision: 4,
            status: 'activate'
          }
    },
    cloudSyncState: { status: 'not-yet-backed-up' },
    local: {
      ownerId,
      profile,
      profileId: `owner:${ownerId}`,
      status: 'ready'
    }
  })

  harness.authority.start()
  await Promise.resolve()

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.ACTIVE
  )
  assert.equal(harness.authority.readActiveProfile(), profile)
  assert.equal(harness.getOwnerVerification(), null)
  const cloudActivation = harness.calls.find(
    ([name]) => name === 'cloud-activate'
  )
  assert.equal(cloudActivation[1].profile, profile)

  assert.equal(harness.authority.retryCloudBackup(), true)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(
    harness.calls.filter(([name]) => name === 'cloud-resolve').length,
    2
  )
  assert.equal(harness.authority.readActiveProfile(), profile)
  assert.equal(harness.getLocal().profile, profile)
  assert.equal(harness.getLocal().profileId, cloudProfileId)
  assert.equal(
    harness.calls.filter(([name]) => name === 'adopt-cloud-identity').length,
    1
  )
  const cloudSave = harness.calls.find(([name]) => name === 'cloud-save')
  assert.equal(cloudSave[1], profile)
  assert.equal(cloudSave[2].isCurrent(), true)
  assert.equal(
    harness.calls.filter(([name]) => name === 'cloud-save').length,
    1
  )
})

test('a provisional owned profile remains locally writable while its cloud head is unknown', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profile = { marker: 'provisional-local-write' }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: { status: 'waiting-cloud' },
    cloudSyncState: { status: 'not-yet-backed-up' },
    local: {
      ownerId,
      profile,
      profileId: `owner:${ownerId}`,
      status: 'ready'
    },
    markDirtyResult: false
  })

  harness.authority.start()
  await Promise.resolve()

  assert.equal(harness.authority.saveActiveProfile(profile), true)
  assert.equal(
    harness.calls.filter(([name]) => name === 'cloud-mark-dirty').length,
    0
  )
  assert.equal(
    harness.calls.filter(([name]) => name === 'local-save').length,
    1
  )
})

test('adopting a cloud identity changes only provisional access metadata', () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const cloudProfileId = '223e4567-e89b-42d3-a456-426614174001'
  const accessStorageKey = 'edenia_profile_access_v1'
  const profile = { marker: 'must-not-be-replaced' }
  const values = new Map([[
    accessStorageKey,
    JSON.stringify({
      activatedAt: 100,
      activationId: null,
      ownerId,
      profileId: `owner:${ownerId}`,
      version: 1
    })
  ]])
  let replaceCalls = 0
  const adapter = createLearnerProfileLocalPersistenceAdapter({
    accessStorageKey,
    accountlessProfileId: 'accountless:browser',
    eventTarget: null,
    loadProfile: () => profile,
    replaceProfile: () => {
      replaceCalls += 1
      return { persisted: true, error: null }
    },
    saveProfile: () => true,
    storage: {
      getItem: key => values.get(key) ?? null,
      removeItem: key => values.delete(key),
      setItem: (key, value) => values.set(key, String(value))
    }
  })

  assert.equal(adapter.adoptCloudIdentity({
    generation: 2,
    ownerId,
    previousProfileId: `owner:${ownerId}`,
    profileId: cloudProfileId,
    revision: 7
  }), true)
  assert.deepEqual(adapter.read(), {
    generation: 2,
    ownerId,
    profile,
    profileId: cloudProfileId,
    revision: 7,
    status: 'ready'
  })
  assert.equal(replaceCalls, 0)

  assert.equal(adapter.adoptCloudIdentity({
    generation: 2,
    ownerId,
    previousProfileId: cloudProfileId,
    profileId: cloudProfileId,
    revision: 8
  }), true)
  assert.equal(adapter.read().revision, 8)
  assert.equal(adapter.read().profile, profile)
  assert.equal(replaceCalls, 0)
})

test('an open offline profile locks when its verification window expires', () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profile = { marker: 'expires-while-open' }
  const verifiedAt = 1_786_982_400_000
  const harness = createHarness({
    authentication: {
      failure: 'network',
      status: 'unavailable',
      userId: null
    },
    connectivity: { status: 'offline' },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      revision: 4,
      status: 'ready'
    },
    now: verifiedAt + (30 * 24 * 60 * 60 * 1000),
    ownerVerification: { ownerId, verifiedAt }
  })
  harness.authority.start()
  assert.equal(harness.authority.readActiveProfile(), profile)

  harness.setNow(verifiedAt + (30 * 24 * 60 * 60 * 1000) + 1)

  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(harness.authority.saveActiveProfile(profile), false)
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.LOCKED
  )
})

test('the offline expiry timer hides an idle learner profile after the boundary', () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profile = { marker: 'idle-at-expiry' }
  const verifiedAt = 1_786_982_400_000
  const expiresAt = verifiedAt + (30 * 24 * 60 * 60 * 1000)
  const harness = createHarness({
    authentication: {
      failure: 'network',
      status: 'unavailable',
      userId: null
    },
    connectivity: { status: 'offline' },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      revision: 4,
      status: 'ready'
    },
    now: expiresAt - 1_000,
    ownerVerification: { ownerId, verifiedAt }
  })
  harness.authority.start()

  assert.equal(harness.scheduledTimerDelay(), 1_001)
  harness.setNow(expiresAt + 1)
  harness.runScheduledTimer()

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.LOCKED
  )
  assert.equal(harness.authority.readActiveProfile(), null)
})

test('verification revocation from another tab immediately locks offline study', () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profile = { marker: 'revoked-in-another-tab' }
  const now = 1_786_982_400_000
  const harness = createHarness({
    authentication: {
      failure: 'network',
      status: 'unavailable',
      userId: null
    },
    connectivity: { status: 'offline' },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      revision: 4,
      status: 'ready'
    },
    now,
    ownerVerification: { ownerId, verifiedAt: now - 10_000 }
  })
  harness.authority.start()
  assert.equal(harness.authority.readActiveProfile(), profile)

  harness.revokeOwnerVerification()

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.LOCKED
  )
  assert.equal(harness.authority.readActiveProfile(), null)
})

test('definitive ownership failure removes the offline grace path', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profile = { marker: 'ownership-rejected' }
  const now = 1_786_982_400_000
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: { status: 'recovering' },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      revision: 4,
      status: 'ready'
    },
    now,
    ownerVerification: { ownerId, verifiedAt: now - 10_000 }
  })

  harness.authority.start()
  await Promise.resolve()

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.RECOVERING
  )
  assert.equal(harness.getOwnerVerification(), null)

  harness.authentication.publish({
    failure: 'network',
    status: 'unavailable',
    userId: null
  })
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.LOCKED
  )
})

test('invalid authentication revokes verification before a later outage', () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profile = { marker: 'invalid-authentication' }
  const now = 1_786_982_400_000
  const harness = createHarness({
    authentication: {
      failure: 'network',
      status: 'unavailable',
      userId: null
    },
    connectivity: { status: 'offline' },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      revision: 4,
      status: 'ready'
    },
    now,
    ownerVerification: { ownerId, verifiedAt: now - 10_000 }
  })
  harness.authority.start()
  assert.equal(harness.authority.readActiveProfile(), profile)

  harness.authentication.publish({
    failure: 'invalid',
    status: 'unavailable',
    userId: null
  })
  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(harness.getOwnerVerification(), null)

  harness.authentication.publish({
    failure: 'network',
    status: 'unavailable',
    userId: null
  })
  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.LOCKED
  )
})

test('a conditional-write conflict locks the active candidate without replacing either profile', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const localProfile = { learnerProfile: { languages: ['french'] } }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: {
      generation: 1,
      ownerId,
      profile: localProfile,
      profileId,
      revision: 1,
      status: 'activate'
    },
    local: {
      generation: 1,
      ownerId,
      profile: localProfile,
      profileId,
      revision: 1,
      status: 'ready'
    }
  })

  harness.authority.start()
  await Promise.resolve()
  const activation = harness.authority.getState().activation
  assert.equal(harness.authority.readActiveProfile(), localProfile)

  const conflict = {
    activation,
    cloud: {
      generation: 1,
      profile: { learnerProfile: { languages: ['mandarin'] } },
      revision: 2
    },
    device: {
      generation: 1,
      profile: localProfile,
      revision: 2
    },
    id: '323e4567-e89b-42d3-a456-426614174002',
    ownerId,
    profileId,
    status: 'open'
  }

  harness.publishCloud({
    conflict,
    status: 'conflicting'
  })

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.CONFLICTING
  )
  assert.equal(harness.authority.getState().conflict, conflict)
  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(harness.authority.saveActiveProfile(localProfile), false)
  assert.equal(harness.authority.exportConflictVersion('device'), true)
  assert.equal(harness.authority.exportConflictVersion('cloud'), true)
  assert.equal(harness.authority.exportConflictVersion('newest'), false)
  assert.equal(
    harness.calls.filter(([name]) => name === 'local-save').length,
    0
  )
  assert.deepEqual(
    harness.calls
      .filter(([name]) => name === 'download')
      .map(([, profile]) => profile),
    [conflict.device.profile, conflict.cloud.profile]
  )
  assert.equal(harness.getOwnerVerification(), null)
})

test('only a confirmed protected conflict choice can reactivate a profile', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const deviceProfile = { learnerProfile: { languages: ['french'] } }
  const cloudProfile = { learnerProfile: { languages: ['mandarin'] } }
  const protectedConflict = {
    cloud: { generation: 1, profile: cloudProfile, revision: 2 },
    device: { generation: 1, profile: deviceProfile, revision: 2 },
    id: '323e4567-e89b-42d3-a456-426614174002',
    operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ownerId,
    profileId,
    protectedUntil: 1_789_574_400_000,
    selectedSide: 'device',
    status: 'resolved'
  }
  const earlierProtectedConflict = {
    cloud: { profile: cloudProfile },
    device: { profile: { learnerProfile: { languages: ['spanish'] } } },
    id: '423e4567-e89b-42d3-a456-426614174003',
    ownerId,
    profileId,
    protectedUntil: 1_789_488_000_000,
    selectedSide: 'cloud',
    status: 'resolved'
  }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudChoice: {
      conflict: protectedConflict,
      generation: 1,
      ownerId,
      profile: deviceProfile,
      profileId,
      protectedConflicts: [earlierProtectedConflict, protectedConflict],
      protectedUntil: protectedConflict.protectedUntil,
      revision: 3,
      selectedSide: 'device',
      status: 'chosen'
    },
    cloudResolution: {
      generation: 1,
      ownerId,
      profile: deviceProfile,
      profileId,
      revision: 1,
      status: 'activate'
    },
    local: {
      generation: 1,
      ownerId,
      profile: deviceProfile,
      profileId,
      revision: 1,
      status: 'ready'
    }
  })
  harness.authority.start()
  await Promise.resolve()
  const conflict = {
    activation: harness.authority.getState().activation,
    cloud: { generation: 1, profile: cloudProfile, revision: 2 },
    device: { generation: 1, profile: deviceProfile, revision: 2 },
    id: protectedConflict.id,
    operationId: protectedConflict.operationId,
    ownerId,
    profileId,
    status: 'open'
  }
  harness.publishCloud({ conflict, status: 'conflicting' })

  assert.equal(await harness.authority.chooseConflictVersion('device'), false)
  assert.equal(
    harness.calls.filter(([name]) => name === 'cloud-choose-conflict').length,
    0
  )
  assert.equal(
    await harness.authority.chooseConflictVersion(
      'device',
      { confirmed: true }
    ),
    true
  )

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.ACTIVE
  )
  assert.equal(harness.authority.readActiveProfile(), deviceProfile)
  assert.equal(harness.getLocal().revision, 3)
  assert.deepEqual(harness.authority.getState().protectedConflicts, [
    earlierProtectedConflict,
    protectedConflict
  ])
  assert.equal(harness.authority.exportConflictVersion(
    'device',
    earlierProtectedConflict.id
  ), true)
  assert.equal(harness.authority.exportConflictVersion(
    'cloud',
    protectedConflict.id
  ), true)
  assert.equal(
    harness.calls.filter(([name]) => name === 'cloud-choose-conflict').length,
    1
  )
})

test('a recovered server-confirmed choice stays protected after activation', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const profile = { learnerProfile: { languages: ['french'] } }
  const protectedConflict = {
    cloud: { profile: { learnerProfile: { languages: ['mandarin'] } } },
    device: { profile },
    id: '323e4567-e89b-42d3-a456-426614174002',
    ownerId,
    profileId,
    protectedUntil: 1_789_574_400_000,
    selectedSide: 'device',
    status: 'resolved'
  }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: {
      generation: 1,
      ownerId,
      profile,
      profileId,
      protectedConflicts: [protectedConflict],
      revision: 3,
      status: 'activate'
    },
    local: {
      generation: 1,
      ownerId,
      profile,
      profileId,
      revision: 1,
      status: 'ready'
    }
  })

  harness.authority.start()
  await Promise.resolve()

  assert.equal(
    harness.authority.getState().protectedConflicts[0],
    protectedConflict
  )
  assert.equal(harness.authority.exportConflictVersion('cloud'), true)
})

test('a cloud head change returns the learner to the refreshed conflict', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const deviceProfile = { marker: 'this-device' }
  const refreshedConflict = {
    cloud: { profile: { marker: 'current-cloud' }, revision: 3 },
    device: { profile: deviceProfile, revision: 2 },
    id: '323e4567-e89b-42d3-a456-426614174002',
    operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ownerId,
    profileId,
    status: 'open'
  }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudChoice: {
      conflict: refreshedConflict,
      status: 'conflict-changed'
    },
    cloudResolution: {
      generation: 1,
      ownerId,
      profile: deviceProfile,
      profileId,
      revision: 1,
      status: 'activate'
    },
    local: {
      generation: 1,
      ownerId,
      profile: deviceProfile,
      profileId,
      revision: 1,
      status: 'ready'
    }
  })
  harness.authority.start()
  await Promise.resolve()
  refreshedConflict.activation = harness.authority.getState().activation
  harness.publishCloud({
    conflict: {
      ...refreshedConflict,
      cloud: { profile: { marker: 'old-cloud' }, revision: 2 }
    },
    status: 'conflicting'
  })

  assert.equal(
    await harness.authority.chooseConflictVersion(
      'device',
      { confirmed: true }
    ),
    false
  )
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.CONFLICTING
  )
  assert.equal(harness.authority.getState().conflict, refreshedConflict)
})

test('a verified profile stays active when later draft cleanup fails', async () => {
  let finalizationCalls = 0
  const harness = createHarness({
    authentication: {
      status: 'signed-in',
      userId: '123e4567-e89b-42d3-a456-426614174000'
    },
    cloudResolution: {
      finalize: () => {
        finalizationCalls += 1
        return false
      },
      generation: 1,
      ownerId: '123e4567-e89b-42d3-a456-426614174000',
      profile: { learnerProfile: { languages: ['mandarin'] } },
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      revision: 1,
      status: 'activate'
    },
    local: { status: 'empty' }
  })

  harness.authority.start()
  await Promise.resolve()

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.ACTIVE
  )
  assert.deepEqual(harness.authority.readActiveProfile(), {
    learnerProfile: { languages: ['mandarin'] }
  })
  assert.equal(finalizationCalls, 1)
  assert.equal(harness.calls.some(([name]) => name === 'claim'), true)
  assert.equal(harness.calls.some(([name]) => name === 'release'), false)
})

test('draft finalization waits until the local activation fence is claimed', async () => {
  let finalizationCalls = 0
  const harness = createHarness({
    authentication: {
      status: 'signed-in',
      userId: '123e4567-e89b-42d3-a456-426614174000'
    },
    claimActivationResult: false,
    cloudResolution: {
      created: true,
      finalize: () => {
        finalizationCalls += 1
        return true
      },
      generation: 1,
      ownerId: '123e4567-e89b-42d3-a456-426614174000',
      profile: { learnerProfile: { languages: ['mandarin'] } },
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      revision: 1,
      status: 'activate'
    },
    local: { status: 'empty' }
  })

  harness.authority.start()
  await Promise.resolve()

  assert.equal(finalizationCalls, 0)
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.RECOVERING
  )
  assert.equal(harness.authority.readActiveProfile(), null)
})

test('failed local onboarding finalization preserves the draft and hides activation', async () => {
  let finalizationCalls = 0
  const harness = createHarness({
    authentication: {
      status: 'signed-in',
      userId: '123e4567-e89b-42d3-a456-426614174000'
    },
    cloudResolution: {
      finalize: () => {
        finalizationCalls += 1
        return true
      },
      generation: 1,
      ownerId: '123e4567-e89b-42d3-a456-426614174000',
      profile: { learnerProfile: { languages: ['mandarin'] } },
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      revision: 1,
      status: 'activate'
    },
    completeOnboardingFinalizationResult: false,
    local: {
      onboardingFinalizationPending: true,
      ownerId: '123e4567-e89b-42d3-a456-426614174000',
      profile: { learnerProfile: { languages: ['mandarin'] } },
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      status: 'ready'
    }
  })

  harness.authority.start()
  await Promise.resolve()

  assert.equal(finalizationCalls, 0)
  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.RECOVERING
  )
})

test('a fence lost after activation completion preserves the onboarding draft', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  let draftPresent = true
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: 'deferred',
    local: {
      ownerId,
      profile: { learnerProfile: { languages: ['french'] } },
      profileId,
      status: 'ready'
    }
  })

  harness.authority.start()
  harness.cloudDeferred.resolve({
    finalize({ isCurrent }) {
      harness.setCurrentFence({ id: 'activation-from-newer-tab' })
      if (!isCurrent()) return false
      draftPresent = false
      return true
    },
    generation: 1,
    ownerId,
    profile: { learnerProfile: { languages: ['mandarin'] } },
    profileId,
    revision: 1,
    status: 'activate'
  })
  await Promise.resolve()

  assert.equal(draftPresent, true)
  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.RECOVERING
  )
})

test('draft deletion follows activation even when a newer fence then wins', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  let activationWasActiveBeforeDeletion = false
  let draftPresent = true
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: 'deferred',
    local: {
      ownerId,
      profile: { learnerProfile: { languages: ['french'] } },
      profileId,
      status: 'ready'
    }
  })

  harness.authority.start()
  harness.cloudDeferred.resolve({
    finalize({ isCurrent }) {
      activationWasActiveBeforeDeletion =
        harness.authority.getState().status
          === LEARNER_PROFILE_ACCESS_STATES.ACTIVE
        && harness.authority.readActiveProfile() !== null
      if (!isCurrent()) return false
      draftPresent = false
      harness.setCurrentFence({ id: 'activation-from-newer-tab' })
      return true
    },
    generation: 1,
    ownerId,
    profile: { learnerProfile: { languages: ['mandarin'] } },
    profileId,
    revision: 1,
    status: 'activate'
  })
  await Promise.resolve()

  assert.equal(activationWasActiveBeforeDeletion, true)
  assert.equal(draftPresent, false)
  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.RECOVERING
  )
})

test('a newer tab fence makes the earlier activation inert', async () => {
  const harness = createHarness()
  harness.authority.start()
  const staleProfile = harness.authority.readActiveProfile()

  harness.setCurrentFence({ id: 'activation-from-newer-tab' })

  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.RECOVERING
  )
  assert.equal(harness.authority.saveActiveProfile(staleProfile), false)
  assert.equal(await harness.authority.exportActiveProfile(), false)
  assert.equal(
    harness.calls.some(([name]) => name === 'local-save'),
    false
  )
})

test('profile replacement starts a new activation and rejects the previous profile object', () => {
  const harness = createHarness()
  harness.authority.start()
  const previousProfile = harness.authority.readActiveProfile()
  const previousActivationId = harness.authority.getState().activation.id
  const importedProfile = {
    learnerProfile: { languages: ['japanese'] },
    videos: {}
  }

  assert.deepEqual(
    harness.authority.replaceActiveProfile(importedProfile, {
      preserveBackupId: 'backup-before-import'
    }),
    { persisted: true, error: null }
  )

  assert.equal(harness.authority.readActiveProfile(), importedProfile)
  assert.notEqual(
    harness.authority.getState().activation.id,
    previousActivationId
  )
  assert.equal(harness.authority.saveActiveProfile(previousProfile), false)
  assert.equal(harness.authority.saveActiveProfile(importedProfile), true)
  assert.equal(
    harness.calls.filter(([name]) => name === 'replace').length,
    1
  )
})

test('signed-in profile replacement carries its cloud revision into the new activation', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const previousProfile = { marker: 'before-import' }
  const importedProfile = { marker: 'after-import' }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: {
      generation: 3,
      ownerId,
      profile: previousProfile,
      profileId,
      revision: 9,
      status: 'activate'
    },
    local: {
      generation: 3,
      ownerId,
      profile: previousProfile,
      profileId,
      revision: 9,
      status: 'ready'
    }
  })
  harness.authority.start()
  await Promise.resolve()

  assert.deepEqual(
    harness.authority.replaceActiveProfile(importedProfile),
    { persisted: true, error: null }
  )
  const activation = harness.authority.getState().activation
  assert.equal(activation.generation, 3)
  assert.equal(activation.revision, 9)
  assert.equal(harness.authority.saveActiveProfile(importedProfile), true)
  const cloudActivations = harness.calls.filter(
    ([name]) => name === 'cloud-activate'
  )
  assert.equal(cloudActivations.length, 2)
  assert.equal(cloudActivations.at(-1)[1].activation, activation)
  assert.ok(
    harness.calls.findLastIndex(([name]) => name === 'cloud-activate')
      < harness.calls.findLastIndex(([name]) => name === 'cloud-save')
  )
})

test('profile import requires confirmation from the active verified owner', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profile = { marker: 'before-import' }
  const importedProfile = { marker: 'after-import' }
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudResolution: {
      generation: 3,
      ownerId,
      profile,
      profileId,
      revision: 9,
      status: 'activate'
    },
    local: {
      generation: 3,
      ownerId,
      profile,
      profileId,
      revision: 9,
      status: 'ready'
    }
  })
  harness.authority.start()
  await Promise.resolve()

  assert.deepEqual(
    await harness.authority.importActiveProfile(importedProfile),
    { status: 'confirmation-required' }
  )
  assert.equal(harness.authority.readActiveProfile(), profile)
  assert.equal(
    harness.calls.some(([name]) => name === 'cloud-import'),
    false
  )

  harness.authentication.publish({
    status: 'signed-in',
    userId: '323e4567-e89b-42d3-a456-426614174002'
  })
  assert.deepEqual(
    await harness.authority.importActiveProfile(importedProfile, {
      confirmed: true
    }),
    { status: 'owner-required' }
  )
  assert.equal(harness.authority.readActiveProfile(), null)
})

test('profile import protects cloud progress before activating imported content', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const previousProfile = { marker: 'before-import' }
  const importedProfile = { marker: 'cross-account-portable-profile' }
  const cloudImport = {
    baseRevision: 10,
    generation: 3,
    operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ownerId,
    profileId,
    protectedUntil: 1_800_000_000_000,
    revision: 11,
    status: 'protected'
  }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudImport,
    cloudResolution: {
      generation: 3,
      ownerId,
      profile: previousProfile,
      profileId,
      revision: 9,
      status: 'activate'
    },
    local: {
      generation: 3,
      ownerId,
      profile: previousProfile,
      profileId,
      revision: 9,
      status: 'ready'
    }
  })
  harness.authority.start()
  await Promise.resolve()
  const activationBeforeImport = harness.authority.getState().activation

  assert.deepEqual(
    await harness.authority.importActiveProfile(importedProfile, {
      confirmed: true
    }),
    { status: 'imported' }
  )

  const activation = harness.authority.getState().activation
  assert.equal(harness.authority.readActiveProfile(), importedProfile)
  assert.equal(activation.ownerId, ownerId)
  assert.equal(activation.profileId, profileId)
  assert.equal(activation.generation, 3)
  assert.equal(activation.revision, 11)
  assert.notEqual(activation.id, activationBeforeImport.id)
  const importIndex = harness.calls.findIndex(([name]) => name === 'cloud-import')
  const reconcileIndex = harness.calls.findLastIndex(
    ([name]) => name === 'reconcile'
  )
  const confirmIndex = harness.calls.findLastIndex(
    ([name]) => name === 'cloud-confirm-import'
  )
  assert.ok(importIndex >= 0)
  assert.ok(importIndex < reconcileIndex)
  assert.ok(reconcileIndex < confirmIndex)
  assert.equal(
    harness.calls.some(([name]) => name === 'cloud-save'),
    false
  )
})

test('local import persistence failure rolls cloud back and reactivates current progress', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const previousProfile = { marker: 'before-import' }
  const importedProfile = { marker: 'must-not-activate' }
  const cloudImport = {
    baseRevision: 10,
    generation: 3,
    operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ownerId,
    profileId,
    protectedUntil: 1_800_000_000_000,
    revision: 11,
    status: 'protected'
  }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudImport,
    cloudResolution: {
      generation: 3,
      ownerId,
      profile: previousProfile,
      profileId,
      revision: 9,
      status: 'activate'
    },
    local: {
      generation: 3,
      ownerId,
      profile: previousProfile,
      profileId,
      revision: 9,
      status: 'ready'
    },
    reconcileSignedInProfileResult: profile => profile !== importedProfile
  })
  harness.authority.start()
  await Promise.resolve()

  assert.deepEqual(
    await harness.authority.importActiveProfile(importedProfile, {
      confirmed: true
    }),
    { status: 'rolled-back' }
  )
  assert.equal(harness.authority.readActiveProfile(), previousProfile)
  assert.equal(harness.authority.getState().activation.revision, 12)
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.ACTIVE
  )
  assert.equal(
    harness.calls.filter(([name]) => name === 'cloud-rollback-import').length,
    1
  )
  assert.equal(
    harness.calls.filter(
      ([name, profile, identity]) => name === 'reconcile'
        && profile === previousProfile
        && identity.revision === 12
    ).length,
    1
  )
})

test('sync receipt persistence failure rolls imported content back locally and in cloud', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const previousProfile = { marker: 'before-import' }
  const importedProfile = { marker: 'must-be-rolled-back' }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudImport: {
      baseRevision: 10,
      generation: 3,
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ownerId,
      profileId,
      protectedUntil: 1_800_000_000_000,
      revision: 11,
      status: 'protected'
    },
    cloudImportConfirmationResult: false,
    cloudResolution: {
      generation: 3,
      ownerId,
      profile: previousProfile,
      profileId,
      revision: 9,
      status: 'activate'
    },
    local: {
      generation: 3,
      ownerId,
      profile: previousProfile,
      profileId,
      revision: 9,
      status: 'ready'
    }
  })
  harness.authority.start()
  await Promise.resolve()
  const reconcileCount = harness.calls.filter(
    ([name]) => name === 'reconcile'
  ).length

  assert.deepEqual(
    await harness.authority.importActiveProfile(importedProfile, {
      confirmed: true
    }),
    { status: 'rolled-back' }
  )
  assert.equal(harness.authority.readActiveProfile(), previousProfile)
  assert.equal(harness.authority.getState().activation.revision, 12)
  assert.equal(
    harness.calls.filter(([name]) => name === 'cloud-rollback-import').length,
    1
  )
  assert.deepEqual(
    harness.calls.filter(([name]) => name === 'reconcile')
      .slice(reconcileCount)
      .map(([, profile, identity]) => [profile, identity.revision]),
    [[importedProfile, 11], [previousProfile, 12]]
  )
})

test('durable-marker cleanup failure still restores current progress', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const previousProfile = { marker: 'before-import' }
  const importedProfile = { marker: 'must-be-rolled-back' }
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudImport: {
      baseRevision: 10,
      generation: 3,
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ownerId,
      profileId,
      protectedUntil: 1_800_000_000_000,
      revision: 11,
      status: 'protected'
    },
    cloudImportConfirmationResult: false,
    cloudImportRollback: {
      cleanupPending: true,
      revision: 12,
      status: 'rolled-back'
    },
    cloudResolution: {
      generation: 3,
      ownerId,
      profile: previousProfile,
      profileId,
      revision: 9,
      status: 'activate'
    },
    local: {
      generation: 3,
      ownerId,
      profile: previousProfile,
      profileId,
      revision: 9,
      status: 'ready'
    }
  })
  harness.authority.start()
  await Promise.resolve()

  assert.deepEqual(
    await harness.authority.importActiveProfile(importedProfile, {
      confirmed: true
    }),
    { status: 'recovery-required' }
  )
  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(harness.getLocal().profile, previousProfile)
  assert.equal(harness.getLocal().revision, 12)
  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.RECOVERING
  )
})

test('stale cloud revision leaves the active profile unchanged', async () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const previousProfile = { marker: 'before-import' }
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const harness = createHarness({
    authentication: { status: 'signed-in', userId: ownerId },
    cloudImport: { status: 'stale-revision' },
    cloudResolution: {
      generation: 3,
      ownerId,
      profile: previousProfile,
      profileId,
      revision: 9,
      status: 'activate'
    },
    local: {
      generation: 3,
      ownerId,
      profile: previousProfile,
      profileId,
      revision: 9,
      status: 'ready'
    }
  })
  harness.authority.start()
  await Promise.resolve()
  const reconcileCount = harness.calls.filter(
    ([name]) => name === 'reconcile'
  ).length

  assert.deepEqual(
    await harness.authority.importActiveProfile(
      { marker: 'must-not-activate' },
      { confirmed: true }
    ),
    { status: 'stale-revision' }
  )
  assert.equal(harness.authority.readActiveProfile(), previousProfile)
  assert.equal(
    harness.calls.filter(([name]) => name === 'reconcile').length,
    reconcileCount
  )
})

test('browser persistence shares activation fences across tabs before writes', () => {
  const values = new Map()
  const saveCalls = []
  const profile = { learnerProfile: { languages: ['french'] } }
  const storage = {
    getItem(key) {
      return values.get(key) ?? null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, value)
    }
  }
  const createAdapter = () => createLearnerProfileLocalPersistenceAdapter({
    accessStorageKey: 'edenia_v1_profile_access_v1',
    accountlessProfileId: 'accountless:edenia_v1',
    eventTarget: null,
    loadProfile: () => profile,
    replaceProfile(nextProfile, options) {
      saveCalls.push(['replace', nextProfile, options])
      return { persisted: true, error: null }
    },
    saveProfile(nextProfile, options) {
      saveCalls.push(['save', nextProfile, options])
      return true
    },
    storage
  })
  const earlierTab = createAdapter()
  const laterTab = createAdapter()
  const earlierFence = {
    activatedAt: 100,
    id: 'earlier-tab',
    ownerId: null,
    profileId: 'accountless:edenia_v1'
  }
  const laterFence = { ...earlierFence, activatedAt: 200, id: 'later-tab' }

  assert.deepEqual(earlierTab.read(), {
    ownerId: null,
    profile,
    profileId: 'accountless:edenia_v1',
    status: 'ready'
  })
  assert.equal(earlierTab.claimActivation(earlierFence), true)
  assert.equal(laterTab.claimActivation(laterFence), true)
  assert.equal(earlierTab.isActivationCurrent(earlierFence), false)
  assert.equal(laterTab.isActivationCurrent(laterFence), true)
  assert.equal(earlierTab.save(profile, {}, earlierFence), false)
  assert.equal(laterTab.save(profile, {}, laterFence), true)
  assert.deepEqual(saveCalls, [[
    'save',
    profile,
    { syncAnalytics: false }
  ]])
})

test('a new signed-in profile installs behind a locked owner record before activation', () => {
  const accessStorageKey = 'edenia_v1_profile_access_v1'
  const values = new Map()
  let persistedProfile = null
  const storage = {
    getItem(key) {
      return values.get(key) ?? null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, value)
    }
  }
  const adapter = createLearnerProfileLocalPersistenceAdapter({
    accessStorageKey,
    accountlessProfileId: 'accountless:edenia_v1',
    eventTarget: null,
    hasProfile: () => Boolean(persistedProfile),
    loadProfile: () => persistedProfile,
    replaceProfile(profile, options, canPersist) {
      const access = JSON.parse(storage.getItem(accessStorageKey))
      assert.equal(access.activationId, null)
      assert.equal(access.generation, 1)
      assert.equal(access.ownerId, '123e4567-e89b-42d3-a456-426614174000')
      assert.equal(access.revision, 1)
      assert.equal(canPersist(), true)
      assert.equal(options.syncAnalytics, false)
      persistedProfile = profile
      return { persisted: true, error: null }
    },
    saveProfile: () => false,
    storage
  })
  const profile = { learnerProfile: { languages: ['mandarin'] } }

  assert.equal(adapter.installSignedInProfile(profile, {
    generation: 1,
    installedAt: 1_786_982_400_000,
    onboardingFinalizationPending: true,
    ownerId: '123e4567-e89b-42d3-a456-426614174000',
    profileId: '223e4567-e89b-42d3-a456-426614174001',
    revision: 1
  }), true)
  assert.deepEqual(adapter.read(), {
    generation: 1,
    onboardingFinalizationPending: true,
    ownerId: '123e4567-e89b-42d3-a456-426614174000',
    profile,
    profileId: '223e4567-e89b-42d3-a456-426614174001',
    revision: 1,
    status: 'ready'
  })
})

test('a stale save cannot persist after a newer tab claims activation during preparation', () => {
  const harness = createPersistenceInterleavingHarness()
  const staleProfile = {
    config: {},
    learnerProfile: { languages: ['spanish'] }
  }
  harness.interleaveNewerActivation()

  assert.equal(
    harness.earlierTab.save(
      staleProfile,
      { backup: false },
      harness.earlierFence
    ),
    false
  )
  assert.deepEqual(
    harness.stateStore.loadState({ persistCleanup: false }),
    harness.originalProfile
  )
  assert.equal(
    harness.laterTab.isActivationCurrent(harness.laterFence),
    true
  )
})

test('a stale replacement cannot persist after a newer tab claims activation during preparation', () => {
  const harness = createPersistenceInterleavingHarness()
  const staleProfile = {
    config: {},
    learnerProfile: { languages: ['japanese'] }
  }
  harness.interleaveNewerActivation()

  assert.deepEqual(
    harness.earlierTab.replace(
      staleProfile,
      { preserveBackupId: 'backup-before-import' },
      harness.earlierFence
    ),
    { persisted: false, error: null }
  )
  assert.deepEqual(
    harness.stateStore.loadState({ persistCleanup: false }),
    harness.originalProfile
  )
  assert.equal(
    harness.laterTab.isActivationCurrent(harness.laterFence),
    true
  )
})

test('access observations deterministically cover every non-active lifecycle state', () => {
  const ownerId = '123e4567-e89b-42d3-a456-426614174000'
  const otherOwnerId = '223e4567-e89b-42d3-a456-426614174001'
  const cases = [
    {
      expected: LEARNER_PROFILE_ACCESS_STATES.RESOLVING,
      options: { authentication: { status: 'loading', userId: null } }
    },
    {
      expected: LEARNER_PROFILE_ACCESS_STATES.LOCKED,
      options: {
        authentication: { status: 'signed-out', userId: null },
        local: {
          status: 'ready',
          profile: { learnerProfile: {} },
          profileId: `owner:${ownerId}`,
          ownerId
        }
      }
    },
    {
      expected: LEARNER_PROFILE_ACCESS_STATES.WAITING_AUTHENTICATION,
      options: {
        authentication: { status: 'signed-out', userId: null },
        local: { status: 'empty' }
      }
    },
    {
      expected: LEARNER_PROFILE_ACCESS_STATES.LOCKED,
      options: {
        authentication: { status: 'unavailable', userId: null },
        local: {
          status: 'ready',
          profile: { learnerProfile: {} },
          profileId: `owner:${ownerId}`,
          ownerId
        }
      }
    },
    {
      expected: LEARNER_PROFILE_ACCESS_STATES.ACCOUNT_CHANGE,
      options: {
        authentication: { status: 'signed-in', userId: otherOwnerId },
        local: {
          status: 'ready',
          profile: { learnerProfile: {} },
          profileId: `owner:${ownerId}`,
          ownerId
        }
      }
    },
    {
      expected: LEARNER_PROFILE_ACCESS_STATES.WAITING_CLOUD,
      options: {
        authentication: { status: 'signed-in', userId: ownerId },
        local: {
          status: 'ready',
          profile: { learnerProfile: {} },
          profileId: `owner:${ownerId}`,
          ownerId
        }
      }
    },
    {
      expected: LEARNER_PROFILE_ACCESS_STATES.MIGRATING,
      options: {
        authentication: { status: 'signed-in', userId: ownerId }
      }
    }
  ]

  for (const { expected, options } of cases) {
    const harness = createHarness(options)
    harness.authority.start()
    assert.equal(harness.authority.getState().status, expected)
    assert.equal(harness.authority.readActiveProfile(), null)
    harness.authority.destroy()
  }
})

test('authentication adapter exposes only lifecycle observations and deduplicates them', () => {
  const adapter = createLearnerProfileAuthenticationAdapter({
    initialStatus: 'loading'
  })
  const observations = []
  adapter.subscribe(observation => observations.push(observation))
  const accountState = {
    sessionState: 'signed-in',
    userId: '123e4567-e89b-42d3-a456-426614174000',
    email: 'private@example.com',
    accessToken: 'must-not-cross-the-seam'
  }

  adapter.observeAccountState(accountState)
  adapter.observeAccountState({ ...accountState, busyAction: 'refresh' })

  assert.deepEqual(adapter.getObservation(), {
    status: 'signed-in',
    userId: '123e4567-e89b-42d3-a456-426614174000'
  })
  assert.deepEqual(observations, [{
    status: 'signed-in',
    userId: '123e4567-e89b-42d3-a456-426614174000'
  }])
  assert.equal(JSON.stringify(observations).includes('private@example.com'), false)
  assert.equal(JSON.stringify(observations).includes('must-not-cross'), false)

  adapter.observeAccountState({ sessionState: 'signed-out', userId: accountState.userId })
  assert.deepEqual(adapter.getObservation(), {
    status: 'signed-out',
    userId: null
  })

  adapter.observeAccountState({ sessionState: 'unavailable' })
  assert.deepEqual(adapter.getObservation(), {
    failure: 'network',
    status: 'unavailable',
    userId: null
  })

  adapter.observeAccountState({ sessionState: 'signed-in', userId: '' })
  assert.deepEqual(adapter.getObservation(), {
    failure: 'invalid',
    status: 'unavailable',
    userId: null
  })
})
