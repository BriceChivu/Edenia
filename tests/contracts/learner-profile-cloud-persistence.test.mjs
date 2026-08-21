import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLearnerProfileCloudPersistenceAdapter
} from '../../src/integrations/learner-profile-cloud-persistence.js'
import {
  LEARNER_PROFILE_RESOLUTION_STATUSES
} from '../../src/domain/learner-profile-resolution.js'

const OWNER_ID = '123e4567-e89b-42d3-a456-426614174000'
const PROFILE_ID = '223e4567-e89b-42d3-a456-426614174001'
const SECOND_OWNER_ID = '323e4567-e89b-42d3-a456-426614174002'
const SECOND_PROFILE_ID = '423e4567-e89b-42d3-a456-426614174003'
const SYNC_STORAGE_KEY = 'edenia_profile_sync_v1'
const DIRTY_STORAGE_KEY = `${SYNC_STORAGE_KEY}_dirty`

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  }
}

function createEventTarget() {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(listener)
    },
    dispatch(type) {
      for (const listener of listeners.get(type) || []) listener()
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    }
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function preparedEnvelope(profile, payloadSha256 = 'A'.repeat(43)) {
  return {
    exportedAt: '2026-08-21T00:00:00.000Z',
    integrity: {
      algorithm: 'SHA-256',
      byteLength: 100,
      payloadSha256
    },
    profile: structuredClone(profile),
    schema: 'edenia-portable-learner-profile',
    version: 1
  }
}

function createAdapter({
  clearOnboardingDraft,
  createOperationId,
  eventTarget,
  finalizeEnvelope,
  isOnline,
  now,
  prepareEnvelope,
  rpc,
  setTimer,
  storage,
  verifyEnvelope
} = {}) {
  return createLearnerProfileCloudPersistenceAdapter({
    clearOnboardingDraft: clearOnboardingDraft || (() => true),
    createOnboardingEnvelope: async () => null,
    createOperationId: createOperationId || (() => crypto.randomUUID()),
    eventTarget: eventTarget || createEventTarget(),
    finalizeEnvelope: finalizeEnvelope || (async prepared => ({
      byteLength: 100,
      envelope: prepared,
      serialized: JSON.stringify(prepared)
    })),
    getClient: () => ({
      rpc: rpc || (async () => ({
        data: [{
          created: false,
          envelope: { profile: { learnerProfile: {} } },
          generation: 1,
          profile_id: PROFILE_ID,
          revision: 1,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
        }],
        error: null
      }))
    }),
    importEnvelope: envelope => envelope.profile,
    isOnline: isOnline || (() => true),
    now: now || (() => 0),
    prepareEnvelope: prepareEnvelope || preparedEnvelope,
    readOnboardingState: () => null,
    setTimer: setTimer || ((callback, delay) => setTimeout(callback, delay)),
    storage: storage || createMemoryStorage(),
    syncStorageKey: SYNC_STORAGE_KEY,
    verifyEnvelope: verifyEnvelope || (async envelope => envelope)
  })
}

test('cloud unavailability remains distinct from unsafe profile recovery', async () => {
  const unavailableStatuses = [408, 429, 503]
  const rejected = createAdapter({
    rpc: async () => ({
      data: null,
      error: { code: '42501', message: 'permission denied' },
      status: 403
    })
  })
  const thrown = createAdapter({
    rpc: async () => { throw new TypeError('network unavailable') }
  })
  const context = {
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: { learnerProfile: {} },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  }

  for (const status of unavailableStatuses) {
    const unavailable = createAdapter({
      rpc: async () => ({
        data: null,
        error: { code: 'PGRST000', message: 'upstream unavailable' },
        status
      })
    })
    assert.deepEqual(await unavailable.resolve(context), {
      status: 'waiting-cloud'
    })
  }
  assert.deepEqual(await thrown.resolve(context), {
    status: 'waiting-cloud'
  })
  assert.deepEqual(await rejected.resolve(context), {
    status: 'recovering'
  })
})

