import assert from 'node:assert/strict'
import test from 'node:test'
import { createLearnerProfileCloudPersistenceAdapter } from '../../src/integrations/learner-profile-cloud-persistence.js'
import {
  finalizePortableLearnerProfileEnvelope,
  normalizePortableLearnerProfile,
  preparePortableLearnerProfileEnvelope,
  verifyPortableLearnerProfileEnvelope
} from '../../src/state/portable-learner-profile.js'
import { canonicalizeJson, sha256Base64UrlSync } from '../../src/state/portable-state.js'
import { createProfileRecordBatch, isProfileRecordBatch, recordRequestDigest } from '../../src/domain/learner-profile-records.js'
import { captureProfileChanges } from '../../src/domain/portable-profile-combination.js'
import { createLearnerProfileSyncOpportunity } from '../../src/state/learner-profile-sync-opportunity.js'

const OWNER = '123e4567-e89b-42d3-a456-426614174000'
const PROFILE = '223e4567-e89b-42d3-a456-426614174001'
const KEY = 'edenia_profile_sync_v1'
const at = '2026-10-26T10:00:00.000Z'
const later = '2026-10-26T10:01:00.000Z'
const clone = value => structuredClone(value)
const prepare = profile => preparePortableLearnerProfileEnvelope(profile, { now: () => new Date(later) })
const settle = () => new Promise(resolve => setImmediate(resolve))
async function until(condition, label) {
  for (let turn = 0; turn < 100; turn++) {
    if (condition()) return
    await settle()
  }
  assert.ok(condition(), label)
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function memoryStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  }
}
function fixture(count = 2) {
  return normalizePortableLearnerProfile({
    config: { locale: 'en', ankiEnabled: false },
    videos: Object.fromEntries(Array.from({ length: count }, (_, index) => [`video-${index}`, {
      id: `video-${index}`, title: `Lesson ${index} ${'metadata '.repeat(20)}`,
      duration: 3600, channelId: 'channel', channelTitle: 'Example channel',
      thumbnail: `https://example.com/video-${index}.png`, publishedAt: at, source: 'channel',
      status: 'partial', favorite: false, resumeAtSeconds: 15, pausedAt: at,
      watchProgress: [{ watchedAt: at, studyDay: '2026-10-26', seconds: 15, experienceSeconds: 15 }]
    }])),
    anki: { '2026-10-26': { reviewed: 10, created: 1, observedAt: at } },
    tinySwordsIsland: { version: 38, chicken_count: 1, sheep_count: 0, resources: { wood: 0 } },
    cityProgress: { maxLevelIndex: 0, experienceVersion: 1 },
    activityLog: []
  })
}

