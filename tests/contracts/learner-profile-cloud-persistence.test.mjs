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

test('voluntary migration accepts one verified revision when no signed-in profile history exists', async () => {
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const accountlessProfile = { marker: 'untouched-accountless-town' }
  const envelope = preparedEnvelope(accountlessProfile)
  const rpcCalls = []
  const storage = createMemoryStorage()
  const adapter = createAdapter({
    finalizeEnvelope: async prepared => ({
      byteLength: prepared.integrity.byteLength,
      envelope: prepared,
      serialized: JSON.stringify(prepared)
    }),
    prepareEnvelope: () => envelope,
    rpc: async (name, parameters) => {
      rpcCalls.push([name, parameters])
      return {
        data: [{
          envelope,
          generation: 1,
          payload_sha256: envelope.integrity.payloadSha256,
          profile_id: PROFILE_ID,
          revision: 1,
          status: 'migrated'
        }],
        error: null,
        status: 200
      }
    },
    storage
  })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    accountlessAttachment: { operationId },
    localProfile: {
      ownerId: null,
      profile: accountlessProfile,
      profileId: 'accountless:edenia_v1',
      status: 'ready'
    },
    purpose: 'migrate-accountless-profile'
  })

  assert.deepEqual(rpcCalls, [[
    'migrate_my_accountless_profile',
    {
      p_envelope: envelope,
      p_operation_id: operationId
    }
  ]])
  assert.equal(result.status, 'activate')
  assert.equal(result.ownerId, OWNER_ID)
  assert.equal(result.profileId, PROFILE_ID)
  assert.equal(result.generation, 1)
  assert.equal(result.revision, 1)
  assert.equal(result.profile, accountlessProfile)
  assert.equal(result.backupRequired, false)
  assert.deepEqual(JSON.parse(storage.getItem(SYNC_STORAGE_KEY)), {
    acceptedRevision: 1,
    generation: 1,
    ownerId: OWNER_ID,
    pending: null,
    profileId: PROFILE_ID,
    queued: null,
    version: 1
  })
})

test('accountless-profile migration never treats unknown cloud state as absent signed-in profile history', async () => {
  const context = {
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    accountlessAttachment: {
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    },
    localProfile: {
      ownerId: null,
      profile: { marker: 'untouched-accountless-town' },
      profileId: 'accountless:edenia_v1',
      status: 'ready'
    },
    purpose: 'migrate-accountless-profile'
  }
  const transient = createAdapter({
    rpc: async () => ({
      data: null,
      error: { code: 'PGRST000', message: 'unavailable' },
      status: 503
    })
  })
  const unknown = createAdapter({
    rpc: async () => ({
      data: [{ status: 'unknown' }],
      error: null,
      status: 200
    })
  })
  const populated = createAdapter({
    rpc: async () => ({
      data: [{ status: 'profile_present' }],
      error: null,
      status: 200
    })
  })

  assert.deepEqual(await transient.resolve(context), {
    status: 'migration-backup-failed'
  })
  assert.deepEqual(await unknown.resolve(context), {
    status: 'migration-backup-failed'
  })
  assert.deepEqual(await populated.resolve(context), {
    status: 'migration-signed-in-profile-present'
  })
})

test('accountless-profile migration reload retries the protected first envelope before syncing later study', async () => {
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const originalProfile = { marker: 'town-at-first-attempt' }
  const laterProfile = { marker: 'town-after-local-study' }
  const envelope = preparedEnvelope(originalProfile)
  const laterEnvelope = preparedEnvelope(laterProfile, 'B'.repeat(43))
  const storage = createMemoryStorage()
  const context = profile => ({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    accountlessAttachment: { operationId },
    localProfile: {
      ownerId: null,
      profile,
      profileId: 'accountless:edenia_v1',
      status: 'ready'
    },
    purpose: 'migrate-accountless-profile'
  })
  const first = createAdapter({
    finalizeEnvelope: async prepared => ({ envelope: prepared }),
    prepareEnvelope: () => envelope,
    rpc: async () => { throw new TypeError('response lost') },
    storage
  })

  assert.deepEqual(await first.resolve(context(originalProfile)), {
    status: 'migration-backup-failed'
  })

  const rpcCalls = []
  const retry = createAdapter({
    createOperationId: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    prepareEnvelope(profile) {
      assert.deepEqual(profile, laterProfile)
      return laterEnvelope
    },
    rpc: async (name, parameters) => {
      rpcCalls.push([name, parameters])
      if (name === 'migrate_my_accountless_profile') {
        assert.deepEqual(parameters.p_envelope, envelope)
        return {
          data: [{
            envelope,
            generation: 1,
            payload_sha256: envelope.integrity.payloadSha256,
            profile_id: PROFILE_ID,
            revision: 1,
            status: 'migrated'
          }],
          error: null,
          status: 200
        }
      }
      assert.equal(name, 'commit_my_learner_profile')
      assert.deepEqual(parameters, {
        p_base_revision: 1,
        p_envelope: laterEnvelope,
        p_generation: 1,
        p_operation_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        p_profile_id: PROFILE_ID
      })
      return {
        data: [{
          base_revision: 1,
          generation: 1,
          payload_sha256: laterEnvelope.integrity.payloadSha256,
          profile_id: PROFILE_ID,
          revision: 2,
          status: 'accepted'
        }],
        error: null,
        status: 200
      }
    },
    storage
  })

  const result = await retry.resolve(context(laterProfile))
  assert.equal(result.status, 'activate')
  assert.equal(result.profile, laterProfile)
  assert.equal(result.backupRequired, false)
  assert.equal(result.revision, 2)
  assert.equal(rpcCalls.length, 2)
  assert.deepEqual(JSON.parse(storage.getItem(SYNC_STORAGE_KEY)), {
    acceptedRevision: 2,
    generation: 1,
    ownerId: OWNER_ID,
    pending: null,
    profileId: PROFILE_ID,
    queued: null,
    version: 1
  })
})