test('owner replacement prepares the new cloud profile before replacing the old sync binding', async () => {
  const storage = createMemoryStorage({
    [SYNC_STORAGE_KEY]: JSON.stringify({
      acceptedRevision: 4,
      generation: 1,
      ownerId: OWNER_ID,
      pending: null,
      profileId: PROFILE_ID,
      queued: null,
      version: 1
    })
  })
  const nextProfile = { learnerProfile: { languages: ['mandarin'] } }
  const adapter = createAdapter({
    rpc: async name => {
      assert.equal(name, 'resolve_my_learner_profile')
      return {
        data: [{
          created: false,
          envelope: { profile: nextProfile },
          generation: 2,
          profile_id: SECOND_PROFILE_ID,
          revision: 7,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
        }],
        error: null
      }
    },
    storage
  })
  const previousLocal = {
    generation: 1,
    ownerId: OWNER_ID,
    profile: { learnerProfile: { languages: ['french'] } },
    profileId: PROFILE_ID,
    revision: 4,
    status: 'ready'
  }

  assert.equal(
    adapter.getReplacementProtection(previousLocal),
    'synchronized'
  )
  const result = await adapter.resolve({
    authentication: { userId: SECOND_OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: previousLocal,
    purpose: 'replace-owner-profile'
  })

  assert.deepEqual(result, {
    created: false,
    generation: 2,
    ownerId: SECOND_OWNER_ID,
    profile: nextProfile,
    profileId: SECOND_PROFILE_ID,
    revision: 7,
    status: 'activate'
  })
  assert.equal(JSON.parse(storage.getItem(SYNC_STORAGE_KEY)).ownerId, OWNER_ID)

  assert.equal(adapter.commitReplacement(result, {
    id: 'replacement-cloud-test',
    nextOwnerId: SECOND_OWNER_ID,
    previousOwnerId: OWNER_ID,
    previousProfileId: PROFILE_ID,
    protection: 'synchronized',
    startedAt: 200
  }), true)
  assert.deepEqual(JSON.parse(storage.getItem(SYNC_STORAGE_KEY)), {
    acceptedRevision: 7,
    generation: 2,
    ownerId: SECOND_OWNER_ID,
    pending: null,
    profileId: SECOND_PROFILE_ID,
    queued: null,
    version: 1
  })
})

test('explicit protection replaces unverifiable sync metadata without weakening synchronized replacement', () => {
  const replacement = {
    generation: 2,
    ownerId: SECOND_OWNER_ID,
    profile: { learnerProfile: { languages: ['mandarin'] } },
    profileId: SECOND_PROFILE_ID,
    revision: 7,
    status: 'activate'
  }
  const transition = protection => ({
    id: `replacement-${protection}-test`,
    nextOwnerId: SECOND_OWNER_ID,
    previousOwnerId: OWNER_ID,
    previousProfileId: PROFILE_ID,
    protection,
    startedAt: 200
  })

  const missingStorage = createMemoryStorage()
  const missingAdapter = createAdapter({ storage: missingStorage })
  assert.equal(
    missingAdapter.commitReplacement(
      replacement,
      transition('synchronized')
    ),
    false
  )
  assert.equal(
    missingAdapter.commitReplacement(replacement, transition('exported')),
    true
  )
  assert.deepEqual(JSON.parse(missingStorage.getItem(SYNC_STORAGE_KEY)), {
    acceptedRevision: 7,
    generation: 2,
    ownerId: SECOND_OWNER_ID,
    pending: null,
    profileId: SECOND_PROFILE_ID,
    queued: null,
    version: 1
  })

  const malformedStorage = createMemoryStorage({
    [DIRTY_STORAGE_KEY]: '{"broken":',
    [SYNC_STORAGE_KEY]: '{"broken":'
  })
  const malformedAdapter = createAdapter({ storage: malformedStorage })
  assert.equal(
    malformedAdapter.commitReplacement(replacement, transition('discarded')),
    true
  )
  assert.equal(malformedStorage.getItem(DIRTY_STORAGE_KEY), null)
  assert.equal(
    JSON.parse(malformedStorage.getItem(SYNC_STORAGE_KEY)).ownerId,
    SECOND_OWNER_ID
  )

  const competingStorage = createMemoryStorage({
    [SYNC_STORAGE_KEY]: JSON.stringify({
      acceptedRevision: 3,
      generation: 1,
      ownerId: SECOND_OWNER_ID,
      pending: null,
      profileId: SECOND_PROFILE_ID,
      queued: null,
      version: 1
    })
  })
  assert.equal(
    createAdapter({ storage: competingStorage }).commitReplacement(
      replacement,
      transition('exported')
    ),
    false
  )
})

test('an in-flight upload from the previous owner is inert after replacement', async () => {
  const upload = deferred()
  let operation = null
  const storage = createMemoryStorage({
    [SYNC_STORAGE_KEY]: JSON.stringify({
      acceptedRevision: 4,
      generation: 1,
      ownerId: OWNER_ID,
      pending: null,
      profileId: PROFILE_ID,
      queued: null,
      version: 1
    })
  })
  const adapter = createAdapter({
    rpc: async (name, parameters) => {
      assert.equal(name, 'commit_my_learner_profile')
      operation = parameters
      return upload.promise
    },
    storage
  })
  const activation = {
    activatedAt: 100,
    generation: 1,
    id: 'old-owner-activation',
    ownerId: OWNER_ID,
    profileId: PROFILE_ID,
    revision: 4
  }
  let activationCurrent = true
  assert.equal(adapter.activate({
    activation,
    generation: 1,
    isCurrent: () => activationCurrent,
    revision: 4
  }), true)
  assert.deepEqual(adapter.save({ learnerProfile: { languages: ['french'] } }, {
    activation,
    isCurrent: () => activationCurrent
  }), { status: 'queued' })
  await flush()
  assert.ok(operation)

  activationCurrent = false
  const replacement = {
    generation: 2,
    ownerId: SECOND_OWNER_ID,
    profile: { learnerProfile: { languages: ['mandarin'] } },
    profileId: SECOND_PROFILE_ID,
    revision: 7,
    status: 'activate'
  }
  assert.equal(adapter.commitReplacement(replacement, {
    id: 'replacement-stale-upload-test',
    nextOwnerId: SECOND_OWNER_ID,
    previousOwnerId: OWNER_ID,
    previousProfileId: PROFILE_ID,
    protection: 'exported',
    startedAt: 200
  }), true)
  assert.deepEqual(adapter.getState(), { status: 'idle' })

  upload.resolve({
    data: [{
      base_revision: operation.p_base_revision,
      generation: operation.p_generation,
      payload_sha256: operation.p_envelope.integrity.payloadSha256,
      profile_id: operation.p_profile_id,
      revision: operation.p_base_revision + 1,
      status: 'accepted'
    }],
    error: null,
    status: 200
  })
  await flush()

  assert.deepEqual(JSON.parse(storage.getItem(SYNC_STORAGE_KEY)), {
    acceptedRevision: 7,
    generation: 2,
    ownerId: SECOND_OWNER_ID,
    pending: null,
    profileId: SECOND_PROFILE_ID,
    queued: null,
    version: 1
  })
  assert.deepEqual(adapter.getState(), { status: 'idle' })
})

test('an unsupported or damaged cloud envelope cannot activate or clear local state', async () => {
  let clearCalls = 0
  const adapter = createAdapter({
    clearOnboardingDraft: () => {
      clearCalls += 1
      return true
    },
    verifyEnvelope: async () => null
  })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: { learnerProfile: { languages: ['french'] } },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.deepEqual(result, { status: 'recovering' })
  assert.equal(clearCalls, 0)
})

test('a retried signed-in profile activation finishes fenced pending draft deletion', async () => {
  let clearCalls = 0
  const adapter = createAdapter({
    clearOnboardingDraft: () => {
      clearCalls += 1
      return true
    }
  })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      onboardingFinalizationPending: true,
      ownerId: OWNER_ID,
      profile: { learnerProfile: {} },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(result.status, 'activate')
  assert.equal(result.created, false)
  assert.equal(result.finalize({ isCurrent: () => true }), true)
  assert.equal(clearCalls, 1)
})

test('a returning owner activation discards an incidental onboarding draft', async () => {
  let clearCalls = 0
  const adapter = createAdapter({
    clearOnboardingDraft: () => {
      clearCalls += 1
      return true
    }
  })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: { learnerProfile: {} },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(clearCalls, 0)
  assert.equal(result.finalize({ isCurrent: () => true }), true)
  assert.equal(clearCalls, 1)
})

test('a stale activation fence cannot discard an onboarding draft', async () => {
  let clearCalls = 0
  const adapter = createAdapter({
    clearOnboardingDraft: () => {
      clearCalls += 1
      return true
    }
  })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: { learnerProfile: {} },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(result.status, 'activate')
  assert.equal(result.finalize({ isCurrent: () => false }), false)
  assert.equal(clearCalls, 0)
})

test('a local save durably queues its integrity before async verification or network work', async () => {
  const storage = createMemoryStorage()
  const digest = deferred()
  const rpcCalls = []
  const adapter = createAdapter({
    createOperationId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    finalizeEnvelope: () => digest.promise,
    rpc: async (name, parameters) => {
      rpcCalls.push([name, parameters])
      if (name === 'resolve_my_learner_profile') {
        return {
          data: [{
            created: false,
            envelope: { profile: { learnerProfile: {} } },
            generation: 3,
            profile_id: PROFILE_ID,
            revision: 7,
            status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
          }],
          error: null
        }
      }
      return { data: null, error: null }
    },
    storage
  })
  const localProfile = {
    ownerId: OWNER_ID,
    profile: { learnerProfile: { languages: ['french'] } },
    profileId: PROFILE_ID,
    status: 'ready'
  }
  const resolved = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile,
    purpose: 'resolve-signed-in-profile'
  })
  const activation = {
    activatedAt: 1,
    id: 'activation-current',
    ownerId: OWNER_ID,
    profileId: PROFILE_ID
  }
  adapter.activate({
    activation,
    generation: resolved.generation,
    isCurrent: () => true,
    revision: resolved.revision
  })

  assert.deepEqual(
    adapter.save(localProfile.profile, { activation, isCurrent: () => true }),
    { status: 'queued' }
  )

  const record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(record.ownerId, OWNER_ID)
  assert.equal(record.profileId, PROFILE_ID)
  assert.equal(record.generation, 3)
  assert.equal(record.acceptedRevision, 7)
  assert.equal(record.pending.operationId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assert.equal(record.pending.baseRevision, 7)
  assert.equal(record.pending.revision, 8)
  assert.equal(record.pending.activationId, 'activation-current')
  assert.equal(
    record.pending.integrity.payloadSha256,
    'A'.repeat(43)
  )
  assert.equal(record.pending.envelope, null)
  assert.deepEqual(record.pending.prepared.profile, localProfile.profile)
  assert.equal(
    rpcCalls.filter(([name]) => name === 'commit_my_learner_profile').length,
    0
  )

  digest.resolve({
    byteLength: 100,
    envelope: {
      ...record.pending.prepared,
      integrity: {
        algorithm: 'SHA-256',
        byteLength: 100,
        payloadSha256: 'A'.repeat(43)
      }
    },
    serialized: '{}'
  })
  await flush()
  const finalizedRecord = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(finalizedRecord.pending.prepared, null)
  assert.equal(
    finalizedRecord.pending.integrity.payloadSha256,
    'A'.repeat(43)
  )
  assert.equal(
    finalizedRecord.pending.envelope.integrity.payloadSha256,
    'A'.repeat(43)
  )
})