// One conditional in-memory service models the existing owner lock, complete
// reads and immutable receipts. It applies a batch to a copy before accepting it.
function server(initial = fixture()) {
  let revision = 1, generation = 1, envelope = prepare(initial)
  const calls = [], receipts = new Map(), conflicts = new Map()
  const head = () => ({ user_id: OWNER, profile_id: PROFILE, generation, revision })
  const digest = (name, parameters) => name === 'commit_my_learner_profile_records'
    ? recordRequestDigest({ ownerId: OWNER, operationId: parameters.p_operation_id,
      profileId: parameters.p_profile_id, generation: parameters.p_generation,
      baseRevision: parameters.p_base_revision, recordBatch: parameters.p_batch })
    : sha256Base64UrlSync(canonicalizeJson({ ownerId: OWNER, operationId: parameters.p_operation_id,
      profileId: parameters.p_profile_id, generation: parameters.p_generation,
      baseRevision: parameters.p_base_revision, envelope: parameters.p_envelope }))
  return {
    calls, receipts, head,
    profile: () => clone(envelope.profile),
    reset() { generation++; revision++; envelope = prepare(fixture()) },
    async rpc(name, parameters = {}) {
      calls.push({ name, parameters: clone(parameters) })
      if (name === 'resolve_my_learner_profile') return { data: [{ status: 'profile_ready', created: false,
        profile_id: PROFILE, generation, revision, envelope: clone(envelope) }], error: null }
      if (name === 'read_my_latest_learner_profile_reset') return { data: [{ status: 'none' }], error: null }
      if (name === 'read_my_learner_profile_conflict') return { data: [conflicts.get(parameters.p_conflict_id)], error: null }
      if (['read_my_learner_profile_record_receipt', 'read_my_learner_profile_write_receipt'].includes(name)) {
        const receipt = receipts.get(parameters.p_operation_id)
        return { data: [{ ...(receipt || {}), status: receipt ? 'already_accepted' : 'not_accepted', last_replacement_revision: 0 }], error: null }
      }
      assert.ok(['commit_my_learner_profile_records', 'commit_my_learner_profile_handoff', 'commit_my_learner_profile'].includes(name), name)
      const requestDigest = digest(name, parameters)
      const existing = receipts.get(parameters.p_operation_id)
      if (existing) {
        assert.equal(existing.request_sha256, requestDigest, 'Retry cannot change the immutable request')
        return { data: [{ ...existing, status: 'already_accepted' }], error: null }
      }
      if (parameters.p_profile_id !== PROFILE || parameters.p_generation !== generation || parameters.p_base_revision !== revision) {
        if (name !== 'commit_my_learner_profile') return { data: [{ status: 'head_changed', profile_id: PROFILE,
          generation, revision, base_revision: parameters.p_base_revision, request_sha256: requestDigest }], error: null }
        const id = crypto.randomUUID()
        conflicts.set(id, { conflict_id: id, operation_id: parameters.p_operation_id, profile_id: PROFILE,
          cloud_envelope: clone(envelope), cloud_generation: generation, cloud_revision: revision,
          device_envelope: clone(parameters.p_envelope), device_generation: parameters.p_generation,
          device_revision: parameters.p_base_revision + 1, status: 'open', selected_side: null, protected_until: null })
        return { data: [{ status: 'conflict', conflict_id: id, profile_id: PROFILE, generation, revision,
          base_revision: parameters.p_base_revision, payload_sha256: envelope.integrity.payloadSha256 }], error: null }
      }
      let next
      if (name === 'commit_my_learner_profile_records') {
        assert.equal(isProfileRecordBatch(parameters.p_batch), true)
        assert.equal(Object.hasOwn(parameters, 'p_envelope'), false)
        next = clone(envelope.profile)
        for (const unit of parameters.p_batch.units) {
          const target = unit.kind === 'video' ? next.videos : unit.kind === 'anki' ? next.anki : next
          if (!unit.afterPresent) delete target[unit.key]
          else if (unit.kind === 'video') {
            assert.ok(Object.hasOwn(target, unit.key) || unit.metadata, 'A new video requires its metadata')
            target[unit.key] = { ...target[unit.key], ...clone(unit.metadata || {}), ...clone(unit.after) }
          } else target[unit.key] = clone(unit.after)
        }
        envelope = prepare(next)
      } else {
        assert.ok(await verifyPortableLearnerProfileEnvelope(parameters.p_envelope))
        envelope = clone(parameters.p_envelope)
      }
      revision++
      const receipt = { status: 'accepted', profile_id: PROFILE, generation, revision,
        base_revision: parameters.p_base_revision, payload_sha256: envelope.integrity.payloadSha256,
        request_sha256: requestDigest }
      receipts.set(parameters.p_operation_id, receipt)
      return { data: [receipt], error: null }
    }
  }
}

async function device(service, { recordSyncEnabled = true, storage = memoryStorage(), local = null,
  rpc = (name, parameters) => service.rpc(name, parameters), quiet = () => true,
  interval = 0, recordInterval = 0, expectedStatus = 'activate' } = {}) {
  let time = 0, current = true, preparations = 0, headReads = 0
  const timers = new Map()
  let timerId = 0
  const eventTarget = new EventTarget()
  const adapter = createLearnerProfileCloudPersistenceAdapter({
    handoffEnabled: true, recordSyncEnabled, conditionalOpeningEnabled: false,
    clearOnboardingDraft: () => true, createOnboardingEnvelope: async () => null,
    createOperationId: () => crypto.randomUUID(), eventTarget,
    finalizeEnvelope: finalizePortableLearnerProfileEnvelope,
    verifyEnvelope: verifyPortableLearnerProfileEnvelope,
    prepareEnvelope: profile => { preparations++; return prepare(profile) },
    normalizeProfile: normalizePortableLearnerProfile,
    importEnvelope: value => value.profile,
    getClient: () => ({ rpc, from(table) {
      assert.equal(table, 'learner_profile_heads')
      return { select: () => ({ eq: () => ({ maybeSingle: async () => { headReads++; return { data: service.head(), error: null } } }) }) }
    } }),
    getSyncOpportunity: quiet, isOnline: () => true, now: () => time,
    minimumWriteIntervalMs: interval, recordWriteIntervalMs: recordInterval,
    readOnboardingState: () => null,
    readDeferredBase: async () => clone(local?.baseProfile || service.profile()),
    setTimer(callback, delay) { const id = ++timerId; timers.set(id, { callback, at: time + delay }); return id },
    storage, syncStorageKey: KEY
  })
  const result = await adapter.resolve({ authentication: { userId: OWNER }, connectivity: { status: 'online' },
    localProfile: local ? { status: 'ready', ownerId: OWNER, profileId: PROFILE, generation: local.generation || 1,
      revision: local.revision, profile: local.profile } : { status: 'empty' }, purpose: 'resolve-signed-in-profile' })
  if (expectedStatus !== null) assert.equal(result.status, expectedStatus, `Profile opens: ${result.status}`)
  if (expectedStatus !== 'activate') return { adapter, result, storage, retire() { current = false; adapter.destroy() } }
  const profile = clone(result.profile)
  if (result.commitSyncRepair) assert.equal(result.commitSyncRepair({ isCurrent: () => true }), true)
  const activation = { id: crypto.randomUUID(), ownerId: OWNER, profileId: PROFILE }
  adapter.start()
  assert.equal(adapter.activate({ activation, baseProfile: result.syncBaseProfile, generation: result.generation,
    revision: result.revision, profile, isCurrent: () => current, readPersistedProfile: () => profile }), true)
  const state = () => JSON.parse(storage.getItem(KEY))
  return {
    adapter, storage, profile, activation, result, state,
    preparations: () => preparations, headReads: () => headReads,
    retire() { current = false; adapter.destroy() },
    async advance(milliseconds = 500) {
      time += milliseconds
      const ready = [...timers.entries()].filter(([, timer]) => timer.at <= time)
      for (const [id, timer] of ready) { timers.delete(id); timer.callback() }
      await settle()
    },
    save(dirtyUnits) {
      assert.equal(adapter.markDirty({ activation, isCurrent: () => current }), true)
      assert.equal(adapter.saveDeferred({ activation, isCurrent: () => current, dirtyUnits,
        readPersistedProfile: () => profile }), true)
    }
  }
}
const commits = service => service.calls.filter(call => call.name.startsWith('commit_'))