test('a failed catch-up backup preserves the Accountless profile and retries the exact operation', async () => {
  const migrationOperationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const catchUpOperationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const originalProfile = { marker: 'town-at-first-attempt' }
  const currentProfile = { marker: 'town-after-more-study' }
  const originalEnvelope = preparedEnvelope(originalProfile)
  const currentEnvelope = preparedEnvelope(currentProfile, 'B'.repeat(43))
  const storage = createMemoryStorage()
  const context = profile => ({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    accountlessAttachment: { operationId: migrationOperationId },
    localProfile: {
      ownerId: null,
      profile,
      profileId: 'accountless:edenia_v1',
      status: 'ready'
    },
    purpose: 'migrate-accountless-profile'
  })
  const protectOriginal = createAdapter({
    prepareEnvelope: () => originalEnvelope,
    rpc: async () => { throw new TypeError('network unavailable') },
    storage
  })
  assert.deepEqual(await protectOriginal.resolve(context(originalProfile)), {
    status: 'migration-backup-failed'
  })

  let failedCatchUpParameters = null
  const failCatchUp = createAdapter({
    createOperationId: () => catchUpOperationId,
    prepareEnvelope: () => currentEnvelope,
    rpc: async (name, parameters) => {
      if (name === 'migrate_my_accountless_profile') {
        return {
          data: [{
            envelope: originalEnvelope,
            generation: 1,
            payload_sha256: originalEnvelope.integrity.payloadSha256,
            profile_id: PROFILE_ID,
            revision: 1,
            status: 'migrated'
          }],
          error: null,
          status: 200
        }
      }
      failedCatchUpParameters = structuredClone(parameters)
      return {
        data: [{ status: 'unknown' }],
        error: null,
        status: 200
      }
    },
    storage
  })
  assert.deepEqual(await failCatchUp.resolve(context(currentProfile)), {
    status: 'migration-backup-failed'
  })
  assert.equal(storage.getItem(SYNC_STORAGE_KEY), null)
  const protectedRecord = JSON.parse(storage.getItem(
    `${SYNC_STORAGE_KEY}_accountless_migration`
  ))
  assert.equal(protectedRecord.catchUp.operationId, catchUpOperationId)
  assert.deepEqual(protectedRecord.catchUp.envelope, currentEnvelope)

  const retry = createAdapter({
    prepareEnvelope: () => currentEnvelope,
    rpc: async (name, parameters) => {
      if (name === 'migrate_my_accountless_profile') {
        return {
          data: [{
            envelope: originalEnvelope,
            generation: 1,
            payload_sha256: originalEnvelope.integrity.payloadSha256,
            profile_id: PROFILE_ID,
            revision: 1,
            status: 'migrated'
          }],
          error: null,
          status: 200
        }
      }
      assert.deepEqual(parameters, failedCatchUpParameters)
      return {
        data: [{
          base_revision: 1,
          generation: 1,
          payload_sha256: currentEnvelope.integrity.payloadSha256,
          profile_id: PROFILE_ID,
          revision: 2,
          status: 'already_accepted'
        }],
        error: null,
        status: 200
      }
    },
    storage
  })
  const result = await retry.resolve(context(currentProfile))
  assert.equal(result.status, 'activate')
  assert.equal(result.backupRequired, false)
  assert.equal(result.revision, 2)
})

test('an unverifiable cloud head stays not yet backed up when verified local study activates', async () => {
  const serializedRecord = JSON.stringify({
    acceptedRevision: 4,
    generation: 1,
    ownerId: OWNER_ID,
    pending: null,
    profileId: PROFILE_ID,
    queued: null,
    version: 1
  })
  const storage = createMemoryStorage({
    [SYNC_STORAGE_KEY]: serializedRecord
  })
  const states = []
  const adapter = createAdapter({
    isOnline: () => false,
    rpc: async () => { throw new TypeError('network unavailable') },
    storage
  })
  adapter.subscribe(state => states.push(state.status))

  assert.deepEqual(await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      generation: 1,
      ownerId: OWNER_ID,
      profile: { marker: 'verified-local' },
      profileId: PROFILE_ID,
      revision: 4,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  }), { status: 'waiting-cloud' })
  assert.equal(states.at(-1), 'not-yet-backed-up')

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
    profile: { marker: 'verified-local' },
    revision: 4
  }), true)
  assert.equal(states.at(-1), 'not-yet-backed-up')
  assert.equal(storage.getItem(SYNC_STORAGE_KEY), serializedRecord)
  assert.equal(adapter.markDirty({
    activation,
    isCurrent: () => true
  }), true)
  assert.deepEqual(adapter.save({ marker: 'verified-local-write' }, {
    activation,
    isCurrent: () => true
  }), { status: 'queued' })
  assert.equal(states.at(-1), 'waiting')
  const pending = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(pending.acceptedRevision, 4)
  assert.deepEqual(pending.pending.prepared.profile, {
    marker: 'verified-local-write'
  })
})

