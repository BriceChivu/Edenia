// Separate device outboxes share one conditional-write server; lifecycle timing is controlled.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createLearnerProfileCloudPersistenceAdapter } from '../../src/integrations/learner-profile-cloud-persistence.js'
import { LEARNER_PROFILE_RESOLUTION_STATUSES } from '../../src/domain/learner-profile-resolution.js'
import { createHash } from 'node:crypto'
import { createLearnerProfileReverificationController } from '../../src/integrations/learner-profile-reverification.js'

const OWNER_ID = '123e4567-e89b-42d3-a456-426614174000'
const PROFILE_ID = '223e4567-e89b-42d3-a456-426614174001'
const SYNC_STORAGE_KEY = 'edenia_profile_sync_v1'

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
  readHead,
  createCloudAdapter = createLearnerProfileCloudPersistenceAdapter,
  clearOnboardingDraft,
  createOnboardingEnvelope,
  createOperationId,
  eventTarget,
  hasOnboardingProfileDraft,
  finalizeEnvelope,
  isOnline,
  now,
  getSyncOpportunity,
  readDeferredBase,
  minimumWriteIntervalMs = 0,
  prepareEnvelope,
  readOnboardingState,
  rpc,
  setTimer,
  storage,
  verifyEnvelope,
  handoffEnabled = true
} = {}) {
  return createCloudAdapter({
    handoffEnabled,
    getSyncOpportunity,
    readDeferredBase,
    clearOnboardingDraft: clearOnboardingDraft || (() => true),
    createOnboardingEnvelope: createOnboardingEnvelope || (async () => null),
    createOperationId: createOperationId || (() => crypto.randomUUID()),
    eventTarget: eventTarget || createEventTarget(),
    finalizeEnvelope: finalizeEnvelope || (async prepared => ({
      byteLength: 100,
      envelope: prepared,
      serialized: JSON.stringify(prepared)
    })),
    getClient: () => ({
      from(table) {
        assert.equal(table, 'learner_profile_heads')
        return { select(columns) {
          assert.equal(columns, 'user_id,profile_id,generation,revision')
          return { eq(column, owner) {
            assert.equal(column, 'user_id')
            assert.equal(owner, OWNER_ID)
            return { maybeSingle: readHead }
          } }
        } }
      },
      rpc(name, parameters) {
        const response = (rpc || defaultRpc)(name, parameters)
        return Object.assign(Promise.resolve(response), {
          select(columns) {
            assert.equal(columns.includes('envelope'), false)
            return Promise.resolve(response).then(result => ({ ...result,
              data: result.data?.map(row => Object.fromEntries(columns.split(',').map(column => [column, row[column]])))
            }))
          }
        })
      }
    }),
    importEnvelope: envelope => envelope.profile,
    isOnline: isOnline || (() => true),
    now: now || (() => 0),
    minimumWriteIntervalMs,
    prepareEnvelope: prepareEnvelope || preparedEnvelope,
    hasOnboardingProfileDraft: hasOnboardingProfileDraft || (() => false),
    readOnboardingState: readOnboardingState || (() => null),
    setTimer: setTimer || ((callback, delay) => setTimeout(callback, delay)),
    storage: storage || createMemoryStorage(),
    syncStorageKey: SYNC_STORAGE_KEY,
    verifyEnvelope: verifyEnvelope || (async envelope => envelope)
  })
}

async function defaultRpc() {
  return { data: [{ created: false, envelope: { profile: { learnerProfile: {} } },
    generation: 1, profile_id: PROFILE_ID, revision: 1,
    status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY }], error: null }
}

import { canonicalizeJson, sha256Base64UrlSync } from '../../src/state/portable-state.js'

