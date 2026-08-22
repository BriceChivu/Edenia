import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLearnerProfileLifecycleAuthority,
  LEARNER_PROFILE_ACCESS_STATES
} from '../../src/state/learner-profile-lifecycle.js'
import {
  createLearnerProfileLocalPersistenceAdapter
} from '../../src/state/learner-profile-local-adapter.js'

const OWNER_A = '123e4567-e89b-42d3-a456-426614174000'
const OWNER_B = '223e4567-e89b-42d3-a456-426614174001'
const PROFILE_A = '323e4567-e89b-42d3-a456-426614174002'
const PROFILE_B = '423e4567-e89b-42d3-a456-426614174003'

function createObservationAdapter(observation) {
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
  download: downloadBehavior = true,
  local: initialLocal = null,
  replacementProtection = 'synchronized'
} = {}) {
  const calls = []
  const authentication = createObservationAdapter({
    status: 'signed-in',
    userId: OWNER_B
  })
  let local = initialLocal || {
    generation: 1,
    ownerId: OWNER_A,
    profile: { learnerProfile: { languages: ['french'] } },
    profileId: PROFILE_A,
    revision: 4,
    status: 'ready'
  }
  const replacementProfile = {
    learnerProfile: { languages: ['mandarin'] }
  }
  const cloudListeners = new Set()
  let finishDownload
  const downloadPromise = downloadBehavior === 'deferred'
    ? new Promise(resolve => { finishDownload = resolve })
    : null
  const authority = createLearnerProfileLifecycleAuthority({
    adapters: {
      analytics: {
        accessChanged() {},
        profileActivated() {},
        profileSaved() {}
      },
      authentication,
      clock: { now: () => 1_787_068_800_000 },
      cloudPersistence: {
        activate() { return true },
        commitReplacement() {
          calls.push('cloud-commit-replacement')
          return true
        },
        getReplacementProtection(profile) {
          calls.push(['cloud-protection', profile.ownerId, profile.profileId])
          return replacementProtection
        },
        resolve(context) {
          calls.push(['cloud-resolve', context.purpose])
          return {
            generation: 2,
            ownerId: OWNER_B,
            profile: replacementProfile,
            profileId: PROFILE_B,
            revision: 7,
            status: 'activate'
          }
        },
        save() { return { status: 'queued' } },
        subscribe(listener) {
          cloudListeners.add(listener)
          return () => cloudListeners.delete(listener)
        }
      },
      connectivity: createObservationAdapter({ status: 'online' }),
      exportDownload: {
        download() {
          calls.push('download')
          return downloadPromise || downloadBehavior
        }
      },
      localPersistence: {
        beginOwnerReplacement(replacement) {
          calls.push(['local-begin-replacement', replacement.protection])
          return { ...replacement, id: 'replacement-1' }
        },
        claimActivation() { return true },
        async completeOwnerReplacement(profile, identity, transition) {
          calls.push(['local-complete-replacement', transition.id])
          local = {
            ...identity,
            profile,
            status: 'ready'
          }
          return true
        },
        isActivationCurrent() { return false },
        read: () => local,
        releaseActivation() {},
        replace() { return { persisted: true, error: null } },
        save() { return true },
        subscribe() { return () => {} }
      },
      ownerVerification: {
        clear() { return true },
        read() { return null },
        record(record) {
          calls.push(['owner-verification-record', record.ownerId])
          return true
        },
        subscribe() { return () => {} }
      }
    },
    createActivationId: () => 'activation-1',
    onStateChange(state) {
      calls.push(['state', state.status])
    }
  })

  return {
    authority,
    calls,
    finishDownload,
    getLocal: () => local,
    replacementProfile
  }
}

test('a synchronized previous owner can be replaced without exposing either identity', async () => {
  const { authority, calls, getLocal, replacementProfile } = createHarness()

  authority.start()

  assert.deepEqual(authority.getState(), {
    activation: null,
    ownerId: null,
    profileId: null,
    replacement: { protectionStatus: 'synchronized' },
    status: LEARNER_PROFILE_ACCESS_STATES.ACCOUNT_CHANGE
  })
  assert.equal(authority.readActiveProfile(), null)
  assert.equal(JSON.stringify(authority.getState()).includes(OWNER_A), false)
  assert.equal(JSON.stringify(authority.getState()).includes(OWNER_B), false)

  assert.equal(await authority.replaceOwnerProfile({
    protection: 'synchronized'
  }), true)

  assert.equal(
    authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.RELOADING
  )
  assert.deepEqual(getLocal(), {
    generation: 2,
    ownerId: OWNER_B,
    profile: replacementProfile,
    profileId: PROFILE_B,
    revision: 7,
    status: 'ready'
  })
  assert.deepEqual(
    calls.filter(call => Array.isArray(call)
      ? ['cloud-resolve', 'local-begin-replacement', 'local-complete-replacement']
          .includes(call[0])
      : call === 'cloud-commit-replacement'),
    [
      ['cloud-resolve', 'replace-owner-profile'],
      ['local-begin-replacement', 'synchronized'],
      'cloud-commit-replacement',
      ['local-complete-replacement', 'replacement-1']
    ]
  )
  assert.equal(calls.includes('download'), false)
})

