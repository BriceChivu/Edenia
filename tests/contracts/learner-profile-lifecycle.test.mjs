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
  cloudResolution = { status: 'waiting' }
} = {}) {
  const authenticationAdapter = createObservationAdapter(authentication)
  const connectivityAdapter = createObservationAdapter(connectivity)
  const cloudDeferred = deferred()
  const calls = []
  let currentFence = null
  let currentLocal = local
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
      clock: { now: () => 1_786_982_400_000 },
      cloudPersistence: {
        resolve(context) {
          calls.push(['cloud-resolve', context])
          return cloudResolution === 'deferred'
            ? cloudDeferred.promise
            : cloudResolution
        },
        save(profile, context) {
          calls.push(['cloud-save', profile, context])
          return Promise.resolve({ status: 'saved' })
        }
      },
      connectivity: connectivityAdapter,
      exportDownload: {
        download(profile, context) {
          calls.push(['download', profile, context.activation.id, context])
          return true
        }
      },
      localPersistence: {
        installSignedInProfile(profile, identity) {
          calls.push(['install', profile, identity])
          currentLocal = {
            ownerId: identity.ownerId,
            profile,
            profileId: identity.profileId,
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
    setCurrentFence: fence => { currentFence = fence }
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
  assert.equal(harness.authority.exportActiveProfile(), true)
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
      status: 'activate',
      ownerId: '123e4567-e89b-42d3-a456-426614174000',
      profileId: 'owner:123e4567-e89b-42d3-a456-426614174000',
      profile: signedInProfile
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
  assert.equal(harness.authority.exportActiveProfile(), false)
  assert.equal(cloudSave[2].isCurrent(), false)
  assert.equal(
    harness.calls.filter(([name]) => name === 'local-save').length,
    1
  )
})

test('activation remains hidden when profile-finalization cannot clear temporary state', async () => {
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
      ownerId: '123e4567-e89b-42d3-a456-426614174000',
      profile: { learnerProfile: { languages: ['mandarin'] } },
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      status: 'activate'
    },
    local: { status: 'empty' }
  })

  harness.authority.start()
  await Promise.resolve()

  assert.equal(
    harness.authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.RECOVERING
  )
  assert.equal(harness.authority.readActiveProfile(), null)
  assert.equal(finalizationCalls, 1)
  assert.equal(harness.calls.some(([name]) => name === 'claim'), true)
  assert.equal(harness.calls.some(([name]) => name === 'release'), true)
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
      ownerId: '123e4567-e89b-42d3-a456-426614174000',
      profile: { learnerProfile: { languages: ['mandarin'] } },
      profileId: '223e4567-e89b-42d3-a456-426614174001',
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

test('a newer tab fence makes the earlier activation inert', () => {
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
  assert.equal(harness.authority.exportActiveProfile(), false)
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
      assert.equal(access.ownerId, '123e4567-e89b-42d3-a456-426614174000')
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
    installedAt: 1_786_982_400_000,
    onboardingFinalizationPending: true,
    ownerId: '123e4567-e89b-42d3-a456-426614174000',
    profileId: '223e4567-e89b-42d3-a456-426614174001'
  }), true)
  assert.deepEqual(adapter.read(), {
    onboardingFinalizationPending: true,
    ownerId: '123e4567-e89b-42d3-a456-426614174000',
    profile,
    profileId: '223e4567-e89b-42d3-a456-426614174001',
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
      expected: LEARNER_PROFILE_ACCESS_STATES.RECOVERING,
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
      expected: LEARNER_PROFILE_ACCESS_STATES.CONFLICTING,
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
})