test('sequential phone-computer-phone: a proven accepted phone save must not conflict after computer study', async () => {
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
      if (name === 'read_my_learner_profile_write_receipt') {
        return { data: [{ status: 'already_accepted', base_revision: 1, generation: 1, profile_id: PROFILE_ID, revision: 2,
          payload_sha256: deviceEnvelope.integrity.payloadSha256, request_sha256: operationRequestDigest(parameters.p_operation_id, 1, deviceEnvelope) }], error: null }
      }
      if (name === 'commit_my_learner_profile' || name === 'commit_my_learner_profile_handoff') {
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
      generation: 1,
      revision: 1,
      ownerId: OWNER_ID,
      profile: deviceEnvelope.profile,
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(result.status, 'activate', 'No phone edits followed the accepted save; the later computer head should open silently')
  assert.equal(result.revision, 3)
  assert.deepEqual(result.profile, cloudEnvelope.profile)
  assert.equal(rpcCalls.filter(([name]) => name === 'commit_my_learner_profile').length, 0, 'Inspect the original receipt without inventing another write')
})

const settle = () => new Promise(resolve => setImmediate(resolve))
function operationRequestDigest(operationId, baseRevision, envelope) {
  return sha256Base64UrlSync(canonicalizeJson({ baseRevision, envelope, generation: 1, operationId, ownerId: OWNER_ID, profileId: PROFILE_ID }))
}
const digestEnvelope = profile => preparedEnvelope(profile, createHash('sha256').update(JSON.stringify(profile)).digest('base64url'))

function sharedCloud() {
  let revision = 1
  let envelope = digestEnvelope({ videos: { phone: { favorite: false }, computer: { favorite: false } } })
  const receipts = new Map()
  const conflicts = new Map()
  const calls = []
  return {
    calls,
    head: () => ({ user_id: OWNER_ID, profile_id: PROFILE_ID, generation: 1, revision }),
    rpc: async (name, p) => {
      calls.push({ name, operation: p?.p_operation_id, base: p?.p_base_revision, revision })
      if (name === 'resolve_my_learner_profile') return { data: [{ created: false, envelope: structuredClone(envelope), generation: 1,
        profile_id: PROFILE_ID, revision, status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY }], error: null }
      if (name === 'read_my_learner_profile_conflict') return { data: [conflicts.get(p.p_conflict_id)], error: null }
      if (name === 'read_my_learner_profile_write_receipt') return { data: [receipts.has(p.p_operation_id)
        ? { ...receipts.get(p.p_operation_id), status: 'already_accepted', last_replacement_revision: 0 } : { status: 'not_accepted', last_replacement_revision: 0 }], error: null }
      assert.ok(['commit_my_learner_profile', 'commit_my_learner_profile_handoff'].includes(name))
      if (receipts.has(p.p_operation_id)) return { data: [{ ...receipts.get(p.p_operation_id), status: 'already_accepted' }], error: null }
      if (p.p_base_revision !== revision) {
        if (name === 'commit_my_learner_profile_handoff') return { data: [{ status: 'head_changed', profile_id: PROFILE_ID, generation: 1, revision, base_revision: p.p_base_revision }], error: null }
        const id = crypto.randomUUID()
        conflicts.set(id, { cloud_envelope: structuredClone(envelope), cloud_generation: 1, cloud_revision: revision,
          conflict_id: id, device_envelope: p.p_envelope, device_generation: 1, device_revision: p.p_base_revision + 1,
          operation_id: p.p_operation_id, profile_id: PROFILE_ID, protected_until: null, selected_side: null, status: 'open' })
        return { data: [{ base_revision: p.p_base_revision, conflict_id: id, generation: 1,
          payload_sha256: envelope.integrity.payloadSha256, profile_id: PROFILE_ID, revision, status: 'conflict' }], error: null }
      }
      envelope = structuredClone(p.p_envelope)
      revision++
      const receipt = { base_revision: p.p_base_revision, generation: 1, request_sha256: operationRequestDigest(p.p_operation_id, p.p_base_revision, p.p_envelope),
        payload_sha256: envelope.integrity.payloadSha256, profile_id: PROFILE_ID, revision, status: 'accepted' }
      receipts.set(p.p_operation_id, receipt)
      return { data: [receipt], error: null }
    }
  }
}

async function openDevice(server, { readHead, interval = 30_000, rpc = server.rpc, getSyncOpportunity, readDeferredBase, prepareEnvelope = digestEnvelope } = {}) {
  let time = 0
  const timers = []
  const storage = createMemoryStorage()
  const eventTarget = createEventTarget()
  const adapter = createAdapter({ storage, eventTarget, minimumWriteIntervalMs: interval,
    now: () => time, prepareEnvelope, rpc, getSyncOpportunity, readDeferredBase,
    readHead: readHead || (async () => ({ data: server.head(), error: null })),
    setTimer: (callback, delay) => { timers.push({ callback, delay }); return timers.length } })
  const result = await adapter.resolve({ authentication: { userId: OWNER_ID }, connectivity: { status: 'online' },
    localProfile: { status: 'empty' }, purpose: 'resolve-signed-in-profile' })
  assert.equal(result.status, 'activate')
  const activation = { id: crypto.randomUUID(), ownerId: OWNER_ID, profileId: PROFILE_ID }
  const profile = structuredClone(result.profile)
  adapter.activate({ activation, generation: 1, revision: result.revision, profile, isCurrent: () => true })
  adapter.start()
  return { adapter, eventTarget, storage, profile, activation, timers, revision: result.revision,
    setTime: value => { time = value },
    save: () => adapter.save(profile, { activation, isCurrent: () => true }) }
}

test('control: a clean resumed phone can adopt the computer head when checked before making edits', async () => {
  const server = sharedCloud()
  const phone = await openDevice(server)
  const computer = await openDevice(server)
  computer.profile.videos.computer.favorite = true
  computer.save()
  await settle()
  assert.equal(server.head().revision, 2)
  assert.equal((await phone.adapter.checkActiveHead({ activation: phone.activation, isCurrent: () => true })).status, 'changed')
  const result = await phone.adapter.resolve({ authentication: { userId: OWNER_ID }, connectivity: { status: 'online' },
    localProfile: { ownerId: OWNER_ID, profileId: PROFILE_ID, generation: 1, revision: 1, profile: phone.profile, status: 'ready' },
    purpose: 'resolve-signed-in-profile' })
  assert.equal(result.status, 'activate')
  assert.equal(result.backupRequired, false)
  assert.equal(result.profile.videos.computer.favorite, true)
})

test('resumed phone: an edit during its pending head check must not turn sequential use into a whole-profile conflict', async () => {
  const server = sharedCloud()
  const headRead = deferred()
  const phone = await openDevice(server, { readHead: () => headRead.promise })
  const computer = await openDevice(server)
  computer.profile.videos.computer.favorite = true
  computer.save()
  await settle()
  assert.equal(server.head().revision, 2)
  let checked = null
  const controller = createLearnerProfileReverificationController({ eventTarget: phone.eventTarget,
    isEligible: () => true, now: () => 120_000,
    reverify: async () => { checked = await phone.adapter.checkActiveHead({ activation: phone.activation, isCurrent: () => true }) } })
  controller.start()
  phone.eventTarget.dispatch('focus')
  // Keep new input while checking freshness; preflight must prevent stale writes.
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  headRead.resolve({ data: server.head(), error: null })
  await settle()
  controller.destroy()
  assert.notEqual(phone.adapter.getState().status, 'conflicting', 'Sequential return allowed a save from the stale phone before the cloud head arrived')
  assert.equal(checked.status, 'changed')
  await completeHandoff(phone)
  assert.equal(phone.profile.videos.computer.favorite, true)
  assert.equal(phone.profile.videos.phone.favorite, true)
  assert.equal(server.calls.filter(call => call.name === 'read_my_learner_profile_conflict').length, 0)
})

test('phone-computer-phone: a save coalesced for 30 seconds must not require choosing whole profiles after suspension', async () => {
  const server = sharedCloud()
  const phone = await openDevice(server)
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  assert.equal(server.head().revision, 2)
  phone.setTime(1000)
  phone.profile.videos.phone.watchLater = true
  phone.save()
  await settle()
  assert.equal(server.head().revision, 2, 'The second phone change is held locally during the 30-second write interval')
  assert.equal(JSON.parse(phone.storage.getItem(SYNC_STORAGE_KEY)).pending.baseRevision, 2)
  // Phone is suspended. Computer is opened fresh and is used alone.
  const computer = await openDevice(server)
  computer.profile.videos.computer.favorite = true
  computer.save()
  await settle()
  assert.equal(server.head().revision, 3)
  // Phone resumes after the computer is done; its focus listener retries first.
  phone.setTime(120000)
  phone.eventTarget.dispatch('focus')
  await settle()
  assert.notEqual(phone.adapter.getState().status, 'conflicting', 'A pending local save survives suspension but is later presented as a conflict with unrelated computer activity')
  phone.revision = 2
  await completeHandoff(phone)
  assert.equal(phone.profile.videos.phone.watchLater, true)
  assert.equal(phone.profile.videos.computer.favorite, true)
  assert.equal(server.head().revision, 4, 'Compatible pending changes produce one conditional result')
  assert.equal(server.calls.filter(call => call.name === 'read_my_learner_profile_conflict').length, 0)
})


test('mobile return: visibility restoration alone should request a cloud check', async () => {
  const eventTarget = createEventTarget()
  let attempts = 0
  const controller = createLearnerProfileReverificationController({ eventTarget,
    isEligible: () => true, now: () => 120_000, reverify: () => { attempts++ } })
  controller.start()
  // Model a visible return without a new window focus event.
  eventTarget.dispatch('visibilitychange')
  await settle()
  controller.destroy()
  assert.equal(attempts, 1, 'The controller subscribes only to focus/online/offline; visibility restoration has no check')
})


async function completeHandoff(device) {
  const result = await device.adapter.resolve({ authentication: { userId: OWNER_ID }, connectivity: { status: 'online' },
    localProfile: { status: 'ready', ownerId: OWNER_ID, profileId: PROFILE_ID, generation: 1, revision: device.revision, profile: device.profile },
    purpose: 'resolve-signed-in-profile' })
  assert.equal(result.status, 'activate')
  const installedProfile = structuredClone(result.profile)
  for (const key of Object.keys(device.profile)) delete device.profile[key]
  Object.assign(device.profile, installedProfile)
  if (result.commitSyncRepair) assert.equal(result.commitSyncRepair({ isCurrent: () => true }), true)
  device.revision = result.revision
  device.adapter.activate({ activation: device.activation, baseProfile: result.syncBaseProfile, generation: 1,
    revision: result.revision, profile: device.profile, isCurrent: () => true })
  await settle()
  return result
}

test('interruption between merged IndexedDB installation and outbox replacement recovers on reload', async () => {
  const server = sharedCloud()
  const phone = await openDevice(server)
  const computer = await openDevice(server)
  computer.profile.videos.computer.favorite = true
  computer.save()
  await settle()
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  const result = await phone.adapter.resolve({ authentication: { userId: OWNER_ID }, connectivity: { status: 'online' },
    localProfile: { status: 'ready', ownerId: OWNER_ID, profileId: PROFILE_ID, generation: 1, revision: 1, profile: phone.profile },
    purpose: 'resolve-signed-in-profile' })
  assert.equal(result.status, 'activate')
  assert.ok(phone.storage.getItem(`${SYNC_STORAGE_KEY}_handoff_repair`))
  // Local installation completes, then the tab dies before commitSyncRepair.
  phone.adapter.destroy()
  phone.profile = structuredClone(result.profile)
  phone.revision = result.revision
  phone.adapter = createAdapter({ storage: phone.storage, prepareEnvelope: digestEnvelope, rpc: server.rpc,
    readHead: async () => ({ data: server.head(), error: null }) })
  await completeHandoff(phone)
  assert.equal(phone.profile.videos.phone.favorite, true)
  assert.equal(phone.profile.videos.computer.favorite, true)
  assert.equal(phone.storage.getItem(`${SYNC_STORAGE_KEY}_handoff_repair`), null)
  assert.equal(server.head().revision, 3)
  assert.equal(server.calls.filter(call => call.name === 'read_my_learner_profile_conflict').length, 0)
})

test('lost acknowledgement with later queued edits preserves both the accepted save and later device activity', async () => {
  const server = sharedCloud(), ack = deferred()
  const phone = await openDevice(server, { rpc: async (name, args) => {
    const response = await server.rpc(name, args)
    return name === 'commit_my_learner_profile_handoff' ? ack.promise : response
  } })
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  assert.equal(server.head().revision, 2)
  phone.profile.videos.phone.watchLater = true
  phone.save()
  const computer = await openDevice(server)
  computer.profile.videos.computer.favorite = true
  computer.save()
  await settle()
  phone.adapter.destroy()
  phone.adapter = createAdapter({ storage: phone.storage, prepareEnvelope: digestEnvelope, rpc: server.rpc,
    readHead: async () => ({ data: server.head(), error: null }) })
  await completeHandoff(phone)
  assert.equal(phone.profile.videos.phone.favorite, true)
  assert.equal(phone.profile.videos.phone.watchLater, true)
  assert.equal(phone.profile.videos.computer.favorite, true)
  assert.equal(server.head().revision, 4)
  assert.equal(server.calls.filter(call => call.name === 'read_my_learner_profile_conflict').length, 0)
  ack.resolve({ error: { status: 503 } })
})

test('head advancement after preflight rechecks without creating a protected conflict', async () => {
  const server = sharedCloud()
  const staleHead = server.head()
  const phone = await openDevice(server, { readHead: async () => ({ data: staleHead, error: null }) })
  const computer = await openDevice(server)
  computer.profile.videos.computer.favorite = true
  computer.save()
  await settle()
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  assert.equal(phone.adapter.getState().status, 'head-changed')
  await completeHandoff(phone)
  assert.equal(phone.profile.videos.phone.favorite, true)
  assert.equal(phone.profile.videos.computer.favorite, true)
  assert.equal(server.calls.filter(call => call.name === 'read_my_learner_profile_conflict').length, 0)
})

test('retiring an activation cancels its head read and leaves the candidate intact', async () => {
  const server = sharedCloud(), head = deferred()
  let signal
  head.promise.abortSignal = value => {
    signal = value
    value.addEventListener('abort', () => head.resolve({ error: { status: 0 } }))
    return head.promise
  }
  const phone = await openDevice(server, { readHead: () => head.promise })
  let current = true
  phone.adapter.activate({ activation: phone.activation, generation: 1, revision: 1, profile: phone.profile, isCurrent: () => current })
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  const before = phone.storage.getItem(SYNC_STORAGE_KEY)
  current = false
  assert.equal(phone.adapter.cancelHeadChecks({ activation: phone.activation }), true)
  assert.equal(signal.aborted, true)
  await settle()
  assert.equal(phone.storage.getItem(SYNC_STORAGE_KEY), before)
  assert.equal(server.head().revision, 1)
})

test('final flush waits for an existing upload before lifecycle teardown', async () => {
  const server = sharedCloud(), ack = deferred()
  let response
  const phone = await openDevice(server, { rpc: async (name, args) => {
    const result = await server.rpc(name, args)
    if (name !== 'commit_my_learner_profile_handoff') return result
    response = result
    return ack.promise
  } })
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  let finished = false
  const flushed = phone.adapter.flushSessionBoundary().then(() => { finished = true })
  await settle()
  assert.equal(finished, false)
  ack.resolve(response)
  await flushed
  assert.equal(finished, true)
  assert.equal(JSON.parse(phone.storage.getItem(SYNC_STORAGE_KEY)).pending, null)
})

test('animal wandering during acknowledgement does not create another full-profile upload', async () => {
  const server = sharedCloud(), ack = deferred()
  let response
  const phone = await openDevice(server, { rpc: async (name, args) => {
    const result = await server.rpc(name, args)
    if (name !== 'commit_my_learner_profile_handoff') return result
    response = result
    return ack.promise
  } })
  phone.profile.tinySwordsIsland = { sync_semantics: { version: 1, sha256: 'a'.repeat(64), ambient_arrays: ['chickens', 'sheep'] }, chickens: [[0, 0]], sheep: [], resources: { wood: 1 } }
  phone.save()
  await settle()
  phone.profile.tinySwordsIsland.chickens = [[10, 20]]
  phone.save()
  phone.setTime(10000)
  ack.resolve(response)
  await settle()
  assert.equal(JSON.parse(phone.storage.getItem(SYNC_STORAGE_KEY)).pending, null)
  phone.setTime(41000)
  phone.profile.tinySwordsIsland.chickens = [[20, 30]]
  phone.save()
  await settle()
  assert.equal(server.head().revision, 2)
  phone.profile.tinySwordsIsland.resources.wood = 2
  phone.save()
  await settle()
  assert.equal(server.head().revision, 3, 'Meaningful island changes still upload')
})

test('a receipt waits for local-save enqueue and begins the next ordinary interval at acknowledgement', async () => {
  const server = sharedCloud(), ack = deferred()
  let response
  const phone = await openDevice(server, { rpc: async (name, args) => {
    const result = await server.rpc(name, args)
    if (name !== 'commit_my_learner_profile_handoff') return result
    response = result
    return ack.promise
  } })
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  // The live object has changed, but its second local transaction has not
  // completed yet, so lifecycle has not called cloud save for it.
  assert.equal(phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true }), true)
  phone.profile.videos.phone.watchLater = true
  phone.setTime(35000)
  ack.resolve(response)
  await settle()
  assert.equal(JSON.parse(phone.storage.getItem(SYNC_STORAGE_KEY)).pending, null)
  assert.equal(server.head().revision, 2)
  assert.ok(phone.storage.getItem(`${SYNC_STORAGE_KEY}_dirty`), 'The earlier receipt must preserve the later unfinished local save marker')
  assert.notEqual(phone.adapter.getState().status, 'up-to-date')
  phone.save() // Local transaction completes and lifecycle enqueues it.
  await settle()
  assert.equal(phone.storage.getItem(`${SYNC_STORAGE_KEY}_dirty`), null)
  assert.equal(JSON.parse(phone.storage.getItem(SYNC_STORAGE_KEY)).pending.nextRetryAt, 65000)
  assert.equal(server.head().revision, 2)
  phone.setTime(65000)
  phone.eventTarget.dispatch('focus')
  await settle()
  assert.equal(server.head().revision, 3)
})