test('one upload stays in flight while later local saves coalesce to the newest candidate', async () => {
  const storage = createMemoryStorage()
  const commitResponses = [deferred(), deferred()]
  const commitCalls = []
  const operationIds = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ]
  const adapter = createAdapter({
    createOperationId: () => operationIds.shift(),
    prepareEnvelope: profile => preparedEnvelope(
      profile,
      String(profile.marker).repeat(43)
    ),
    finalizeEnvelope: async prepared => ({
      byteLength: 100,
      envelope: {
        ...prepared,
        integrity: {
          algorithm: 'SHA-256',
          byteLength: 100,
          payloadSha256: String(prepared.profile.marker).repeat(43)
        }
      },
      serialized: '{}'
    }),
    rpc: async (name, parameters) => {
      if (name === 'resolve_my_learner_profile') {
        return {
          data: [{
            created: false,
            envelope: { profile: { marker: '0' } },
            generation: 1,
            profile_id: PROFILE_ID,
            revision: 1,
            status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
          }],
          error: null
        }
      }
      commitCalls.push(parameters)
      return commitResponses[commitCalls.length - 1].promise
    },
    storage
  })
  const resolved = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: { marker: '0' },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })
  const activation = {
    activatedAt: 1,
    id: 'activation-current',
    ownerId: OWNER_ID,
    profileId: PROFILE_ID
  }
  adapter.activate({
    activation,
    generation: resolved.generation,
    isCurrent: () => true,
    revision: resolved.revision
  })

  adapter.save({ marker: '1' }, { activation, isCurrent: () => true })
  await flush()
  adapter.save({ marker: '2' }, { activation, isCurrent: () => true })
  adapter.save({ marker: '3' }, { activation, isCurrent: () => true })
  await flush()

  assert.equal(commitCalls.length, 1)
  assert.equal(commitCalls[0].p_base_revision, 1)
  assert.equal(commitCalls[0].p_envelope.profile.marker, '1')
  let record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(record.pending.operationId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assert.equal(record.queued.operationId, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  assert.equal(record.queued.baseRevision, 2)
  assert.equal(record.queued.prepared.profile.marker, '3')

  commitResponses[0].resolve({
    data: [{
      base_revision: 1,
      generation: 1,
      payload_sha256: '1'.repeat(43),
      profile_id: PROFILE_ID,
      revision: 2,
      status: 'accepted'
    }],
    error: null
  })
  await flush()

  assert.equal(commitCalls.length, 2)
  assert.equal(commitCalls[1].p_base_revision, 2)
  assert.equal(commitCalls[1].p_envelope.profile.marker, '3')

  commitResponses[1].resolve({
    data: [{
      base_revision: 2,
      generation: 1,
      payload_sha256: '3'.repeat(43),
      profile_id: PROFILE_ID,
      revision: 3,
      status: 'accepted'
    }],
    error: null
  })
  await flush()

  record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(record.acceptedRevision, 3)
  assert.equal(record.pending, null)
  assert.equal(record.queued, null)
  assert.equal(commitCalls.length, 2)
})

