import assert from 'node:assert/strict'
import test from 'node:test'
import { createStateStore } from '../../src/state/store.js'
import { createLearnerProfileLocalPersistenceAdapter } from '../../src/state/learner-profile-local-adapter.js'
import { createProfileRecoveryWorkspace } from '../../src/state/profile-recovery-workspace.js'
import { createAnimalCheckpointStamp } from '../../src/state/tiny-swords-animal-checkpoint.js'

function deferred() {
  let resolve
  const promise = new Promise(accept => { resolve = accept })
  return { promise, resolve }
}
function storage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
function stateStore(commit) {
  const events = []
  const state = { config: {}, videos: {}, anki: {} }
  const repository = { snapshot: () => structuredClone(state), readRaw: () => JSON.stringify(state), save: commit }
  return { events, store: createStateStore({
    storage: storage(), storageKey: 'profile', getRepository: () => repository,
    normalizeLoadedState: () => false, normalizeStateBeforeSave() {},
    createStateBackup() {}, pruneOldestStateBackup() { events.push('prune'); return true },
    saveConfigCookie() { events.push('cookie') }, syncPersistedStateToAnalytics() { events.push('analytics') },
    getLatestBackupState: () => null, loadConfigCookie: () => null, createDefaultStateFromConfig: () => null
  }) }
}

test('profile saves wait for durable acknowledgment before updating cookies and analytics', async () => {
  const transaction = deferred()
  const h = stateStore(() => transaction.promise)
  const saving = h.store.saveState({ config: {} })
  assert.deepEqual(h.events, [])
  transaction.resolve(true)
  assert.equal(await saving, true)
  assert.deepEqual(h.events, ['cookie', 'analytics'])
})

test('a failed IndexedDB save preserves backup protection and reports failure without success effects', async () => {
  const h = stateStore(async () => false)
  assert.equal(await h.store.saveState({ config: {} }), false)
  assert.equal((await h.store.saveImportedState({ config: {} })).persisted, false)
  assert.deepEqual(h.events, [])
})

for (const operation of ['save', 'replace']) {
  test(`an asynchronous ${operation} rechecks the activation fence before committing`, async () => {
    const local = storage()
    const transaction = deferred()
    let writes = 0
    const commit = async (_profile, _options, canPersist) => {
      await transaction.promise
      const persisted = canPersist()
      if (persisted) writes += 1
      return operation === 'replace' ? { persisted, error: null } : persisted
    }
    const adapter = createLearnerProfileLocalPersistenceAdapter({
      storage: local, accessStorageKey: 'access', accountlessProfileId: 'accountless',
      hasProfile: () => true, loadProfile: () => ({ config: {} }),
      saveProfile: commit, replaceProfile: commit
    })
    const first = { id: 'first', profileId: 'profile', ownerId: 'verified-owner', activatedAt: 1 }
    const second = { ...first, id: 'second', activatedAt: 2 }
    assert.equal(adapter.claimActivation(first), true)
    const saving = adapter[operation]({ config: {} }, {}, first)
    assert.equal(adapter.claimActivation(second), true)
    transaction.resolve()
    const result = await saving
    assert.equal(operation === 'replace' ? result.persisted : result, false)
    assert.equal(writes, 0)
    assert.equal(adapter.isActivationCurrent(second), true)
  })
}

test('failed asynchronous profile installation restores the previous access record', async () => {
  const local = storage()
  const before = JSON.stringify({ version: 1, profileId: 'profile', ownerId: 'verified-owner',
    activationId: null, activatedAt: 1, generation: 1, revision: 1 })
  local.setItem('access', before)
  const adapter = createLearnerProfileLocalPersistenceAdapter({
    storage: local, accessStorageKey: 'access', accountlessProfileId: 'accountless',
    hasProfile: () => true, loadProfile: () => ({ config: {} }), saveProfile: async () => false,
    replaceProfile: async () => ({ persisted: false, error: null })
  })
  assert.equal(await adapter.installSignedInProfile({ config: {} }, { generation: 1, installedAt: 2,
    ownerId: 'verified-owner', profileId: 'profile', revision: 2, replaceExisting: true }), false)
  assert.equal(local.getItem('access'), before)
})