test('locking during an ordinary upload gives its later locally saved candidate one final attempt', async () => {
  const server = sharedCloud(), ack = deferred()
  let response, uploads = 0
  const phone = await openDevice(server, { rpc: async (name, args) => {
    const result = await server.rpc(name, args)
    if (name !== 'commit_my_learner_profile_handoff' || ++uploads > 1) return result
    response = result
    return ack.promise
  } })
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  phone.profile.videos.phone.watchLater = true
  phone.save()
  const firstHide = phone.adapter.flushSessionBoundary()
  const repeatedHide = phone.adapter.flushSessionBoundary()
  ack.resolve(response)
  await Promise.all([firstHide, repeatedHide])
  await settle()
  assert.equal(server.head().revision, 3)
  assert.equal(uploads, 2)
  assert.equal(JSON.parse(phone.storage.getItem(SYNC_STORAGE_KEY)).pending, null)
})

test('active play preserves the first durable base but coalesces subsequent cloud preparation', async () => {
  const server = sharedCloud()
  let quiet = false
  let preparations = 0
  const phone = await openDevice(server, { getSyncOpportunity: () => quiet,
    prepareEnvelope: profile => { preparations++; return digestEnvelope(profile) } })
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  const first = JSON.parse(phone.storage.getItem(SYNC_STORAGE_KEY))
  assert.ok(first.pending?.changes, 'First saved edit must promptly retain before-values')
  assert.equal(server.head().revision, 1, 'Active play should defer delivery')
  const count = preparations
  phone.setTime(1000)
  phone.profile.videos.phone.watchLater = true
  assert.equal(phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true }), true)
  phone.adapter.save(phone.profile, { activation: phone.activation, isCurrent: () => true,
    readPersistedProfile: () => structuredClone(phone.profile) })
  assert.equal(preparations, count, 'Later saves must not rebuild the cloud envelope during play')
  assert.ok(phone.storage.getItem(`${SYNC_STORAGE_KEY}_dirty`))
  assert.equal(JSON.parse(phone.storage.getItem(SYNC_STORAGE_KEY)).pending.operationId, first.pending.operationId)
  quiet = true
  phone.setTime(1500)
  phone.timers.splice(0).forEach(timer => timer.callback())
  await settle()
  assert.equal(server.head().revision, 2)
  assert.equal(phone.storage.getItem(`${SYNC_STORAGE_KEY}_dirty`), null)
  const computer = await openDevice(server)
  assert.equal(computer.profile.videos.phone.watchLater, true)
})