async function deliver(device, service, revision) {
  await device.advance()
  await until(() => service.head().revision === revision && device.state().acceptedRevision === revision, 'Delivery is durably acknowledged')
}

test('real portable serialization delivers one changed video without unchanged metadata or a full envelope', async t => {
  const cloud = server(fixture(500)), phone = await device(cloud)
  t.after(() => phone.retire())
  phone.profile.videos['video-0'].resumeAtSeconds = 60
  phone.profile.videos['video-0'].pausedAt = later
  phone.save({ videos: ['video-0'] })
  await deliver(phone, cloud, 2)
  const [{ name, parameters }] = commits(cloud)
  assert.equal(name, 'commit_my_learner_profile_records')
  assert.equal(phone.headReads(), 0, 'The typed commit performs its head check atomically without a preflight request')
  assert.equal(parameters.p_batch.units.length, 1)
  assert.equal(parameters.p_batch.units[0].key, 'video-0')
  assert.equal(Object.hasOwn(parameters.p_batch.units[0], 'metadata'), false)
  assert.equal(Object.hasOwn(parameters, 'p_envelope'), false)
  assert.ok(JSON.stringify(parameters.p_batch).length < 1024)
  assert.equal(Object.keys(cloud.profile().videos).length, 500)
  assert.equal(cloud.profile().videos['video-0'].resumeAtSeconds, 60)
})

test('visible active gameplay defers preparation and delivery even during video playback', async t => {
  const opportunity = createLearnerProfileSyncOpportunity({ isHidden: () => false,
    isWatchingVideo: () => true, now: () => 6000 })
  opportunity.reportGame({ visible: true, active: true })
  const cloud = server(), phone = await device(cloud, { quiet: opportunity.isQuiet })
  t.after(() => phone.retire())
  const before = phone.preparations()
  phone.profile.videos['video-0'].favorite = true
  phone.save({ videos: ['video-0'] })
  await phone.advance(600_000)
  await settle()
  assert.equal(phone.preparations(), before)
  assert.equal(commits(cloud).length, 0)
  assert.equal(phone.state().pending, null)
  opportunity.reportGame({ visible: true, active: false })
  await phone.advance()
  await until(() => phone.state().acceptedRevision === 2, 'A quiet opportunity releases the deferred candidate')
  assert.equal(commits(cloud)[0].name, 'commit_my_learner_profile_records')
})

test('lost accepted acknowledgement reopens through its typed receipt when the flag is disabled', async t => {
  const cloud = server()
  let lose = true
  const phone = await device(cloud, { rpc: async (name, parameters) => {
    const response = await cloud.rpc(name, parameters)
    if (name === 'commit_my_learner_profile_records' && lose) { lose = false; throw new TypeError('Response lost') }
    return response
  } })
  phone.profile.videos['video-0'].favorite = true
  phone.save({ videos: ['video-0'] })
  await phone.advance()
  await until(() => cloud.head().revision === 2 && phone.state().pending?.retryCount === 1, 'Accepted response was lost')
  const immutable = clone(phone.state().pending)
  assert.ok(immutable.recordBatch)
  const first = commits(cloud)[0]
  phone.retire()
  const resumed = await device(cloud, { recordSyncEnabled: false, storage: phone.storage,
    local: { profile: phone.profile, revision: 1 } })
  t.after(() => resumed.retire())
  await until(() => resumed.state().pending === null, 'Matching receipt retires the typed candidate')
  assert.equal(resumed.state().acceptedRevision, 2)
  assert.equal(cloud.head().revision, 2)
  assert.ok(cloud.calls.some(call => call.name === 'read_my_learner_profile_record_receipt'))
  const retries = commits(cloud).filter(call => call.parameters.p_operation_id === first.parameters.p_operation_id)
  for (const retry of retries) assert.deepEqual(retry, first)
  assert.equal(cloud.receipts.get(immutable.operationId).request_sha256, recordRequestDigest(immutable))
  resumed.profile.videos['video-1'].favorite = true
  resumed.save({ videos: ['video-1'] })
  await deliver(resumed, cloud, 3)
  assert.equal(commits(cloud).at(-1).name, 'commit_my_learner_profile_handoff', 'Flag-off creates only future full-envelope operations')
})