test('a verified local profile without cloud revision metadata is visibly not yet backed up', () => {
  const states = []
  const adapter = createAdapter()
  adapter.subscribe(state => states.push(state.status))

  assert.equal(adapter.activate({
    activation: {
      activatedAt: 1,
      id: 'activation-current',
      ownerId: OWNER_ID,
      profileId: `owner:${OWNER_ID}`
    },
    generation: undefined,
    isCurrent: () => true,
    profile: { marker: 'local-without-cloud-identity' },
    revision: undefined
  }), false)
  assert.equal(states.at(-1), 'not-yet-backed-up')
})

test('resolving a provisional owned profile adopts the cloud identity without replacing local study', async () => {
  const localProfile = { marker: 'local-study-after-cloud-became-unknown' }
  const storage = createMemoryStorage()
  const adapter = createAdapter({ storage })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: localProfile,
      profileId: `owner:${OWNER_ID}`,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(result.status, 'activate')
  assert.equal(result.backupRequired, true)
  assert.equal(result.profile, localProfile)
  assert.equal(result.profileId, PROFILE_ID)
  assert.deepEqual(JSON.parse(storage.getItem(SYNC_STORAGE_KEY)), {
    acceptedRevision: 1,
    generation: 1,
    ownerId: OWNER_ID,
    pending: null,
    profileId: PROFILE_ID,
    queued: null,
    version: 1
  })
})

test('reload infers an unqueued local candidate from the accepted cloud head without replacing it', async () => {
  const localProfile = { marker: 'local-save-that-did-not-fit-the-sync-queue' }
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
    rpc: async () => ({
      data: [{
        created: false,
        envelope: { profile: { marker: 'last-accepted-cloud-copy' } },
        generation: 1,
        profile_id: PROFILE_ID,
        revision: 4,
        status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
      }],
      error: null
    }),
    storage
  })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      generation: 1,
      ownerId: OWNER_ID,
      profile: localProfile,
      profileId: PROFILE_ID,
      revision: 4,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(result.status, 'activate')
  assert.equal(result.backupRequired, true)
  assert.equal(result.profile, localProfile)
  assert.equal(
    JSON.parse(storage.getItem(SYNC_STORAGE_KEY)).acceptedRevision,
    4
  )
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