test('abrupt close during deferred preparation preserves compatible phone and computer changes', async () => {
  const server = sharedCloud()
  const phone = await openDevice(server, { getSyncOpportunity: () => false })
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  phone.profile.videos.phone.watchLater = true
  phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true })
  phone.adapter.save(phone.profile, { activation: phone.activation, isCurrent: () => true,
    readPersistedProfile: () => structuredClone(phone.profile) })
  // Destroy the tab without firing visibility/pagehide: only durable evidence survives.
  assert.equal(JSON.parse(phone.storage.getItem(SYNC_STORAGE_KEY)).pending.prepared.profile.videos.phone.watchLater, undefined)
  assert.ok(phone.storage.getItem(`${SYNC_STORAGE_KEY}_dirty`))
  phone.adapter.destroy()
  const computer = await openDevice(server)
  computer.profile.videos.computer.favorite = true
  computer.save()
  await settle()
  const resumed = createAdapter({ storage: phone.storage, minimumWriteIntervalMs: 30_000,
    prepareEnvelope: digestEnvelope, rpc: server.rpc,
    readHead: async () => ({ data: server.head(), error: null }) })
  const result = await resumed.resolve({ authentication: { userId: OWNER_ID }, connectivity: { status: 'online' },
    localProfile: { status: 'ready', ownerId: OWNER_ID, profileId: PROFILE_ID,
      generation: 1, revision: 1, profile: phone.profile }, purpose: 'resolve-signed-in-profile' })
  assert.equal(result.status, 'activate')
  assert.equal(result.profile.videos.phone.favorite, true)
  assert.equal(result.profile.videos.phone.watchLater, true)
  assert.equal(result.profile.videos.computer.favorite, true)
  assert.equal(server.calls.filter(call => call.name === 'read_my_learner_profile_conflict').length, 0)
})