test('an uncertain unaccepted request retries identical typed bytes and ID after flag-off reload', async t => {
  const cloud = server(), attempts = []
  const phone = await device(cloud, { rpc: async (name, parameters) => {
    if (name === 'commit_my_learner_profile_records') {
      attempts.push({ name, parameters: clone(parameters) })
      throw new TypeError('Connection closed before the outcome was known')
    }
    return cloud.rpc(name, parameters)
  } })
  phone.profile.videos['video-0'].favorite = true
  phone.save({ videos: ['video-0'] })
  await phone.advance()
  await until(() => phone.state().pending?.retryCount === 1, 'Uncertain typed request is durably retained')
  const pending = clone(phone.state().pending)
  assert.equal(cloud.head().revision, 1)
  assert.equal(attempts.length, 1)
  phone.retire()
  const reopened = await device(cloud, { recordSyncEnabled: false, storage: phone.storage,
    local: { profile: phone.profile, revision: 1 } })
  t.after(() => reopened.retire())
  reopened.adapter.retry()
  await until(() => reopened.state().acceptedRevision === 2, 'Pending typed request survives transport rollback')
  const [accepted] = commits(cloud)
  assert.equal(accepted.name, 'commit_my_learner_profile_records')
  assert.deepEqual(accepted, attempts[0])
  assert.equal(accepted.parameters.p_operation_id, pending.operationId)
  assert.equal(cloud.receipts.size, 1)
  assert.equal(cloud.profile().videos['video-0'].favorite, true)
})

test('an existing v1 full-envelope operation survives enabling record sync', async t => {
  const cloud = server(), hold = deferred()
  const phone = await device(cloud, { recordSyncEnabled: false, rpc: async (name, parameters) => {
    if (name === 'commit_my_learner_profile_handoff') return hold.promise
    return cloud.rpc(name, parameters)
  } })
  phone.profile.videos['video-0'].favorite = true
  phone.save({ videos: ['video-0'] })
  await phone.advance()
  await until(() => Boolean(phone.state().pending?.envelope), 'Legacy request is finalized before delivery')
  const pending = clone(phone.state().pending)
  assert.equal(Object.hasOwn(pending, 'recordBatch'), false)
  phone.retire()
  const reopened = await device(cloud, { recordSyncEnabled: true, storage: phone.storage,
    local: { profile: phone.profile, revision: 1 } })
  t.after(() => reopened.retire())
  await until(() => reopened.state().acceptedRevision === 2, 'Legacy bytes survive trial enablement')
  const accepted = commits(cloud).find(call => call.parameters.p_operation_id === pending.operationId)
  assert.equal(accepted.name, 'commit_my_learner_profile_handoff')
  assert.deepEqual(accepted.parameters.p_envelope, pending.envelope)
  assert.equal(cloud.profile().videos['video-0'].favorite, true)
  hold.resolve({ data: [], error: null })
})

test('a newer queued edit survives the older typed acknowledgement', async t => {
  const cloud = server(), acknowledgement = deferred()
  let held = false, quiet = true
  const phone = await device(cloud, { quiet: () => quiet, rpc: async (name, parameters) => {
    const response = await cloud.rpc(name, parameters)
    if (name === 'commit_my_learner_profile_records' && !held) { held = true; return acknowledgement.promise.then(() => response) }
    return response
  } })
  t.after(() => phone.retire())
  phone.profile.videos['video-0'].favorite = true
  phone.save({ videos: ['video-0'] })
  await phone.advance()
  await until(() => held, 'First typed request accepted and awaiting its response')
  const first = commits(cloud)[0]
  quiet = false
  const before = phone.preparations()
  phone.profile.videos['video-1'].watchLater = true
  phone.save({ videos: ['video-1'] })
  await phone.advance()
  assert.equal(phone.state().pending.operationId, first.parameters.p_operation_id)
  assert.deepEqual(phone.state().pending.recordBatch, first.parameters.p_batch)
  acknowledgement.resolve()
  await settle()
  await phone.advance(600_000)
  assert.equal(phone.preparations(), before, 'Later local preparation waits while the game is active')
  assert.equal(phone.state().acceptedRevision, 1, 'Receipt installation waits while the game is active')
  assert.ok(phone.storage.getItem(`${KEY}_dirty`), 'The newer acknowledged local edit remains pending')
  quiet = true
  await phone.advance()
  await until(() => phone.state().acceptedRevision === 3, 'Later edit follows the older acknowledgement')
  assert.equal(cloud.profile().videos['video-0'].favorite, true)
  assert.equal(cloud.profile().videos['video-1'].watchLater, true)
  const sent = commits(cloud)
  assert.equal(sent.length, 2)
  assert.notEqual(sent[1].parameters.p_operation_id, first.parameters.p_operation_id)
  assert.equal(sent[1].parameters.p_base_revision, 2)
  assert.equal(sent[1].parameters.p_batch.units.find(unit => unit.key === 'video-1').after.watchLater, true)
  assert.equal(phone.state().pending, null)
})