test('an acknowledged animal checkpoint never mutates canonical progress and a retired owner cannot acknowledge it', async () => {
  const local = storage(), transaction = deferred()
  const profile = { config: {}, tinySwordsIsland: { version: 39, chickens: [[1, 2]], sheep: [] } }
  const before = structuredClone(profile)
  let hold = false
  const repository = {
    saveAnimalCheckpoint: async (_layout, _expected, { canPersist }) => {
      if (hold) await transaction.promise
      return canPersist()
    }
  }
  const adapter = createLearnerProfileLocalPersistenceAdapter({ storage: local,
    accessStorageKey: 'access', accountlessProfileId: 'accountless',
    loadProfile: () => profile, saveProfile: () => true, replaceProfile: () => true,
    getCheckpointRepository: () => repository })
  const first = { id: 'first', profileId: 'profile', ownerId: 'owner', activatedAt: 1 }
  const binding = { ownerId: 'owner', profileId: 'profile', generation: 1, revision: 7 }
  assert.equal(adapter.claimActivation(first), true)
  const layout = { ...profile.tinySwordsIsland, chickens: [[3, 4]] }
  assert.equal(await adapter.saveAnimalCheckpoint(profile, layout, JSON.stringify(profile.tinySwordsIsland), first, binding), true)
  assert.deepEqual(profile, before)
  hold = true
  const pending = adapter.saveAnimalCheckpoint(profile, layout, JSON.stringify(profile.tinySwordsIsland), first, binding)
  assert.equal(adapter.claimActivation({ ...first, id: 'second' }), true)
  transaction.resolve()
  assert.equal(await pending, false)
  assert.deepEqual(profile, before)
})

test('an accountless meaningful island save uses the same binding as its preceding animal checkpoint', async () => {
  const local = storage(), profile = { tinySwordsIsland: { chickens: [[1, 2]], sheep: [], resources: { wood: 0 } } }
  const binding = { ownerId: null, profileId: 'accountless:browser', generation: null, revision: null }
  let effective = structuredClone(profile.tinySwordsIsland)
  const repository = { readSyncBase: () => null, adoptSnapshot: () => {},
    async saveAnimalCheckpoint(layout, expected, options) {
      assert.deepEqual(options.binding, binding)
      assert.equal(JSON.stringify(effective), expected)
      effective = structuredClone(layout); return true
    },
    async saveIsland(layout, expected, options) {
      if (JSON.stringify(options.binding) !== JSON.stringify(binding) || JSON.stringify(effective) !== expected || !options.canPersist()) return false
      effective = structuredClone(layout); return true
    }
  }
  const adapter = createLearnerProfileLocalPersistenceAdapter({ storage: local, accessStorageKey: 'access',
    accountlessProfileId: 'accountless:browser', loadProfile: () => profile,
    saveProfile: () => true, replaceProfile: () => true, getCheckpointRepository: () => repository })
  const activation = { id: 'active', ownerId: null, profileId: 'accountless:browser', activatedAt: 1 }
  assert.equal(adapter.claimActivation(activation), true)
  const moved = { ...profile.tinySwordsIsland, chickens: [[3, 4]] }
  assert.equal(await adapter.saveAnimalCheckpoint(profile, moved, JSON.stringify(effective), activation, binding), true)
  const meaningful = { ...moved, resources: { wood: 1 } }
  assert.equal(await adapter.saveIsland(profile, meaningful, JSON.stringify(moved), activation, null), true)
  assert.deepEqual(profile.tinySwordsIsland, meaningful)
})

test('retrying a receipt without a captured pose completes metadata for an already rebound newer checkpoint', async () => {
  const local = storage(), profile = { tinySwordsIsland: { chickens: [[1, 2]], sheep: [] } }
  const binding = { ownerId: 'owner', profileId: 'profile', generation: 1, revision: 7 }
  const nextBinding = { ...binding, revision: 8 }
  local.setItem('access', JSON.stringify({ version: 1, ...binding, activationId: null, activatedAt: 1 }))
  let currentBinding = binding, rejectMetadata = false
  const set = local.setItem
  local.setItem = (key, value) => {
    if (rejectMetadata && key === 'access' && JSON.parse(value).revision === 8) {
      rejectMetadata = false; throw new Error('Synthetic metadata write failure')
    }
    set(key, value)
  }
  const repository = {
    readAnimalCheckpoint: requested => JSON.stringify(requested) === JSON.stringify(currentBinding) ? { stamp: { binding: currentBinding } } : null,
    acknowledgeAnimalCheckpoint: async () => { currentBinding = nextBinding; return true },
    readIslandState: () => ({ tinySwordsIsland: structuredClone(profile.tinySwordsIsland) })
  }
  const adapter = createLearnerProfileLocalPersistenceAdapter({ storage: local, accessStorageKey: 'access',
    accountlessProfileId: 'accountless', loadProfile: () => profile, saveProfile: () => true,
    replaceProfile: () => true, getCheckpointRepository: () => repository })
  const activation = { id: 'active', ownerId: 'owner', profileId: 'profile', activatedAt: 1 }
  assert.equal(adapter.claimActivation(activation), true)
  const context = { stamp: null, layout: profile.tinySwordsIsland, binding, nextBinding }
  rejectMetadata = true
  assert.equal(await adapter.acknowledgeAnimalCheckpoint(profile, context, activation), false)
  assert.equal(JSON.parse(local.getItem('access')).revision, 7)
  assert.equal(await adapter.acknowledgeAnimalCheckpoint(profile, context, activation), true)
  assert.equal(JSON.parse(local.getItem('access')).revision, 8)
})