test('continuous play defers cloud delivery until the game is no longer in use', async () => {
  const server = sharedCloud()
  let quiet = false
  const phone = await openDevice(server, { getSyncOpportunity: () => quiet })
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  phone.setTime(9999)
  phone.timers.splice(0).forEach(timer => timer.callback())
  await settle()
  assert.equal(server.head().revision, 1)
  phone.setTime(600000)
  phone.timers.splice(0).forEach(timer => timer.callback())
  await settle()
  assert.equal(server.head().revision, 1, 'Continuous play has no forced upload deadline')
  quiet = true
  await phone.adapter.flushSessionBoundary()
  assert.equal(server.head().revision, 2)
})

for (const allowNewUpload of [false, true]) test(`session boundary preserves deferred facts; new delivery allowed=${allowNewUpload}`, async () => {
  const server = sharedCloud()
  let quiet = false
  const phone = await openDevice(server, { getSyncOpportunity: () => quiet })
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  phone.profile.videos.phone.watchLater = true
  phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true })
  phone.adapter.save(phone.profile, { activation: phone.activation, isCurrent: () => true,
    readPersistedProfile: () => structuredClone(phone.profile) })
  quiet = true
  await phone.adapter.flushSessionBoundary({ allowNewUpload })
  await settle()
  const record = JSON.parse(phone.storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(phone.storage.getItem(`${SYNC_STORAGE_KEY}_dirty`), null)
  if (allowNewUpload) {
    assert.equal(server.head().revision, 2)
    assert.equal((await openDevice(server)).profile.videos.phone.watchLater, true)
  } else {
    assert.equal(server.head().revision, 1, 'Terminal pagehide must not start a new upload')
    assert.equal(record.pending.prepared.profile.videos.phone.watchLater, true)
    assert.ok(record.pending.changes)
  }
})