test('reload adopts the exact durable operation and reconnect retries it behind a new activation fence', async () => {
  let online = false
  const eventTarget = createEventTarget()
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const storage = createMemoryStorage({
    [SYNC_STORAGE_KEY]: JSON.stringify({
      acceptedRevision: 4,
      generation: 2,
      ownerId: OWNER_ID,
      pending: {
        activationId: 'activation-before-reload',
        baseRevision: 4,
        envelope: null,
        generation: 2,
        integrity: {
          algorithm: 'SHA-256',
          byteLength: 100,
          payloadSha256: 'A'.repeat(43)
        },
        nextRetryAt: 0,
        operationId,
        ownerId: OWNER_ID,
        prepared: preparedEnvelope({ marker: 'local-pending' }),
        profileId: PROFILE_ID,
        revision: 5,
        retryCount: 2
      },
      profileId: PROFILE_ID,
      queued: null,
      version: 1
    })
  })
  const commitCalls = []
  const syncStates = []
  const adapter = createAdapter({
    eventTarget,
    isOnline: () => online,
    rpc: async (name, parameters) => {
      if (name === 'resolve_my_learner_profile') {
        return {
          data: [{
            created: false,
            envelope: { profile: { marker: 'cloud-base' } },
            generation: 2,
            profile_id: PROFILE_ID,
            revision: 4,
            status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
          }],
          error: null
        }
      }
      commitCalls.push(parameters)
      return {
        data: [{
          base_revision: 4,
          generation: 2,
          payload_sha256: 'A'.repeat(43),
          profile_id: PROFILE_ID,
          revision: 5,
          status: 'already_accepted'
        }],
        error: null
      }
    },
    storage
  })
  adapter.start()
  adapter.subscribe(state => syncStates.push(state.status))
  const localProfile = {
    ownerId: OWNER_ID,
    profile: { marker: 'local-pending' },
    profileId: PROFILE_ID,
    status: 'ready'
  }

  const resolved = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile,
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(resolved.status, 'activate')
  assert.deepEqual(resolved.profile, localProfile.profile)
  const activation = {
    activatedAt: 2,
    id: 'activation-after-reload',
    ownerId: OWNER_ID,
    profileId: PROFILE_ID
  }
  adapter.activate({
    activation,
    generation: resolved.generation,
    isCurrent: () => true,
    revision: resolved.revision
  })
  await flush()

  let record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(record.pending.operationId, operationId)
  assert.equal(record.pending.activationId, 'activation-after-reload')
  assert.equal(record.pending.retryCount, 2)
  assert.equal(commitCalls.length, 0)
  assert.equal(syncStates.at(-1), 'waiting')

  online = true
  eventTarget.dispatch('online')
  await flush()

  assert.equal(commitCalls.length, 1)
  assert.equal(commitCalls[0].p_operation_id, operationId)
  assert.equal(commitCalls[0].p_base_revision, 4)
  assert.equal(commitCalls[0].p_envelope.profile.marker, 'local-pending')
  record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(record.acceptedRevision, 5)
  assert.equal(record.pending, null)
  assert.equal(syncStates.at(-1), 'up-to-date')
})