test('repeated cloud failures stop automatically and a learner retry restarts bounded backoff', async () => {
  let now = 10_000
  const eventTarget = createEventTarget()
  const storage = createMemoryStorage()
  const scheduled = []
  const commitCalls = []
  const syncStates = []
  const adapter = createAdapter({
    createOperationId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    eventTarget,
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
      return {
        data: null,
        error: { code: 'PGRST000', message: 'upstream unavailable' },
        status: 503
      }
    },
    setTimer(callback, delay) {
      scheduled.push({ callback, delay })
      return scheduled.length
    },
    storage
  })
  adapter.start()
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

  for (let attempt = 1; attempt < 5; attempt += 1) {
    const record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
    now = record.pending.nextRetryAt
    scheduled.at(-1).callback()
    await flush()
  }

  let record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(commitCalls.length, 5)
  assert.equal(scheduled.length, 4)
  assert.equal(record.pending.operationId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assert.equal(record.pending.retryCount, 5)
  assert.equal(syncStates.at(-1), 'not-backed-up')

  eventTarget.dispatch('focus')
  await flush()

  assert.equal(commitCalls.length, 5)
  assert.equal(syncStates.at(-1), 'not-backed-up')

  assert.equal(adapter.retry(), true)
  await flush()

  record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(commitCalls.length, 6)
  assert.equal(scheduled.length, 5)
  assert.equal(record.pending.operationId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assert.equal(record.pending.retryCount, 1)
  assert.equal(syncStates.at(-1), 'waiting')
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

test('a missed acceptance followed by another writer still opens a conflict', async () => {
  const originalOperationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const replayOperationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const conflictId = '323e4567-e89b-42d3-a456-426614174002'
  const deviceEnvelope = preparedEnvelope(
    { marker: 'accepted-device' },
    'A'.repeat(43)
  )
  const cloudEnvelope = preparedEnvelope(
    { marker: 'later-cloud' },
    'C'.repeat(43)
  )
  const storage = createMemoryStorage({
    [SYNC_STORAGE_KEY]: JSON.stringify({
      acceptedRevision: 1,
      generation: 1,
      ownerId: OWNER_ID,
      pending: {
        activationId: 'activation-before-reload',
        baseRevision: 1,
        envelope: null,
        generation: 1,
        integrity: deviceEnvelope.integrity,
        nextRetryAt: 0,
        operationId: originalOperationId,
        ownerId: OWNER_ID,
        prepared: deviceEnvelope,
        profileId: PROFILE_ID,
        retryCount: 0,
        revision: 2
      },
      profileId: PROFILE_ID,
      queued: null,
      version: 1
    })
  })
  const rpcCalls = []
  const adapter = createAdapter({
    createOperationId: () => replayOperationId,
    rpc: async (name, parameters) => {
      rpcCalls.push([name, parameters])
      if (name === 'resolve_my_learner_profile') {
        return {
          data: [{
            created: false,
            envelope: cloudEnvelope,
            generation: 1,
            profile_id: PROFILE_ID,
            revision: 3,
            status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
          }],
          error: null
        }
      }
      if (name === 'commit_my_learner_profile') {
        if (parameters.p_operation_id === originalOperationId) {
          return {
            data: [{
              base_revision: 1,
              generation: 1,
              payload_sha256: deviceEnvelope.integrity.payloadSha256,
              profile_id: PROFILE_ID,
              revision: 2,
              status: 'already_accepted'
            }],
            error: null
          }
        }
        assert.equal(parameters.p_operation_id, replayOperationId)
        assert.equal(parameters.p_base_revision, 2)
        return {
          data: [{
            base_revision: 2,
            conflict_id: conflictId,
            generation: 1,
            payload_sha256: cloudEnvelope.integrity.payloadSha256,
            profile_id: PROFILE_ID,
            revision: 3,
            status: 'conflict'
          }],
          error: null
        }
      }
      assert.equal(name, 'read_my_learner_profile_conflict')
      return {
        data: [{
          cloud_envelope: cloudEnvelope,
          cloud_generation: 1,
          cloud_revision: 3,
          conflict_id: conflictId,
          device_envelope: deviceEnvelope,
          device_generation: 1,
          device_revision: 3,
          operation_id: replayOperationId,
          profile_id: PROFILE_ID,
          protected_until: null,
          selected_side: null,
          status: 'open'
        }],
        error: null
      }
    },
    storage
  })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: deviceEnvelope.profile,
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(result.status, 'conflicting')
  assert.deepEqual(result.conflict.device.profile, {
    marker: 'accepted-device'
  })
  assert.deepEqual(result.conflict.cloud.profile, { marker: 'later-cloud' })
  assert.equal(
    rpcCalls.filter(([name]) => name === 'commit_my_learner_profile').length,
    2
  )
  assert.equal(
    JSON.parse(storage.getItem(SYNC_STORAGE_KEY)).pending.operationId,
    replayOperationId
  )
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

test('queue preparation rejection reports that the local candidate is not backed up', async () => {
  const adapter = createAdapter({
    prepareEnvelope: () => {
      throw new TypeError('invalid local candidate')
    }
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

  assert.deepEqual(
    adapter.save({ marker: 'invalid' }, {
      activation,
      isCurrent: () => true
    }),
    { status: 'not-backed-up' }
  )
  assert.equal(states.at(-1), 'not-backed-up')
})

test('durable candidate integrity rejection keeps the candidate pending for recovery', async () => {
  const storage = createMemoryStorage()
  const states = []
  const adapter = createAdapter({
    createOperationId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    finalizeEnvelope: async () => {
      throw new TypeError('durable candidate integrity mismatch')
    },
    storage
  })
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
  adapter.save({ marker: 'local-integrity-mismatch' }, {
    activation,
    isCurrent: () => true
  })
  await flush()

  const record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(record.acceptedRevision, 1)
  assert.equal(record.pending.operationId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assert.deepEqual(record.pending.prepared.profile, {
    marker: 'local-integrity-mismatch'
  })
  assert.equal(record.pending.envelope, null)
  assert.equal(states.at(-1), 'not-backed-up')
})

test('sync queue quota rejection preserves its previous cloud receipt state', async () => {
  let serializedRecord = JSON.stringify({
    acceptedRevision: 4,
    generation: 1,
    ownerId: OWNER_ID,
    pending: null,
    profileId: PROFILE_ID,
    queued: null,
    version: 1
  })
  let writes = 0
  const storage = {
    getItem: key => key === SYNC_STORAGE_KEY ? serializedRecord : null,
    setItem(key, value) {
      if (key !== SYNC_STORAGE_KEY) return
      writes += 1
      if (writes > 1) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      serializedRecord = String(value)
    }
  }
  const adapter = createAdapter({ storage })
  const states = []
  adapter.subscribe(state => states.push(state.status))
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
    revision: 4
  }), true)
  const before = serializedRecord

  assert.deepEqual(adapter.save({ marker: 'local-too-large-for-queue' }, {
    activation,
    isCurrent: () => true
  }), { status: 'not-backed-up' })
  assert.equal(serializedRecord, before)
  assert.equal(states.at(-1), 'not-backed-up')
})

test('server rejection preserves the exact local candidate and stops automatic retries until the learner retries', async () => {
  const storage = createMemoryStorage()
  const eventTarget = createEventTarget()
  const scheduled = []
  const states = []
  let commitCalls = 0
  const adapter = createAdapter({
    createOperationId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    eventTarget,
    rpc: async name => {
      if (name === 'resolve_my_learner_profile') {
        return {
          data: [{
            created: false,
            envelope: { profile: { marker: 'cloud' } },
            generation: 1,
            profile_id: PROFILE_ID,
            revision: 4,
            status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
          }],
          error: null
        }
      }
      commitCalls += 1
      return {
        data: null,
        error: {
          code: '22023',
          message: 'Learner profile envelope is invalid'
        },
        status: 400
      }
    },
    setTimer(callback, delay) {
      scheduled.push({ callback, delay })
      return scheduled.length
    },
    storage
  })
  adapter.subscribe(state => states.push(state.status))
  adapter.start()
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
    profile: { marker: 'local-rejected' },
    revision: resolved.revision
  })
  adapter.save({ marker: 'local-rejected' }, {
    activation,
    isCurrent: () => true
  })
  await flush()

  let record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(record.acceptedRevision, 4)
  assert.equal(record.pending.operationId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assert.deepEqual(record.pending.envelope.profile, {
    marker: 'local-rejected'
  })
  assert.equal(record.pending.retryCount, 5)
  assert.equal(record.queued, null)
  assert.equal(scheduled.length, 0)
  assert.equal(states.at(-1), 'not-backed-up')

  adapter.save({ marker: 'newer-local-study' }, {
    activation,
    isCurrent: () => true
  })
  eventTarget.dispatch('focus')
  eventTarget.dispatch('online')
  await flush()

  record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(commitCalls, 1)
  assert.equal(record.pending.retryCount, 5)
  assert.deepEqual(record.queued.prepared.profile, {
    marker: 'newer-local-study'
  })

  assert.equal(adapter.retry(), true)
  await flush()
  assert.equal(commitCalls, 2)
  record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(record.pending.retryCount, 5)
  assert.equal(states.at(-1), 'not-backed-up')
})

test('an accepted older pending operation requeues the latest local profile after a quota rejection', async () => {
  const firstCommit = deferred()
  const commitCalls = []
  let rejectWrites = false
  let serializedRecord = JSON.stringify({
    acceptedRevision: 4,
    generation: 1,
    ownerId: OWNER_ID,
    pending: {
      activationId: 'activation-before-reload',
      baseRevision: 4,
      envelope: preparedEnvelope({ marker: 'older-pending' }),
      generation: 1,
      integrity: preparedEnvelope({ marker: 'older-pending' }).integrity,
      nextRetryAt: 0,
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ownerId: OWNER_ID,
      prepared: null,
      profileId: PROFILE_ID,
      retryCount: 0,
      revision: 5
    },
    profileId: PROFILE_ID,
    queued: null,
    version: 1
  })
  const storage = {
    getItem: key => key === SYNC_STORAGE_KEY ? serializedRecord : null,
    setItem(key, value) {
      if (key !== SYNC_STORAGE_KEY) return
      if (rejectWrites) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      }
      serializedRecord = String(value)
    }
  }
  const adapter = createAdapter({
    createOperationId: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    prepareEnvelope: profile => preparedEnvelope(
      profile,
      profile.marker === 'latest-local-study'
        ? 'B'.repeat(43)
        : 'A'.repeat(43)
    ),
    rpc: async (name, parameters) => {
      if (name === 'resolve_my_learner_profile') {
        return {
          data: [{
            created: false,
            envelope: { profile: { marker: 'cloud-base' } },
            generation: 1,
            profile_id: PROFILE_ID,
            revision: 4,
            status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
          }],
          error: null
        }
      }
      commitCalls.push(parameters)
      if (commitCalls.length === 1) return firstCommit.promise
      return {
        data: [{
          base_revision: 5,
          generation: 1,
          payload_sha256: parameters.p_envelope.integrity.payloadSha256,
          profile_id: PROFILE_ID,
          revision: 6,
          status: 'accepted'
        }],
        error: null
      }
    },
    storage
  })
  const profile = { marker: 'older-pending' }
  const activation = {
    activatedAt: 1,
    id: 'activation-current',
    ownerId: OWNER_ID,
    profileId: PROFILE_ID
  }
  adapter.activate({
    activation,
    generation: 1,
    isCurrent: () => true,
    profile,
    revision: 4
  })
  await flush()
  assert.equal(commitCalls.length, 1)

  profile.marker = 'latest-local-study'
  rejectWrites = true
  assert.deepEqual(adapter.save(profile, {
    activation,
    isCurrent: () => true
  }), { status: 'not-backed-up' })
  rejectWrites = false
  firstCommit.resolve({
    data: [{
      base_revision: 4,
      generation: 1,
      payload_sha256: 'A'.repeat(43),
      profile_id: PROFILE_ID,
      revision: 5,
      status: 'accepted'
    }],
    error: null
  })
  await flush()
  await flush()

  assert.equal(commitCalls.length, 2)
  assert.equal(commitCalls[1].p_base_revision, 5)
  assert.deepEqual(commitCalls[1].p_envelope.profile, {
    marker: 'latest-local-study'
  })
  const record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(record.acceptedRevision, 6)
  assert.equal(record.pending, null)
  assert.equal(record.queued, null)
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
    { status: 'not-backed-up' }
  )
  assert.equal(states.at(-1), 'not-backed-up')
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
  }), { status: 'not-backed-up' })
  assert.notEqual(storage.getItem(DIRTY_STORAGE_KEY), null)
  assert.equal(adapter.getReplacementProtection({
    generation: 1,
    ownerId: OWNER_ID,
    profile: { marker: 'local' },
    profileId: PROFILE_ID,
    status: 'ready'
  }), 'pending')
})