test('deferred preparation waits for local completion and discards retired activation work', async () => {
  const server = sharedCloud()
  let quiet = false, persisting = true
  const phone = await openDevice(server, { getSyncOpportunity: () => quiet })
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  phone.profile.videos.phone.watchLater = true
  phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true })
  phone.adapter.save(phone.profile, { activation: phone.activation, isCurrent: () => true,
    readPersistedProfile: () => persisting ? null : structuredClone(phone.profile) })
  quiet = true
  phone.timers.splice(0).forEach(timer => timer.callback())
  await settle()
  assert.equal(server.head().revision, 1)
  assert.ok(phone.storage.getItem(`${SYNC_STORAGE_KEY}_dirty`))
  const before = phone.storage.getItem(SYNC_STORAGE_KEY)
  phone.adapter.destroy()
  persisting = false
  phone.timers.splice(0).forEach(timer => timer.callback())
  await settle()
  assert.equal(server.head().revision, 1)
  assert.equal(phone.storage.getItem(SYNC_STORAGE_KEY), before)
  assert.ok(phone.storage.getItem(`${SYNC_STORAGE_KEY}_dirty`))
})

test('later batches resume only after play stops, while retaining the ordinary cadence', async () => {
  const server = sharedCloud()
  let quiet = false
  const phone = await openDevice(server, { getSyncOpportunity: () => quiet })
  phone.profile.videos.phone.favorite = true
  phone.save()
  phone.setTime(10000)
  quiet = true
  phone.timers.splice(0).forEach(timer => timer.callback())
  await settle()
  assert.equal(server.head().revision, 2)
  quiet = false
  phone.setTime(41000)
  phone.profile.videos.phone.watchLater = true
  phone.save()
  await settle()
  phone.setTime(510000)
  phone.timers.splice(0).forEach(timer => timer.callback())
  await settle()
  assert.equal(server.head().revision, 2)
  quiet = true
  phone.timers.splice(0).forEach(timer => timer.callback())
  await settle()
  assert.equal(server.head().revision, 3)
})

test('failed deferred preparation leaves its durable base and dirty progress protected', async () => {
  const server = sharedCloud()
  let quiet = false, broken = false
  const phone = await openDevice(server, { getSyncOpportunity: () => quiet,
    prepareEnvelope: profile => { if (broken) throw new Error('Cannot prepare'); return digestEnvelope(profile) } })
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  phone.profile.videos.phone.watchLater = true
  phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true })
  phone.adapter.save(phone.profile, { activation: phone.activation, isCurrent: () => true,
    readPersistedProfile: () => structuredClone(phone.profile) })
  const before = phone.storage.getItem(SYNC_STORAGE_KEY)
  quiet = true
  broken = true
  phone.timers.splice(0).forEach(timer => timer.callback())
  await settle()
  assert.equal(server.head().revision, 1)
  assert.equal(phone.storage.getItem(SYNC_STORAGE_KEY), before)
  assert.ok(phone.storage.getItem(`${SYNC_STORAGE_KEY}_dirty`))
  assert.equal(phone.adapter.getState().status, 'not-backed-up')
  broken = false
  phone.adapter.retry()
  await settle()
  assert.equal(server.head().revision, 2)
  assert.equal((await openDevice(server)).profile.videos.phone.watchLater, true)
})

test('damaged base evidence cannot erase deferred dirty progress during reopening', async () => {
  const server = sharedCloud()
  const phone = await openDevice(server, { getSyncOpportunity: () => false })
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  phone.profile.videos.phone.watchLater = true
  phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true })
  phone.adapter.save(phone.profile, { activation: phone.activation, isCurrent: () => true,
    readPersistedProfile: () => structuredClone(phone.profile) })
  const record = JSON.parse(phone.storage.getItem(SYNC_STORAGE_KEY))
  record.pending.changes.baseDigest = 'B'.repeat(43)
  phone.storage.setItem(SYNC_STORAGE_KEY, JSON.stringify(record))
  const before = phone.storage.getItem(SYNC_STORAGE_KEY)
  phone.adapter.destroy()
  const reopened = createAdapter({ storage: phone.storage, prepareEnvelope: digestEnvelope,
    rpc: server.rpc, readHead: async () => ({ data: server.head(), error: null }) })
  const result = await reopened.resolve({ authentication: { userId: OWNER_ID }, connectivity: { status: 'online' },
    localProfile: { status: 'ready', ownerId: OWNER_ID, profileId: PROFILE_ID,
      generation: 1, revision: 1, profile: phone.profile }, purpose: 'resolve-signed-in-profile' })
  assert.equal(result.status, 'recovering')
  assert.equal(phone.storage.getItem(SYNC_STORAGE_KEY), before)
  assert.ok(phone.storage.getItem(`${SYNC_STORAGE_KEY}_dirty`))
  assert.equal(server.head().revision, 1)
})

test('offline reopening reconstructs deferred work from durable local progress before delivery', async () => {
  const server = sharedCloud()
  const phone = await openDevice(server, { getSyncOpportunity: () => false })
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  phone.profile.videos.phone.watchLater = true
  phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true })
  phone.adapter.save(phone.profile, { activation: phone.activation, isCurrent: () => true,
    readPersistedProfile: () => structuredClone(phone.profile) })
  phone.adapter.destroy()
  let online = false, time = 0, quiet = false
  const timers = [], eventTarget = createEventTarget()
  const resumed = createAdapter({ storage: phone.storage, eventTarget, prepareEnvelope: digestEnvelope,
    getSyncOpportunity: () => quiet, isOnline: () => online, now: () => time,
    minimumWriteIntervalMs: 30000, rpc: server.rpc,
    readHead: async () => ({ data: server.head(), error: null }),
    setTimer: (callback, delay) => { timers.push({ callback, delay }); return timers.length } })
  const activation = { ...phone.activation, id: 'offline-return' }
  resumed.activate({ activation, generation: 1, revision: 1, profile: phone.profile,
    isCurrent: () => true, readPersistedProfile: () => structuredClone(phone.profile) })
  resumed.start()
  online = true
  eventTarget.dispatch('online')
  quiet = true
  time = 10000
  timers.splice(0).forEach(timer => timer.callback())
  await settle()
  assert.equal(server.head().revision, 2)
  assert.equal((await openDevice(server)).profile.videos.phone.watchLater, true)
  assert.equal(phone.storage.getItem(`${SYNC_STORAGE_KEY}_dirty`), null)
})