test('pending progress blocks replacement until a portable export succeeds', async () => {
  const { authority, calls } = createHarness({
    replacementProtection: 'pending'
  })
  authority.start()

  assert.deepEqual(authority.getState().replacement, {
    protectionStatus: 'pending'
  })
  assert.equal(await authority.replaceOwnerProfile({
    protection: 'synchronized'
  }), false)
  assert.equal(
    authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.ACCOUNT_CHANGE
  )
  assert.equal(
    calls.some(call => Array.isArray(call) && call[0] === 'cloud-resolve'),
    false
  )

  assert.equal(await authority.replaceOwnerProfile({
    protection: 'exported'
  }), true)
  assert.equal(
    authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.RELOADING
  )
  assert.ok(calls.indexOf('download') < calls.findIndex(
    call => Array.isArray(call) && call[0] === 'cloud-resolve'
  ))
  assert.ok(calls.indexOf('download') < calls.findIndex(
    call => Array.isArray(call) && call[0] === 'local-begin-replacement'
  ))
})

test('replacement waits for portable export preparation to finish', async () => {
  const { authority, calls, finishDownload } = createHarness({
    download: 'deferred',
    replacementProtection: 'pending'
  })
  authority.start()

  const replacement = authority.replaceOwnerProfile({
    protection: 'exported'
  })
  await Promise.resolve()
  assert.equal(
    calls.some(call => Array.isArray(call) && call[0] === 'cloud-resolve'),
    false
  )
  assert.equal(
    authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.ACCOUNT_CHANGE
  )

  finishDownload(true)
  assert.equal(await replacement, true)
  assert.equal(
    authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.RELOADING
  )
})

test('discard replacement requires an explicit irreversible confirmation', async () => {
  const { authority, calls } = createHarness({
    replacementProtection: 'pending'
  })
  authority.start()

  assert.equal(await authority.replaceOwnerProfile({
    protection: 'discarded'
  }), false)
  assert.equal(
    authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.ACCOUNT_CHANGE
  )
  assert.equal(
    calls.some(call => Array.isArray(call) && call[0] === 'cloud-resolve'),
    false
  )

  assert.equal(await authority.replaceOwnerProfile({
    confirmed: true,
    protection: 'discarded'
  }), true)
  assert.equal(
    authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.RELOADING
  )
})

test('a durable owner transition survives reload and fences both browser copies', async () => {
  const accessStorageKey = 'edenia_v1_learner_profile_access_v1'
  const stateStorageKey = 'edenia_v1'
  const oldProfile = { learnerProfile: { languages: ['french'] } }
  const nextProfile = { learnerProfile: { languages: ['mandarin'] } }
  const values = new Map([
    [stateStorageKey, JSON.stringify(oldProfile)],
    [accessStorageKey, JSON.stringify({
      activatedAt: 100,
      activationId: null,
      generation: 1,
      ownerId: OWNER_A,
      profileId: PROFILE_A,
      revision: 4,
      version: 1
    })]
  ])
  const storage = {
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  }
  let cachesCleared = false
  const createAdapter = () => createLearnerProfileLocalPersistenceAdapter({
    accessStorageKey,
    accountlessProfileId: 'accountless:browser',
    async clearLearnerDerivedData() {
      cachesCleared = true
      return true
    },
    eventTarget: null,
    hasProfile: () => values.has(stateStorageKey),
    loadProfile: () => JSON.parse(values.get(stateStorageKey)),
    replaceProfile(profile, options, canPersist) {
      assert.equal(options.backup, false)
      if (!canPersist()) return { persisted: false, error: null }
      values.set(stateStorageKey, JSON.stringify(profile))
      return { persisted: canPersist(), error: null }
    },
    saveProfile() { return false },
    storage
  })
  const adapter = createAdapter()
  const transition = adapter.beginOwnerReplacement({
    id: 'replacement-reload-test',
    nextOwnerId: OWNER_B,
    previousOwnerId: OWNER_A,
    previousProfileId: PROFILE_A,
    protection: 'exported',
    startedAt: 200
  })

  assert.match(transition.id, /^replacement-/)
  assert.deepEqual(createAdapter().read(), {
    nextOwnerId: OWNER_B,
    previousOwnerId: OWNER_A,
    previousProfileId: PROFILE_A,
    protection: 'exported',
    startedAt: 200,
    status: 'replacing',
    transitionId: transition.id
  })
  assert.equal(createAdapter().claimActivation({
    activatedAt: 300,
    generation: 1,
    id: 'stale-tab',
    ownerId: OWNER_A,
    profileId: PROFILE_A,
    revision: 4
  }), false)

  assert.equal(await createAdapter().completeOwnerReplacement(
    nextProfile,
    {
      generation: 2,
      ownerId: OWNER_B,
      profileId: PROFILE_B,
      revision: 7
    },
    transition
  ), true)
  assert.equal(cachesCleared, true)
  assert.deepEqual(createAdapter().read(), {
    generation: 2,
    ownerId: OWNER_B,
    profile: nextProfile,
    profileId: PROFILE_B,
    revision: 7,
    status: 'ready'
  })
})

test('the matching new owner resumes a fenced replacement after reload', async () => {
  const { authority, calls, getLocal, replacementProfile } = createHarness({
    local: {
      nextOwnerId: OWNER_B,
      previousOwnerId: OWNER_A,
      previousProfileId: PROFILE_A,
      protection: 'exported',
      startedAt: 200,
      status: 'replacing',
      transitionId: 'replacement-reload-test'
    }
  })

  authority.start()
  assert.equal(
    authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.REPLACING
  )
  assert.equal(authority.readActiveProfile(), null)
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(
    authority.getState().status,
    LEARNER_PROFILE_ACCESS_STATES.RELOADING
  )
  assert.deepEqual(getLocal().profile, replacementProfile)
  assert.equal(
    calls.some(call => Array.isArray(call)
      && call[0] === 'local-begin-replacement'),
    false
  )
  assert.ok(calls.includes('cloud-commit-replacement'))
})