test('explicit video deletion is delivered without erasing unrelated records', async t => {
  const cloud = server(), phone = await device(cloud)
  t.after(() => phone.retire())
  delete phone.profile.videos['video-0']
  phone.save({ videos: ['video-0'] })
  await deliver(phone, cloud, 2)
  assert.deepEqual(commits(cloud)[0].parameters.p_batch.units, [{ kind: 'video', key: 'video-0', afterPresent: false }])
  assert.equal(Object.hasOwn(cloud.profile().videos, 'video-0'), false)
  assert.equal(Object.hasOwn(cloud.profile().videos, 'video-1'), true)
})

test('separate device records combine through the existing protected handoff resolver', async t => {
  const cloud = server(), phone = await device(cloud), computer = await device(cloud)
  t.after(() => { phone.retire(); computer.retire() })
  phone.profile.videos['video-0'].favorite = true
  phone.save({ videos: ['video-0'] })
  await deliver(phone, cloud, 2)
  computer.profile.videos['video-1'].watchLater = true
  computer.save({ videos: ['video-1'] })
  await computer.advance()
  await until(() => computer.adapter.getState().status === 'head-changed', 'Stale device detects the current head')
  const result = await computer.adapter.resolve({ authentication: { userId: OWNER }, connectivity: { status: 'online' },
    localProfile: { status: 'ready', ownerId: OWNER, profileId: PROFILE, generation: 1, revision: 1, profile: computer.profile },
    purpose: 'resolve-signed-in-profile' })
  assert.equal(result.status, 'activate')
  assert.equal(result.profile.videos['video-0'].favorite, true)
  assert.equal(result.profile.videos['video-1'].watchLater, true)
  if (result.commitSyncRepair) assert.equal(result.commitSyncRepair({ isCurrent: () => true }), true)
  Object.assign(computer.profile, clone(result.profile))
  computer.adapter.activate({ activation: computer.activation, baseProfile: result.syncBaseProfile,
    generation: result.generation, revision: result.revision, profile: computer.profile, isCurrent: () => true })
  await until(() => cloud.head().revision === 3, 'Combined profile is accepted once')
  assert.equal(cloud.profile().videos['video-0'].favorite, true)
  assert.equal(cloud.profile().videos['video-1'].watchLater, true)
})

test('simultaneous meaningful island edits retain both candidates for an explicit protected choice', async t => {
  const cloud = server(), phone = await device(cloud), computer = await device(cloud)
  t.after(() => { phone.retire(); computer.retire() })
  phone.profile.tinySwordsIsland.resources.wood = 1
  phone.save({ island: true })
  await deliver(phone, cloud, 2)
  computer.profile.tinySwordsIsland.resources.wood = 2
  computer.save({ island: true })
  await computer.advance()
  await until(() => computer.adapter.getState().status === 'head-changed', 'Competing island stays pending')
  const result = await computer.adapter.resolve({ authentication: { userId: OWNER }, connectivity: { status: 'online' },
    localProfile: { status: 'ready', ownerId: OWNER, profileId: PROFILE, generation: 1, revision: 1, profile: computer.profile },
    purpose: 'resolve-signed-in-profile' })
  assert.equal(result.status, 'conflicting')
  assert.ok(result.conflict?.id, 'Meaningful island divergence reaches the existing protected choice UI')
  assert.equal(result.conflict.device.profile.tinySwordsIsland.resources.wood, 2)
  assert.equal(result.conflict.cloud.profile.tinySwordsIsland.resources.wood, 1)
  assert.equal(cloud.head().revision, 2)
})

