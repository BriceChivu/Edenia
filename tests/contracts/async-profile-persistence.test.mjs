import assert from 'node:assert/strict'
import test from 'node:test'
import { createStateStore } from '../../src/state/store.js'
import { createLearnerProfileLocalPersistenceAdapter } from '../../src/state/learner-profile-local-adapter.js'

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