test('preparation keeps coalescing fresh batches while the ordinary upload interval is pending', async () => {
  const server = sharedCloud()
  let preparations = 0, quiet = false
  const phone = await openDevice(server, { getSyncOpportunity: () => quiet,
    prepareEnvelope: profile => { preparations++; return digestEnvelope(profile) } })
  phone.profile.videos.phone.favorite = true
  phone.save()
  quiet = true
  phone.setTime(10000)
  phone.timers.splice(0).forEach(timer => timer.callback())
  await settle()
  assert.equal(server.head().revision, 2)
  quiet = false
  phone.setTime(14000)
  phone.profile.videos.phone.watchLater = true
  phone.save()
  const change = value => {
    phone.profile.videos.phone.resumeAtSeconds = value
    phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true })
    phone.adapter.save(phone.profile, { activation: phone.activation, isCurrent: () => true,
      readPersistedProfile: () => structuredClone(phone.profile) })
  }
  phone.setTime(15000); change(10)
  phone.setTime(25000)
  phone.timers.splice(0).forEach(timer => timer.callback())
  await settle()
  const count = preparations
  phone.setTime(26000); change(20)
  phone.setTime(27000); change(30)
  assert.equal(preparations, count, 'One expired preparation deadline must not disable batching until the next upload')
  phone.setTime(40000)
  phone.timers.splice(0).forEach(timer => timer.callback())
  await settle()
  assert.equal(server.head().revision, 2)
  quiet = true
  phone.setTime(50000)
  phone.timers.splice(0).forEach(timer => timer.callback())
  await settle()
  assert.equal(server.head().revision, 3, 'Delivery resumes after play stops and the ordinary interval has elapsed')
})

for (const [replacementRevision, race] of [[0, 'none'], [2, 'none'], [2, 'dirty'], [2, 'queued'], [2, 'retired']]) {
test(`ambient sheep motion and refresh logs avoid a choice without a change journal (replacement ${replacementRevision}, race ${race})`, async () => {
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const conflictId = '323e4567-e89b-42d3-a456-426614174002'
  const island = { sync_semantics: { version: 1, sha256: 'a'.repeat(64), ambient_arrays: ['chickens', 'sheep'] }, chickens: [], sheep: [[1, 2]], resources: { wood: 4 } }
  const deviceProfile = { tinySwordsIsland: island, activityLog: [{ id: 'phone-refresh', type: 'youtube-refresh', createdAt: '2026-10-14T11:19:00Z' }] }
  const cloudProfile = structuredClone(deviceProfile)
  cloudProfile.tinySwordsIsland.sheep = [[4, 5]]
  cloudProfile.activityLog = [{ id: 'computer-refresh', type: 'youtube-refresh', createdAt: '2026-10-14T12:20:00Z' }]
  const device = preparedEnvelope(deviceProfile), cloud = preparedEnvelope(cloudProfile, 'C'.repeat(43))
  const pending = { activationId: 'before-suspension', baseRevision: 1, envelope: device, prepared: null, generation: 1,
    integrity: device.integrity, nextRetryAt: 0, operationId, ownerId: OWNER_ID, profileId: PROFILE_ID, retryCount: 0, revision: 2 }
  const storage = createMemoryStorage({ [SYNC_STORAGE_KEY]: JSON.stringify({ version: 1, ownerId: OWNER_ID, profileId: PROFILE_ID,
    generation: 1, acceptedRevision: 1, pending, queued: null }) })
  const calls = []
  let chosen = false, current = true
  const protectedUntil = '2050-10-14T00:00:00Z'
  const adapter = createAdapter({ storage, rpc: async (name, args) => {
    calls.push(name)
    if (name === 'resolve_my_learner_profile') return { data: [{ status: 'profile_ready', created: false, generation: 1, profile_id: PROFILE_ID, revision: 3, envelope: cloud }], error: null }
    if (name === 'read_my_learner_profile_write_receipt') return { data: [{ status: 'not_accepted', last_replacement_revision: replacementRevision }], error: null }
    if (name === 'choose_my_learner_profile_conflict') {
      assert.equal(args.p_selected_side, 'cloud')
      if (race === 'dirty') storage.setItem(SYNC_STORAGE_KEY + '_dirty', JSON.stringify({ version: 1, ownerId: OWNER_ID, profileId: PROFILE_ID, generation: 1 }))
      if (race === 'queued') {
        const newer = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
        newer.queued = { ...pending, operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }
        storage.setItem(SYNC_STORAGE_KEY, JSON.stringify(newer))
      }
      if (race === 'retired') current = false
      chosen = true
      return { data: [{ status: 'chosen', conflict_id: conflictId, selected_side: 'cloud', generation: 1, profile_id: PROFILE_ID,
        revision: 4, protected_until: protectedUntil, envelope: cloud }], error: null }
    }
    if (name === 'commit_my_learner_profile') return { data: [{ status: 'conflict', conflict_id: conflictId, generation: 1,
      profile_id: PROFILE_ID, revision: 3, payload_sha256: cloud.integrity.payloadSha256 }], error: null }
    assert.equal(name, 'read_my_learner_profile_conflict')
    return { data: [{ status: chosen ? 'resolved' : 'open', conflict_id: conflictId, operation_id: operationId, profile_id: PROFILE_ID,
      device_generation: 1, device_revision: 2, device_envelope: device, cloud_generation: 1, cloud_revision: 3,
      cloud_envelope: cloud, selected_side: chosen ? 'cloud' : null, protected_until: chosen ? protectedUntil : null }], error: null }
  } })
  const result = await adapter.resolve({ authentication: { userId: OWNER_ID }, connectivity: { status: 'online' },
    localProfile: { status: 'ready', ownerId: OWNER_ID, profileId: PROFILE_ID, generation: 1, revision: 1, profile: deviceProfile },
    purpose: 'resolve-signed-in-profile', isCurrent: () => current })
  if (race !== 'none') {
    assert.equal(result.status, 'recovering')
    const retained = JSON.parse(storage.getItem(SYNC_STORAGE_KEY))
    assert.equal(retained.pending.operationId, operationId)
    assert.equal(retained.acceptedRevision, 1)
    if (race === 'dirty') assert.notEqual(storage.getItem(SYNC_STORAGE_KEY + '_dirty'), null)
    if (race === 'queued') assert.notEqual(retained.queued, null)
    return
  }
  assert.equal(result.status, 'activate')
  assert.deepEqual(result.profile, cloudProfile)
  if (result.commitSyncRepair) assert.equal(result.commitSyncRepair({ isCurrent: () => true }), true)
  else assert.equal(result.protectedConflicts.length, 1)
  assert.equal(JSON.parse(storage.getItem(SYNC_STORAGE_KEY)).pending, null)
  assert.equal(calls.includes('commit_my_learner_profile'), replacementRevision > 0)
})
}