test('an intentional generation reset fences a pending typed island and protects the displaced candidate', async t => {
  let quiet = false
  const cloud = server(), phone = await device(cloud, { quiet: () => quiet })
  t.after(() => phone.retire())
  phone.profile.tinySwordsIsland.resources.wood = 3
  phone.save({ island: true })
  cloud.reset()
  quiet = true
  await phone.advance()
  await until(() => phone.adapter.getState().status === 'head-changed', 'Reset generation prevents the stale write')
  const result = await phone.adapter.resolve({ authentication: { userId: OWNER }, connectivity: { status: 'online' },
    localProfile: { status: 'ready', ownerId: OWNER, profileId: PROFILE, generation: 1, revision: 1, profile: phone.profile },
    purpose: 'resolve-signed-in-profile' })
  assert.equal(result.status, 'conflicting')
  assert.ok(result.conflict?.id, 'The old generation remains recoverable through an explicit protected choice')
  assert.equal(result.conflict.device.generation, 1)
  assert.equal(result.conflict.cloud.generation, 2)
  assert.equal(result.conflict.device.profile.tinySwordsIsland.resources.wood, 3)
  assert.equal(cloud.head().generation, 2)
  assert.equal(cloud.profile().tinySwordsIsland.resources.wood, 0)
})


test('an accepted typed receipt with a different request digest cannot retire local pending work', async t => {
  const cloud = server(), phone = await device(cloud, { rpc: async (name, parameters) => {
    const response = await cloud.rpc(name, parameters)
    if (name === 'commit_my_learner_profile_records') response.data[0].request_sha256 = 'A'.repeat(43)
    return response
  } })
  t.after(() => phone.retire())
  phone.profile.videos['video-0'].favorite = true
  phone.save({ videos: ['video-0'] })
  await phone.advance()
  await until(() => phone.adapter.getState().status === 'not-backed-up', 'Mismatched acknowledgement is rejected')
  assert.equal(phone.state().acceptedRevision, 1)
  assert.equal(phone.state().pending.recordBatch.units[0].after.favorite, true)
  assert.equal(cloud.head().revision, 2)
})

test('a damaged batch cannot disagree with its full recovery candidate on reopening', async t => {
  const cloud = server(), hold = deferred()
  const phone = await device(cloud, { rpc: (name, parameters) => name === 'commit_my_learner_profile_records'
    ? hold.promise : cloud.rpc(name, parameters) })
  phone.profile.videos['video-0'].favorite = true
  phone.save({ videos: ['video-0'] })
  await phone.advance()
  await until(() => Boolean(phone.state().pending?.envelope), 'Typed candidate is durable and finalized')
  const broken = phone.state()
  broken.pending.recordBatch.units[0].after.favorite = false
  assert.equal(isProfileRecordBatch(broken.pending.recordBatch), true, 'Damage is a semantic mismatch, not an invalid JSON shape')
  const serialized = JSON.stringify(broken)
  phone.retire()
  phone.storage.setItem(KEY, serialized)
  const reopened = await device(cloud, { recordSyncEnabled: false, storage: phone.storage,
    local: { profile: phone.profile, revision: 1 }, expectedStatus: 'recovering' })
  t.after(() => reopened.retire())
  assert.equal(reopened.storage.getItem(KEY), serialized)
  assert.equal(cloud.head().revision, 1)
  assert.equal(commits(cloud).length, 0)
  hold.resolve({ data: [], error: null })
})

test('a missing typed RPC preserves the immutable operation instead of silently switching transport', async t => {
  const cloud = server(), attempted = []
  const phone = await device(cloud, { rpc: (name, parameters) => {
    if (name === 'commit_my_learner_profile_records') {
      attempted.push(clone(parameters))
      return { data: null, status: 404, error: { code: 'PGRST202' } }
    }
    return cloud.rpc(name, parameters)
  } })
  t.after(() => phone.retire())
  phone.profile.videos['video-0'].favorite = true
  phone.save({ videos: ['video-0'] })
  await phone.advance()
  await until(() => phone.adapter.getState().status === 'not-backed-up', 'Missing capability leaves a recoverable candidate')
  const pending = clone(phone.state().pending)
  assert.ok(pending.recordBatch)
  phone.adapter.retry()
  await until(() => attempted.length === 2, 'Explicit retry keeps the recorded transport')
  assert.deepEqual(attempted[0], attempted[1])
  assert.equal(phone.state().pending.operationId, pending.operationId)
  assert.equal(phone.state().acceptedRevision, 1)
  assert.equal(commits(cloud).length, 0)
})

test('an unsent full candidate coalesces a later known record without dropping earlier edits', async t => {
  const cloud = server(), phone = await device(cloud, { interval: 30000 })
  t.after(() => phone.retire())
  phone.profile.videos['video-0'].favorite = true
  assert.equal(phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true }), true)
  assert.equal(phone.adapter.save(phone.profile, { activation: phone.activation, isCurrent: () => true,
    dirtyUnits: null, skipPump: true }).status, 'queued')
  assert.equal(Object.hasOwn(phone.state().pending, 'recordBatch'), false)
  assert.equal(phone.state().pending.envelope, null)
  phone.profile.videos['video-1'].watchLater = true
  phone.save({ videos: ['video-1'] })
  await deliver(phone, cloud, 2)
  assert.equal(commits(cloud).length, 1)
  assert.equal(commits(cloud)[0].name, 'commit_my_learner_profile_handoff')
  assert.equal(phone.headReads(), 1, 'The complete-envelope path retains its current preflight')
  assert.equal(cloud.profile().videos['video-0'].favorite, true)
  assert.equal(cloud.profile().videos['video-1'].watchLater, true)
})