test('thrown network failures keep the exact operation and retry it with bounded backoff', async () => {
  let now = 10_000
  const storage = createMemoryStorage()
  const scheduled = []
  const commitCalls = []
  const syncStates = []
  const adapter = createAdapter({
    createOperationId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    now: () => now,
    rpc: async (name, parameters) => {
      if (name === 'resolve_my_learner_profile') {
        return {
          data: [{
            created: false,
            envelope: { profile: { marker: 'cloud' } },
            generation: 1,
            profile_id: PROFILE_ID,
            revision: 1,
            status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
          }],
          error: null
        }
      }
      commitCalls.push(parameters)
      if (commitCalls.length === 1) {
        throw new TypeError('network unavailable')
      }
      return {
        data: [{
          base_revision: 1,
          generation: 1,
          payload_sha256: 'A'.repeat(43),
          profile_id: PROFILE_ID,
          revision: 2,
          status: 'accepted'
        }],
        error: null
      }
    },
    setTimer(callback, delay) {
      scheduled.push({ callback, delay })
      return scheduled.length
    },
    storage
  })
  adapter.subscribe(state => syncStates.push(state.status))
  const resolved = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: { marker: 'cloud' },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })
  const activation = {
    activatedAt: 1,
    id: 'activation-current',
    ownerId: OWNER_ID,
    profileId: PROFILE_ID
  }
  adapter.activate({
    activation,
    generation: resolved.generation,
    isCurrent: () => true,
    revision: resolved.revision
  })
  adapter.save({ marker: 'local' }, { activation, isCurrent: () => true })
  await flush()

  let record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(commitCalls.length, 1)
  assert.equal(record.pending.operationId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assert.equal(record.pending.retryCount, 1)
  assert.equal(record.pending.nextRetryAt, 11_000)
  assert.equal(scheduled.length, 1)
  assert.equal(scheduled[0].delay, 1_000)
  assert.equal(syncStates.at(-1), 'waiting')

  now = 11_000
  scheduled[0].callback()
  await flush()

  assert.equal(commitCalls.length, 2)
  assert.deepEqual(commitCalls[1], commitCalls[0])
  record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(record.acceptedRevision, 2)
  assert.equal(record.pending, null)
  assert.equal(syncStates.at(-1), 'up-to-date')
})