test('the first edit can wait without envelope preparation and survives abrupt close plus computer study', async () => {
  const server = sharedCloud()
  let base, preparations = 0
  const phone = await openDevice(server, {
    getSyncOpportunity: () => false,
    readDeferredBase: async () => structuredClone(base),
    prepareEnvelope: profile => { preparations++; return digestEnvelope(profile) }
  })
  base = structuredClone(phone.profile)
  const before = preparations
  phone.profile.videos.phone.favorite = true
  assert.equal(phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true }), true)
  phone.adapter.save(phone.profile, { activation: phone.activation, isCurrent: () => true,
    deferPreparation: true, readPersistedProfile: () => structuredClone(phone.profile) })
  assert.equal(preparations, before)
  assert.equal(JSON.parse(phone.storage.getItem(SYNC_STORAGE_KEY)).pending, null)
  assert.ok(phone.storage.getItem(`${SYNC_STORAGE_KEY}_dirty`))
  phone.adapter.destroy()
  const computer = await openDevice(server)
  computer.profile.videos.computer.favorite = true
  computer.save()
  await settle()
  const resumed = createAdapter({ storage: phone.storage, prepareEnvelope: digestEnvelope,
    readDeferredBase: async identity => {
      assert.deepEqual(identity, { ownerId: OWNER_ID, profileId: PROFILE_ID, generation: 1, revision: 1 })
      return structuredClone(base)
    }, rpc: server.rpc, readHead: async () => ({ data: server.head(), error: null }) })
  const result = await resumed.resolve({ authentication: { userId: OWNER_ID }, connectivity: { status: 'online' },
    localProfile: { status: 'ready', ownerId: OWNER_ID, profileId: PROFILE_ID, generation: 1,
      revision: 1, profile: phone.profile }, purpose: 'resolve-signed-in-profile' })
  assert.equal(result.status, 'activate')
  assert.equal(result.profile.videos.phone.favorite, true)
  assert.equal(result.profile.videos.computer.favorite, true)
})

test('an upload receipt and later local edits wait when play resumes during the request', async () => {
  const server = sharedCloud()
  let quiet = true, accepted, preparations = 0
  const receipt = deferred()
  const phone = await openDevice(server, { getSyncOpportunity: () => quiet,
    prepareEnvelope: profile => { preparations++; return digestEnvelope(profile) },
    rpc: async (name, parameters) => {
      const response = await server.rpc(name, parameters)
      if (name !== 'commit_my_learner_profile_handoff') return response
      accepted = response
      return receipt.promise
    } })
  phone.profile.videos.phone.favorite = true
  phone.save()
  await settle()
  assert.ok(accepted)
  quiet = false
  phone.profile.videos.phone.watchLater = true
  phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true })
  phone.adapter.saveDeferred({ activation: phone.activation, isCurrent: () => true,
    readPersistedProfile: () => structuredClone(phone.profile) })
  const before = preparations
  receipt.resolve(accepted)
  await settle()
  assert.equal(preparations, before, 'Receipt cannot hash/prepare the later profile during play')
  assert.equal(JSON.parse(phone.storage.getItem(SYNC_STORAGE_KEY)).acceptedRevision, 1)
  assert.ok(phone.storage.getItem(`${SYNC_STORAGE_KEY}_dirty`))
  quiet = true
  phone.timers.splice(0).forEach(timer => timer.callback())
  await settle()
  const queued = JSON.parse(phone.storage.getItem(SYNC_STORAGE_KEY))
  assert.equal(queued.acceptedRevision, 2)
  assert.equal(queued.pending.prepared.profile.videos.phone.watchLater, true)
  assert.equal(queued.pending.changes.baseRevision, 2)
  assert.equal(phone.storage.getItem(`${SYNC_STORAGE_KEY}_dirty`), null)
})