test('a generic queued full candidate retains older edits when a later known record arrives during typed delivery', async t => {
  const cloud = server(fixture(3)), hold = deferred()
  let held = false
  const phone = await device(cloud, { rpc: async (name, parameters) => {
    const response = await cloud.rpc(name, parameters)
    if (name === 'commit_my_learner_profile_records' && !held) { held = true; await hold.promise }
    return response
  } })
  t.after(() => phone.retire())
  phone.profile.videos['video-0'].favorite = true
  phone.save({ videos: ['video-0'] })
  await phone.advance()
  await until(() => held, 'Typed request is accepted but its response remains in flight')
  phone.profile.videos['video-1'].favorite = true
  assert.equal(phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true }), true)
  assert.equal(phone.adapter.save(phone.profile, { activation: phone.activation, isCurrent: () => true, dirtyUnits: null }).status, 'queued')
  assert.equal(Object.hasOwn(phone.state().queued, 'recordBatch'), false)
  phone.profile.videos['video-2'].watchLater = true
  phone.save({ videos: ['video-2'] })
  await phone.advance()
  hold.resolve()
  await until(() => phone.state().acceptedRevision === 3, 'Both queued changes follow the original typed request')
  assert.equal(commits(cloud).length, 2)
  assert.equal(commits(cloud)[1].name, 'commit_my_learner_profile_handoff')
  assert.equal(cloud.profile().videos['video-0'].favorite, true)
  assert.equal(cloud.profile().videos['video-1'].favorite, true)
  assert.equal(cloud.profile().videos['video-2'].watchLater, true)
})


test('a newer queued edit during a generation-receipt lookup prevents stale protected conversion', async t => {
  let quiet = false, inject = false, retained
  const cloud = server()
  let phone
  phone = await device(cloud, { quiet: () => quiet, rpc: (name, parameters) => {
    if (name === 'read_my_learner_profile_record_receipt' && inject) {
      inject = false
      phone.profile.videos['video-1'].watchLater = true
      const current = phone.state(), prepared = prepare(phone.profile)
      const pending = current.pending
      current.queued = { ...pending, operationId: crypto.randomUUID(),
        baseRevision: pending.revision, revision: pending.revision + 1,
        envelope: null, prepared, integrity: prepared.integrity, retryCount: 0, nextRetryAt: 0,
        recordBatch: createProfileRecordBatch(prepared.profile, (pending.envelope || pending.prepared).profile,
          { videos: ['video-1'] }, prepared.exportedAt),
        changes: { ...captureProfileChanges(fixture(), prepared.profile), baseRevision: 1 } }
      retained = JSON.stringify(current)
      phone.storage.setItem(KEY, retained)
    }
    return cloud.rpc(name, parameters)
  } })
  t.after(() => phone.retire())
  phone.profile.tinySwordsIsland.resources.wood = 3
  phone.save({ island: true })
  cloud.reset()
  quiet = true
  await phone.advance()
  await until(() => phone.adapter.getState().status === 'head-changed', 'Reset fences the pending island')
  inject = true
  const result = await phone.adapter.resolve({ authentication: { userId: OWNER }, connectivity: { status: 'online' },
    localProfile: { status: 'ready', ownerId: OWNER, profileId: PROFILE, generation: 1, revision: 1, profile: phone.profile },
    purpose: 'resolve-signed-in-profile' })
  assert.ok(retained, 'The lookup overlapped a newer durable queue write')
  assert.equal(result.status, 'recovering')
  assert.equal(phone.storage.getItem(KEY), retained, 'The stale resolver cannot erase the newer queued candidate')
  assert.equal(phone.state().queued.prepared.profile.videos['video-1'].watchLater, true)
  assert.equal(cloud.head().generation, 2)
  assert.equal(commits(cloud).length, 1)
  assert.equal(commits(cloud)[0].name, 'commit_my_learner_profile_records', 'Only the rejected typed request reached the reset head')
})