test('a stale commit exposes both server-preserved conflict versions without choosing', async () => {
  const conflictId = '323e4567-e89b-42d3-a456-426614174002'
  const protectedUntil = '2026-09-20T00:00:00.000Z'
  const rpcCalls = []
  const states = []
  const storage = createMemoryStorage()
  let chosen = false
  const adapter = createAdapter({
    createOperationId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    rpc: async (name, parameters) => {
      rpcCalls.push([name, parameters])
      if (name === 'resolve_my_learner_profile') {
        return {
          data: [{
            created: false,
            envelope: preparedEnvelope({ marker: 'cloud-base' }),
            generation: 1,
            profile_id: PROFILE_ID,
            revision: 1,
            status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
          }],
          error: null
        }
      }
      if (name === 'commit_my_learner_profile') {
        return {
          data: [{
            base_revision: 1,
            conflict_id: conflictId,
            generation: 1,
            payload_sha256: 'C'.repeat(43),
            profile_id: PROFILE_ID,
            revision: 2,
            status: 'conflict'
          }],
          error: null
        }
      }
      if (name === 'choose_my_learner_profile_conflict') {
        assert.deepEqual(parameters, {
          p_confirmed: true,
          p_conflict_id: conflictId,
          p_selected_side: 'device'
        })
        chosen = true
        return {
          data: [{
            conflict_id: conflictId,
            envelope: preparedEnvelope(
              { marker: 'this-device' },
              'A'.repeat(43)
            ),
            generation: 1,
            profile_id: PROFILE_ID,
            protected_until: protectedUntil,
            revision: 3,
            selected_side: 'device',
            status: 'chosen'
          }],
          error: null
        }
      }
      assert.equal(name, 'read_my_learner_profile_conflict')
      assert.deepEqual(parameters, { p_conflict_id: conflictId })
      return {
        data: [{
          cloud_envelope: preparedEnvelope(
            { marker: 'cloud-newer' },
            'C'.repeat(43)
          ),
          cloud_generation: 1,
          cloud_revision: 2,
          conflict_id: conflictId,
          device_envelope: preparedEnvelope(
            { marker: 'this-device' },
            'A'.repeat(43)
          ),
          device_generation: 1,
          device_revision: 2,
          operation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          profile_id: PROFILE_ID,
          protected_until: chosen ? protectedUntil : null,
          selected_side: chosen ? 'device' : null,
          status: chosen ? 'resolved' : 'open'
        }],
        error: null
      }
    },
    storage
  })
  adapter.subscribe(state => states.push(state))
  const resolved = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: { marker: 'cloud-base' },
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
  adapter.save(
    { marker: 'this-device' },
    { activation, isCurrent: () => true }
  )
  await flush()
  await flush()

  const conflict = states.at(-1)
  assert.equal(conflict.status, 'conflicting')
  assert.equal(conflict.conflict.id, conflictId)
  assert.equal(conflict.conflict.ownerId, OWNER_ID)
  assert.equal(conflict.conflict.profileId, PROFILE_ID)
  assert.deepEqual(conflict.conflict.device.profile, {
    marker: 'this-device'
  })
  assert.deepEqual(conflict.conflict.cloud.profile, {
    marker: 'cloud-newer'
  })
  assert.equal(
    rpcCalls.filter(([name]) => name === 'commit_my_learner_profile').length,
    1
  )
  assert.equal(
    rpcCalls.filter(
      ([name]) => name === 'read_my_learner_profile_conflict'
    ).length,
    1
  )

  assert.deepEqual(await adapter.chooseConflict({
    confirmed: false,
    conflict: conflict.conflict,
    selectedSide: 'device'
  }), { status: 'confirmation-required' })
  assert.equal(
    rpcCalls.filter(
      ([name]) => name === 'choose_my_learner_profile_conflict'
    ).length,
    0
  )

  const choice = await adapter.chooseConflict({
    confirmed: true,
    conflict: conflict.conflict,
    selectedSide: 'device'
  })
  assert.equal(choice.status, 'chosen')
  assert.equal(choice.selectedSide, 'device')
  assert.deepEqual(choice.profile, { marker: 'this-device' })
  assert.equal(choice.conflict.status, 'resolved')
  assert.equal(choice.conflict.protectedUntil, Date.parse(protectedUntil))
  assert.deepEqual(choice.conflict.device.profile, {
    marker: 'this-device'
  })
  assert.deepEqual(choice.conflict.cloud.profile, {
    marker: 'cloud-newer'
  })
  const record = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(record.acceptedRevision, 3)
  assert.equal(record.pending, null)
  assert.deepEqual(record.protectedConflictIds, [conflictId])
  assert.equal(record.queued, null)
  assert.equal(
    rpcCalls.filter(
      ([name]) => name === 'choose_my_learner_profile_conflict'
    ).length,
    1
  )
})