test('an older animal receipt waits for the real recovery workspace journal and preserves its newer full profile', async () => {
  const original = storage(), binding = { ownerId: 'owner', profileId: 'profile', generation: 1, revision: 7 }
  const nextBinding = { ...binding, revision: 8 }, transaction = deferred()
  const island = { version: 39, chickens: [[1, 2]], sheep: [], resources: { wood: 0 } }
  const latest = { videos: { lesson: { favorite: true } }, tinySwordsIsland: { ...island, chickens: [[9, 10]] } }
  original.setItem('profile', JSON.stringify(latest))
  original.setItem('access', JSON.stringify({ version: 1, ...binding, activationId: null, activatedAt: 1 }))
  let journalRaw = null, hold = false, heldWrites = 0
  const journal = { read: async () => ({ raw: journalRaw, candidates: [] }),
    async save(raw, _base, { canPersist }) {
      if (hold) { heldWrites++; await transaction.promise }
      if (!canPersist()) return { cancelled: true }
      journalRaw = raw
      return { saved: true, raw }
    } }
  const set = original.setItem
  original.setItem = (key, value) => {
    if (key === 'profile_recovery_workspace_v1') throw new DOMException('Synthetic quota', 'QuotaExceededError')
    set(key, value)
  }
  const options = { storageKey: 'profile', accessKey: 'access', keys: ['access'], journal,
    getPrimary: () => original, capture: () => ({ profile: original.getItem('profile') }) }
  const workspace = createProfileRecoveryWorkspace(options)
  workspace.activate()
  assert.equal(await workspace.flush(), true)
  const activeProfile = structuredClone(latest)
  const adapter = createLearnerProfileLocalPersistenceAdapter({ storage: workspace.storage,
    accessStorageKey: 'access', accountlessProfileId: 'accountless', loadProfile: () => workspace.repository.snapshot(),
    saveProfile: () => true, replaceProfile: () => true, getCheckpointRepository: () => workspace.repository })
  const activation = { id: 'active', ownerId: binding.ownerId, profileId: binding.profileId, activatedAt: 1 }
  assert.equal(adapter.claimActivation(activation), true)
  assert.equal(await workspace.flush(), true)
  const sent = { ...island, chickens: [[3, 4]] }
  hold = true
  let settled = false
  const acknowledgement = adapter.acknowledgeAnimalCheckpoint(activeProfile, {
    stamp: createAnimalCheckpointStamp(sent, binding, crypto.randomUUID()), layout: sent, binding, nextBinding
  }, activation).then(value => { settled = true; return value })
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(heldWrites > 0)
  assert.equal(settled, false, 'The cloud request cannot retire before the current full body is durable')
  transaction.resolve()
  assert.equal(await acknowledgement, true)
  assert.equal(await workspace.flush(), true)
  assert.deepEqual(activeProfile, latest)
  assert.deepEqual(workspace.repository.snapshot(), latest)
  assert.equal(JSON.parse(workspace.storage.getItem('access')).revision, 8)

  const reopened = createProfileRecoveryWorkspace(options)
  await reopened.initialize()
  reopened.activate()
  assert.deepEqual(reopened.repository.snapshot(), latest)
  assert.equal(JSON.parse(reopened.storage.getItem('access')).revision, 8)
})