test('a mismatched head-changed request digest cannot authorize full-candidate conversion', async t => {
  const cloud = server(), phone = await device(cloud)
  const computer = await device(cloud, { rpc: async (name, parameters) => {
    const response = await cloud.rpc(name, parameters)
    if (name === 'commit_my_learner_profile_records' && response.data[0]?.status === 'head_changed') {
      response.data[0].request_sha256 = 'A'.repeat(43)
    }
    return response
  } })
  t.after(() => { phone.retire(); computer.retire() })
  phone.profile.tinySwordsIsland.resources.wood = 1
  phone.save({ island: true })
  await deliver(phone, cloud, 2)
  computer.profile.tinySwordsIsland.resources.wood = 2
  computer.save({ island: true })
  await computer.advance()
  await until(() => computer.adapter.getState().status === 'not-backed-up', 'A mismatched rejection cannot authorize response installation')
  assert.equal(computer.state().acceptedRevision, 1)
  assert.ok(computer.state().pending.recordBatch)
  const original = computer.state().pending.operationId
  const result = await computer.adapter.resolve({ authentication: { userId: OWNER }, connectivity: { status: 'online' },
    localProfile: { status: 'ready', ownerId: OWNER, profileId: PROFILE, generation: 1, revision: 1, profile: computer.profile },
    purpose: 'resolve-signed-in-profile' })
  assert.equal(result.status, 'recovering')
  assert.equal(computer.state().pending.operationId, original)
  assert.ok(computer.state().pending.recordBatch)
  assert.equal(commits(cloud).filter(call => call.name === 'commit_my_learner_profile').length, 0)
})


test('a reset protects a newer typed queue even when its predecessor used full-envelope delivery', async t => {
  const cloud = server(), hold = deferred()
  const phone = await device(cloud, { rpc: (name, parameters) => name === 'commit_my_learner_profile_handoff'
    ? hold.promise : cloud.rpc(name, parameters) })
  t.after(() => { phone.retire(); hold.resolve({ data: [], error: null }) })
  phone.profile.videos['video-0'].favorite = true
  assert.equal(phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true }), true)
  assert.equal(phone.adapter.save(phone.profile, { activation: phone.activation, isCurrent: () => true,
    dirtyUnits: null }).status, 'queued')
  await until(() => Boolean(phone.state().pending?.envelope), 'Full predecessor is finalized and in flight')
  phone.profile.videos['video-1'].watchLater = true
  assert.equal(phone.adapter.markDirty({ activation: phone.activation, isCurrent: () => true }), true)
  assert.equal(phone.adapter.save(phone.profile, { activation: phone.activation, isCurrent: () => true,
    dirtyUnits: { videos: ['video-1'] } }).status, 'queued')
  assert.ok(phone.state().queued.recordBatch, 'The unsent successor uses typed delivery')
  cloud.reset()
  phone.retire()
  const reopened = await device(cloud, { storage: phone.storage,
    local: { profile: phone.profile, revision: 1 }, expectedStatus: null })
  t.after(() => reopened.retire())
  assert.equal(reopened.result.status, 'conflicting')
  assert.ok(reopened.result.conflict?.id)
  assert.equal(reopened.result.conflict.device.profile.videos['video-0'].favorite, true)
  assert.equal(reopened.result.conflict.device.profile.videos['video-1'].watchLater, true)
  assert.equal(reopened.result.conflict.cloud.generation, 2)
  assert.equal(cloud.head().revision, 2)
})


test('continuous dirty study records coalesce without restarting the five-second delivery clock', async t => {
  const cloud = server(), phone = await device(cloud, { interval: 30000, recordInterval: 5000 })
  t.after(() => phone.retire())
  phone.profile.videos['video-0'].favorite = true
  phone.save({ videos: ['video-0'] })
  await deliver(phone, cloud, 2) // Fake time 500 ms; the next record is eligible at 5500 ms.
  for (let edit = 0; edit < 4; edit++) {
    phone.profile.videos['video-0'].resumeAtSeconds = 20 + edit
    phone.save({ videos: ['video-0'] })
    await phone.advance(1000)
    assert.equal(cloud.head().revision, 2)
  }
  phone.profile.videos['video-0'].resumeAtSeconds = 99
  phone.save({ videos: ['video-0'] })
  await phone.advance(999)
  assert.equal(cloud.head().revision, 2)
  await phone.advance(1)
  await until(() => phone.state().acceptedRevision === 3, 'The original five-second clock sends the latest coalesced value')
  assert.equal(cloud.profile().videos['video-0'].resumeAtSeconds, 99)
  assert.equal(commits(cloud).length, 2)
  assert.equal(commits(cloud)[1].name, 'commit_my_learner_profile_records')
})

test('unsupported full-envelope edits retain the slower thirty-second delivery interval', async t => {
  const cloud = server(), phone = await device(cloud, { interval: 30000, recordInterval: 5000 })
  t.after(() => phone.retire())
  phone.profile.config.locale = 'fr'
  phone.save(null)
  await deliver(phone, cloud, 2)
  phone.profile.config.weeklyGoalHours = 8
  phone.save(null)
  await phone.advance(29999)
  assert.equal(cloud.head().revision, 2)
  await phone.advance(1)
  await until(() => phone.state().acceptedRevision === 3, 'Full delivery waits for its existing slower interval')
  assert.equal(cloud.profile().config.weeklyGoalHours, 8)
  assert.deepEqual(commits(cloud).map(call => call.name), ['commit_my_learner_profile_handoff', 'commit_my_learner_profile_handoff'])
})