test('reload closes an accepted-operation crash window with the exact receipt', async () => {
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const storage = createMemoryStorage({
    [SYNC_STORAGE_KEY]: JSON.stringify({
      acceptedRevision: 4,
      generation: 2,
      ownerId: OWNER_ID,
      pending: {
        activationId: 'activation-before-reload',
        baseRevision: 4,
        envelope: null,
        generation: 2,
        integrity: {
          algorithm: 'SHA-256',
          byteLength: 100,
          payloadSha256: 'A'.repeat(43)
        },
        nextRetryAt: 0,
        operationId,
        ownerId: OWNER_ID,
        prepared: preparedEnvelope({ marker: 'accepted-before-reload' }),
        profileId: PROFILE_ID,
        revision: 5,
        retryCount: 0
      },
      profileId: PROFILE_ID,
      queued: null,
      version: 1
    })
  })
  const rpcCalls = []
  const adapter = createAdapter({
    rpc: async (name, parameters) => {
      rpcCalls.push([name, parameters])
      if (name === 'resolve_my_learner_profile') {
        return {
          data: [{
            created: false,
            envelope: { profile: { marker: 'accepted-before-reload' } },
            generation: 2,
            profile_id: PROFILE_ID,
            revision: 5,
            status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
          }],
          error: null
        }
      }
      return {
        data: [{
          base_revision: 4,
          generation: 2,
          payload_sha256: 'A'.repeat(43),
          profile_id: PROFILE_ID,
          revision: 5,
          status: 'already_accepted'
        }],
        error: null
      }
    },
    storage
  })
  const localProfile = {
    ownerId: OWNER_ID,
    profile: { marker: 'accepted-before-reload' },
    profileId: PROFILE_ID,
    status: 'ready'
  }

  const resolved = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile,
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(resolved.status, 'activate')
  assert.equal(resolved.revision, 5)
  assert.deepEqual(resolved.profile, localProfile.profile)
  assert.equal(rpcCalls[1][0], 'commit_my_learner_profile')
  assert.equal(rpcCalls[1][1].p_operation_id, operationId)
  assert.deepEqual(JSON.parse(storage.getItem(SYNC_STORAGE_KEY)), {
    acceptedRevision: 5,
    generation: 2,
    ownerId: OWNER_ID,
    pending: null,
    profileId: PROFILE_ID,
    queued: null,
    version: 1
  })
})