test('a changed cloud head refreshes an open conflict instead of stranding it', async () => {
  const conflictId = '323e4567-e89b-42d3-a456-426614174002'
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const deviceEnvelope = preparedEnvelope(
    { marker: 'this-device' },
    'A'.repeat(43)
  )
  const originalCloudEnvelope = preparedEnvelope(
    { marker: 'original-cloud' },
    'C'.repeat(43)
  )
  const currentCloudEnvelope = preparedEnvelope(
    { marker: 'current-cloud' },
    'D'.repeat(43)
  )
  const storage = createMemoryStorage({
    [SYNC_STORAGE_KEY]: JSON.stringify({
      acceptedRevision: 1,
      generation: 1,
      ownerId: OWNER_ID,
      pending: {
        activationId: 'activation-before-conflict',
        baseRevision: 1,
        envelope: deviceEnvelope,
        generation: 1,
        integrity: deviceEnvelope.integrity,
        nextRetryAt: 0,
        operationId,
        ownerId: OWNER_ID,
        prepared: null,
        profileId: PROFILE_ID,
        retryCount: 0,
        revision: 2
      },
      profileId: PROFILE_ID,
      queued: null,
      version: 1
    })
  })
  const adapter = createAdapter({
    rpc: async name => {
      if (name === 'choose_my_learner_profile_conflict') {
        return {
          data: [{
            conflict_id: conflictId,
            envelope: null,
            generation: null,
            profile_id: null,
            protected_until: null,
            revision: null,
            selected_side: null,
            status: 'conflict_changed'
          }],
          error: null
        }
      }
      assert.equal(name, 'read_my_learner_profile_conflict')
      return {
        data: [{
          cloud_envelope: currentCloudEnvelope,
          cloud_generation: 1,
          cloud_revision: 3,
          conflict_id: conflictId,
          device_envelope: deviceEnvelope,
          device_generation: 1,
          device_revision: 2,
          operation_id: operationId,
          profile_id: PROFILE_ID,
          protected_until: null,
          selected_side: null,
          status: 'open'
        }],
        error: null
      }
    },
    storage
  })
  const conflict = {
    cloud: {
      envelope: originalCloudEnvelope,
      generation: 1,
      profile: originalCloudEnvelope.profile,
      revision: 2
    },
    device: {
      envelope: deviceEnvelope,
      generation: 1,
      profile: deviceEnvelope.profile,
      revision: 2
    },
    id: conflictId,
    operationId,
    ownerId: OWNER_ID,
    profileId: PROFILE_ID,
    protectedUntil: null,
    selectedSide: null,
    status: 'open'
  }

  const result = await adapter.chooseConflict({
    confirmed: true,
    conflict,
    selectedSide: 'device'
  })

  assert.equal(result.status, 'conflict-changed')
  assert.equal(result.conflict.status, 'open')
  assert.equal(result.conflict.cloud.revision, 3)
  assert.deepEqual(result.conflict.cloud.profile, { marker: 'current-cloud' })
  assert.deepEqual(result.conflict.device.profile, { marker: 'this-device' })
})