test('a retired owner cannot acknowledge its animal request through the recovery workspace', async () => {
  const original = storage(), transaction = deferred()
  const binding = { ownerId: 'owner', profileId: 'profile', generation: 1, revision: 7 }
  const profile = { tinySwordsIsland: { version: 39, chickens: [[9, 10]], sheep: [] } }
  original.setItem('profile', JSON.stringify(profile))
  original.setItem('access', JSON.stringify({ version: 1, ...binding, activationId: null, activatedAt: 1 }))
  const workspace = createProfileRecoveryWorkspace({ storageKey: 'profile', accessKey: 'access', keys: ['access'],
    getPrimary: () => original, capture: () => ({ profile: original.getItem('profile') }) })
  workspace.activate()
  const repository = { ...workspace.repository, async acknowledgeAnimalCheckpoint(options) {
    await transaction.promise
    return workspace.repository.acknowledgeAnimalCheckpoint(options)
  } }
  const adapter = createLearnerProfileLocalPersistenceAdapter({ storage: workspace.storage,
    accessStorageKey: 'access', accountlessProfileId: 'accountless', loadProfile: () => workspace.repository.snapshot(),
    saveProfile: () => true, replaceProfile: () => true, getCheckpointRepository: () => repository })
  const activation = { id: 'active', ownerId: binding.ownerId, profileId: binding.profileId, activatedAt: 1 }
  assert.equal(adapter.claimActivation(activation), true)
  const acknowledgement = adapter.acknowledgeAnimalCheckpoint(profile, {
    stamp: createAnimalCheckpointStamp(profile.tinySwordsIsland, binding, crypto.randomUUID()),
    layout: profile.tinySwordsIsland, binding, nextBinding: { ...binding, revision: 8 }
  }, activation)
  assert.equal(adapter.claimActivation({ ...activation, id: 'replacement', ownerId: 'other-owner' }), true)
  transaction.resolve()
  assert.equal(await acknowledgement, false)
  assert.deepEqual(workspace.repository.snapshot(), profile)
  assert.equal(JSON.parse(workspace.storage.getItem('access')).ownerId, 'other-owner')
  assert.equal(JSON.parse(workspace.storage.getItem('access')).revision, 7)
})

for (const scenario of ['newer-pose', 'exact-reset', 'meaningful-target', 'wrong-owner', 'wrong-generation']) {
test(`cold own-receipt reconciliation through the recovery workspace preserves only a valid local pose (${scenario})`, async () => {
  const original = storage(), binding = { ownerId: 'owner', profileId: 'profile', generation: 1, revision: 7 }
  const nextBinding = { ...binding, revision: 8 }
  const island = { version: 39, chickens: [[1, 2]], sheep: [], resources: { wood: 0 },
    sync_semantics: { version: 3, ambient_arrays: ['chickens', 'sheep'], sha256: 'a'.repeat(64) } }
  const local = { videos: { lesson: { favorite: false, watchLater: true } },
    tinySwordsIsland: { ...island, chickens: scenario === 'exact-reset' ? [[1, 2]] : [[9, 10]] } }
  original.setItem('profile', JSON.stringify(local))
  original.setItem('access', JSON.stringify({ version: 1, ...binding, activationId: null, activatedAt: 1 }))
  const options = { storageKey: 'profile', accessKey: 'access', keys: ['access'],
    getPrimary: () => original, capture: () => ({ profile: original.getItem('profile') }) }
  const workspace = createProfileRecoveryWorkspace(options)
  workspace.activate()
  if (scenario === 'exact-reset') assert.equal(await workspace.repository.save(workspace.repository.snapshot(), { replaceIsland: true }), true)
  const target = { videos: { lesson: { favorite: true, watchLater: true } }, tinySwordsIsland: { ...island, chickens: [[3, 4]] } }
  if (scenario === 'meaningful-target') target.tinySwordsIsland.resources = { wood: 1 }
  const acceptedIsland = structuredClone(target.tinySwordsIsland)
  const animalCheckpoint = { binding, nextBinding,
    acknowledgedStamp: createAnimalCheckpointStamp(target.tinySwordsIsland, binding, crypto.randomUUID()) }
  if (scenario === 'wrong-owner') animalCheckpoint.nextBinding = { ...nextBinding, ownerId: 'other-owner' }
  if (scenario === 'wrong-generation') animalCheckpoint.nextBinding = { ...nextBinding, generation: 2 }
  const adapter = createLearnerProfileLocalPersistenceAdapter({ storage: workspace.storage,
    accessStorageKey: 'access', accountlessProfileId: 'accountless', loadProfile: () => workspace.repository.snapshot(),
    saveProfile: () => true, getCheckpointRepository: () => workspace.repository,
    replaceProfile: async (profile, settings, canPersist) => ({ persisted: await workspace.repository.save(profile,
      { ...settings, replace: true, canPersist }), error: null }) })
  const valid = !scenario.startsWith('wrong-')
  assert.equal(await adapter.reconcileSignedInProfile(target, { ...nextBinding, animalCheckpoint }), valid)
  const expected = valid ? { videos: { lesson: { favorite: true, watchLater: true } },
    tinySwordsIsland: scenario === 'meaningful-target' ? acceptedIsland : local.tinySwordsIsland } : local
  assert.deepEqual(workspace.repository.snapshot(), expected)
  assert.equal(JSON.parse(workspace.storage.getItem('access')).revision, valid ? 8 : 7)
  const reopened = createProfileRecoveryWorkspace(options)
  reopened.activate()
  assert.deepEqual(reopened.repository.snapshot(), expected)
})
}