test('a malformed durable sync record is preserved for recovery', async () => {
  const malformed = '{"version":1,"pending":'
  const storage = createMemoryStorage({ [SYNC_STORAGE_KEY]: malformed })
  const adapter = createAdapter({ storage })

  const resolved = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: { marker: 'local' },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.deepEqual(resolved, { status: 'recovering' })
  assert.equal(storage.getItem(SYNC_STORAGE_KEY), malformed)
})

test('queue preparation failures durably block unsafe owner replacement', async () => {
  const storage = createMemoryStorage()
  const adapter = createAdapter({
    prepareEnvelope: () => {
      throw new TypeError('invalid local candidate')
    },
    storage
  })
  const states = []
  adapter.subscribe(state => states.push(state.status))
  const resolved = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: { marker: 'cloud' },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })
  const activation = {
    activatedAt: 1,
    id: 'activation-current',
    ownerId: OWNER_ID,
    profileId: PROFILE_ID
  }
  adapter.activate({
    activation,
    generation: resolved.generation,
    isCurrent: () => true,
    revision: resolved.revision
  })
  assert.equal(adapter.markDirty({
    activation,
    isCurrent: () => true
  }), true)

  assert.deepEqual(
    adapter.save({ marker: 'invalid' }, {
      activation,
      isCurrent: () => true
    }),
    { status: 'needs-attention' }
  )
  assert.equal(states.at(-1), 'needs-attention')
  assert.deepEqual(JSON.parse(storage.getItem(DIRTY_STORAGE_KEY)), {
    generation: 1,
    ownerId: OWNER_ID,
    profileId: PROFILE_ID,
    version: 1
  })

  const reloaded = createAdapter({
    prepareEnvelope: () => {
      throw new TypeError('invalid local candidate')
    },
    storage
  })
  const localProfile = {
    generation: 1,
    ownerId: OWNER_ID,
    profile: { marker: 'invalid' },
    profileId: PROFILE_ID,
    status: 'ready'
  }
  assert.equal(reloaded.getReplacementProtection(localProfile), 'pending')
  assert.deepEqual(await reloaded.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile,
    purpose: 'resolve-signed-in-profile'
  }), { status: 'recovering' })
  assert.notEqual(storage.getItem(DIRTY_STORAGE_KEY), null)
})

test('sync-record write failures preserve the durable unsynchronized marker', () => {
  const baseStorage = createMemoryStorage({
    [SYNC_STORAGE_KEY]: JSON.stringify({
      acceptedRevision: 1,
      generation: 1,
      ownerId: OWNER_ID,
      pending: null,
      profileId: PROFILE_ID,
      queued: null,
      version: 1
    })
  })
  let rejectSyncWrites = false
  const storage = {
    getItem: key => baseStorage.getItem(key),
    removeItem: key => baseStorage.removeItem(key),
    setItem(key, value) {
      if (rejectSyncWrites && key === SYNC_STORAGE_KEY) {
        throw new TypeError('storage unavailable')
      }
      baseStorage.setItem(key, value)
    }
  }
  const adapter = createAdapter({ storage })
  const activation = {
    activatedAt: 1,
    id: 'activation-current',
    ownerId: OWNER_ID,
    profileId: PROFILE_ID
  }
  assert.equal(adapter.activate({
    activation,
    generation: 1,
    isCurrent: () => true,
    revision: 1
  }), true)
  assert.equal(adapter.markDirty({
    activation,
    isCurrent: () => true
  }), true)

  rejectSyncWrites = true
  assert.deepEqual(adapter.save({ marker: 'local' }, {
    activation,
    isCurrent: () => true
  }), { status: 'needs-attention' })
  assert.notEqual(storage.getItem(DIRTY_STORAGE_KEY), null)
  assert.equal(adapter.getReplacementProtection({
    generation: 1,
    ownerId: OWNER_ID,
    profile: { marker: 'local' },
    profileId: PROFILE_ID,
    status: 'ready'
  }), 'pending')
})