test('reload recovers the preserved conflict instead of selecting the cloud head', async () => {
  const conflictId = '323e4567-e89b-42d3-a456-426614174002'
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const storage = createMemoryStorage({
    [SYNC_STORAGE_KEY]: JSON.stringify({
      acceptedRevision: 1,
      generation: 1,
      ownerId: OWNER_ID,
      pending: {
        activationId: 'activation-before-reload',
        baseRevision: 1,
        envelope: null,
        generation: 1,
        integrity: {
          algorithm: 'SHA-256',
          byteLength: 100,
          payloadSha256: 'A'.repeat(43)
        },
        nextRetryAt: 0,
        operationId,
        ownerId: OWNER_ID,
        prepared: preparedEnvelope({ marker: 'this-device' }),
        profileId: PROFILE_ID,
        retryCount: 0,
        revision: 2
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
            envelope: preparedEnvelope(
              { marker: 'cloud-newer' },
              'C'.repeat(43)
            ),
            generation: 1,
            profile_id: PROFILE_ID,
            revision: 3,
            status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
          }],
          error: null
        }
      }
      if (name === 'commit_my_learner_profile') {
        return {
          data: [{
            base_revision: 1,
            conflict_id: conflictId,
            generation: 1,
            payload_sha256: 'C'.repeat(43),
            profile_id: PROFILE_ID,
            revision: 3,
            status: 'conflict'
          }],
          error: null
        }
      }
      return {
        data: [{
          cloud_envelope: preparedEnvelope(
            { marker: 'cloud-newer' },
            'C'.repeat(43)
          ),
          cloud_generation: 1,
          cloud_revision: 3,
          conflict_id: conflictId,
          device_envelope: preparedEnvelope({ marker: 'this-device' }),
          device_generation: 1,
          device_revision: 2,
          operation_id: operationId,
          profile_id: PROFILE_ID,
          protected_until: null,
          selected_side: null,
          status: 'open'
        }],
        error: null
      }
    },
    storage
  })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: { marker: 'this-device' },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(result.status, 'conflicting')
  assert.equal(result.conflict.id, conflictId)
  assert.equal(result.conflict.activation, null)
  assert.deepEqual(result.conflict.device.profile, {
    marker: 'this-device'
  })
  assert.deepEqual(result.conflict.cloud.profile, {
    marker: 'cloud-newer'
  })
  assert.deepEqual(
    rpcCalls.map(([name]) => name),
    [
      'resolve_my_learner_profile',
      'commit_my_learner_profile',
      'read_my_learner_profile_conflict'
    ]
  )
  assert.equal(
    JSON.parse(storage.getItem(SYNC_STORAGE_KEY)).pending.operationId,
    operationId
  )
})

test('reload recovers a server-confirmed choice after response verification failed', async () => {
  const conflictId = '323e4567-e89b-42d3-a456-426614174002'
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const protectedUntil = '2026-09-20T00:00:00.000Z'
  const deviceEnvelope = preparedEnvelope(
    { marker: 'this-device' },
    'A'.repeat(43)
  )
  const cloudEnvelope = preparedEnvelope(
    { marker: 'cloud-newer' },
    'C'.repeat(43)
  )
  const storage = createMemoryStorage({
    [SYNC_STORAGE_KEY]: JSON.stringify({
      acceptedRevision: 1,
      generation: 1,
      ownerId: OWNER_ID,
      pending: {
        activationId: 'activation-before-reload',
        baseRevision: 1,
        envelope: null,
        generation: 1,
        integrity: deviceEnvelope.integrity,
        nextRetryAt: 0,
        operationId,
        ownerId: OWNER_ID,
        prepared: deviceEnvelope,
        profileId: PROFILE_ID,
        retryCount: 0,
        revision: 2
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
            envelope: deviceEnvelope,
            generation: 1,
            profile_id: PROFILE_ID,
            revision: 4,
            status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
          }],
          error: null
        }
      }
      if (name === 'commit_my_learner_profile') {
        return {
          data: [{
            base_revision: 1,
            conflict_id: conflictId,
            generation: 1,
            payload_sha256: cloudEnvelope.integrity.payloadSha256,
            profile_id: PROFILE_ID,
            revision: 3,
            status: 'conflict'
          }],
          error: null
        }
      }
      if (name === 'choose_my_learner_profile_conflict') {
        assert.deepEqual(parameters, {
          p_confirmed: true,
          p_conflict_id: conflictId,
          p_selected_side: 'device'
        })
        return {
          data: [{
            conflict_id: conflictId,
            envelope: deviceEnvelope,
            generation: 1,
            profile_id: PROFILE_ID,
            protected_until: protectedUntil,
            revision: 4,
            selected_side: 'device',
            status: 'already_chosen'
          }],
          error: null
        }
      }
      assert.equal(name, 'read_my_learner_profile_conflict')
      return {
        data: [{
          cloud_envelope: cloudEnvelope,
          cloud_generation: 1,
          cloud_revision: 3,
          conflict_id: conflictId,
          device_envelope: deviceEnvelope,
          device_generation: 1,
          device_revision: 2,
          operation_id: operationId,
          profile_id: PROFILE_ID,
          protected_until: protectedUntil,
          selected_side: 'device',
          status: 'resolved'
        }],
        error: null
      }
    },
    storage
  })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: deviceEnvelope.profile,
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(result.status, 'activate')
  assert.equal(result.revision, 4)
  assert.deepEqual(result.profile, deviceEnvelope.profile)
  assert.equal(result.protectedConflicts[0].status, 'resolved')
  assert.equal(result.protectedConflicts[0].selectedSide, 'device')
  assert.deepEqual(
    rpcCalls.map(([name]) => name),
    [
      'resolve_my_learner_profile',
      'commit_my_learner_profile',
      'read_my_learner_profile_conflict',
      'choose_my_learner_profile_conflict',
      'read_my_learner_profile_conflict'
    ]
  )
  assert.deepEqual(JSON.parse(storage.getItem(SYNC_STORAGE_KEY)), {
    acceptedRevision: 4,
    generation: 1,
    ownerId: OWNER_ID,
    pending: null,
    profileId: PROFILE_ID,
    protectedConflictIds: [conflictId],
    queued: null,
    version: 1
  })
})

test('reload keeps the protected unchosen version downloadable', async () => {
  const conflictId = '323e4567-e89b-42d3-a456-426614174002'
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const protectedUntil = '2026-09-20T00:00:00.000Z'
  const deviceEnvelope = preparedEnvelope(
    { marker: 'this-device' },
    'A'.repeat(43)
  )
  const cloudEnvelope = preparedEnvelope(
    { marker: 'cloud-newer' },
    'C'.repeat(43)
  )
  const storage = createMemoryStorage({
    [SYNC_STORAGE_KEY]: JSON.stringify({
      acceptedRevision: 4,
      generation: 1,
      ownerId: OWNER_ID,
      pending: null,
      profileId: PROFILE_ID,
      protectedConflictIds: [conflictId],
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
            envelope: deviceEnvelope,
            generation: 1,
            profile_id: PROFILE_ID,
            revision: 4,
            status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
          }],
          error: null
        }
      }
      assert.equal(name, 'read_my_learner_profile_conflict')
      assert.deepEqual(parameters, { p_conflict_id: conflictId })
      return {
        data: [{
          cloud_envelope: cloudEnvelope,
          cloud_generation: 1,
          cloud_revision: 3,
          conflict_id: conflictId,
          device_envelope: deviceEnvelope,
          device_generation: 1,
          device_revision: 2,
          operation_id: operationId,
          profile_id: PROFILE_ID,
          protected_until: protectedUntil,
          selected_side: 'device',
          status: 'resolved'
        }],
        error: null
      }
    },
    storage
  })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: deviceEnvelope.profile,
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(result.status, 'activate')
  assert.equal(result.protectedConflicts[0].status, 'resolved')
  assert.equal(result.protectedConflicts[0].selectedSide, 'device')
  assert.deepEqual(result.protectedConflicts[0].cloud.profile, {
    marker: 'cloud-newer'
  })
  assert.deepEqual(
    rpcCalls.map(([name]) => name),
    ['resolve_my_learner_profile', 'read_my_learner_profile_conflict']
  )
})

test('reload retains every unexpired protected conflict download', async () => {
  const conflictIds = [
    '323e4567-e89b-42d3-a456-426614174002',
    '423e4567-e89b-42d3-a456-426614174003'
  ]
  const storage = createMemoryStorage({
    [SYNC_STORAGE_KEY]: JSON.stringify({
      acceptedRevision: 6,
      generation: 1,
      ownerId: OWNER_ID,
      pending: null,
      profileId: PROFILE_ID,
      protectedConflictIds: conflictIds,
      queued: null,
      version: 1
    })
  })
  const adapter = createAdapter({
    rpc: async (name, parameters) => {
      if (name === 'resolve_my_learner_profile') {
        return {
          data: [{
            created: false,
            envelope: preparedEnvelope({ marker: 'current' }),
            generation: 1,
            profile_id: PROFILE_ID,
            revision: 6,
            status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
          }],
          error: null
        }
      }
      assert.equal(name, 'read_my_learner_profile_conflict')
      const index = conflictIds.indexOf(parameters.p_conflict_id)
      assert.notEqual(index, -1)
      return {
        data: [{
          cloud_envelope: preparedEnvelope({ marker: `cloud-${index}` }),
          cloud_generation: 1,
          cloud_revision: index + 2,
          conflict_id: conflictIds[index],
          device_envelope: preparedEnvelope({ marker: `device-${index}` }),
          device_generation: 1,
          device_revision: index + 2,
          operation_id: `${index + 1}aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
          profile_id: PROFILE_ID,
          protected_until: '2026-09-20T00:00:00.000Z',
          selected_side: index === 0 ? 'device' : 'cloud',
          status: 'resolved'
        }],
        error: null
      }
    },
    storage
  })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: { marker: 'current' },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(result.status, 'activate')
  assert.deepEqual(
    result.protectedConflicts.map(conflict => conflict.id),
    conflictIds
  )
  assert.deepEqual(
    result.protectedConflicts.map(conflict => conflict.selectedSide),
    ['device', 'cloud']
  )
})
