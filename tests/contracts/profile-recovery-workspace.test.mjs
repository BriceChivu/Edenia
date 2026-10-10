import test from 'node:test'
import assert from 'node:assert/strict'
import { createProfileRecoveryWorkspace } from '../../src/state/profile-recovery-workspace.js'
import { createStateStore } from '../../src/state/store.js'
function fixture({ denied = false } = {}) {
  const values = new Map([['profile', JSON.stringify({ watch: 1, language: 'fr' })], ['access', '{"ownerId":null}'], ['auth', 'SECRET']])
  const primary = { getItem: key => values.get(key) ?? null, setItem(key, value) { if (denied) throw new DOMException('', 'SecurityError'); values.set(key, value) }, removeItem: key => values.delete(key) }
  const sessionValues = new Map()
  const secondary = { getItem: key => sessionValues.get(key) ?? null, setItem: (key, value) => sessionValues.set(key, value), removeItem: key => sessionValues.delete(key) }
  const options = { storageKey: 'profile', accessKey: 'access', keys: ['access','sync'], getPrimary: () => primary, getSecondary: () => secondary, capture: () => ({ profile: primary.getItem('profile') }) }
  return { values, sessionValues, options, workspace: createProfileRecoveryWorkspace(options) }
}
test('a backup failure transfers the current edit onto the acknowledged recovery baseline', () => {
  const f = fixture()
  const store = createStateStore({ storage: f.workspace.storage, storageKey: 'profile',
    getRepository: () => f.workspace.isActive() ? f.workspace.repository : null,
    normalizeLoadedState: () => false, normalizeStateBeforeSave: () => {},
    createStateBackup: () => f.workspace.activate(), pruneOldestStateBackup: () => false,
    saveConfigCookie: () => {}, syncPersistedStateToAnalytics: () => {},
    getLatestBackupState: () => null, loadConfigCookie: () => null, createDefaultStateFromConfig: () => ({}) })
  const state = store.loadState()
  state.watch = 2
  assert.equal(store.saveState(state), true)
  assert.equal(f.workspace.repository.snapshot().watch, 2)
  assert.equal(JSON.parse(f.values.get('profile')).watch, 1)
})
test('isolates failed writes, keeps auth/original and resumes recovery after reload', () => {
  const f = fixture({ denied: true })
  f.workspace.storage.setItem('profile', JSON.stringify({ watch: 2, language: 'fr' }))
  assert.equal(f.workspace.getTier(), 'session')
  assert.equal(JSON.parse(f.values.get('profile')).watch, 1)
  assert.equal(f.workspace.storage.getItem('auth'), 'SECRET')
  const reloaded = createProfileRecoveryWorkspace(f.options)
  assert.equal(reloaded.hasPending(), true)
  reloaded.activate()
  assert.equal(JSON.parse(reloaded.storage.getItem('profile')).watch, 2)
})
test('merges independent progress and requires a choice for competing edits', () => {
  const { workspace } = fixture()
  workspace.activate()
  workspace.storage.setItem('profile', JSON.stringify({ watch: 2, language: 'fr' }))
  assert.deepEqual(workspace.merge({ watch: 1, language: 'es' }), { watch: 2, language: 'es' })
  assert.equal(workspace.merge({ watch: 3, language: 'fr' }), null)
  const epoch = workspace.getEpoch()
  workspace.storage.setItem('sync', 'new work')
  assert.equal(workspace.matches(epoch), false)
})
test('unreadable originals preserve cloud operations without claiming a made-up owner', () => {
  const f = fixture()
  f.values.set('sync','IMMUTABLE CLOUD OPERATION')
  const workspace = createProfileRecoveryWorkspace({ ...f.options, capture: () => ({ profile: null, preserveKeys: ['sync'] }) })
  workspace.activate()
  assert.equal(workspace.storage.getItem('access'), null)
  assert.equal(workspace.storage.getItem('sync'), 'IMMUTABLE CLOUD OPERATION')
  workspace.storage.setItem('profile', '{"watch":2}')
  assert.equal(workspace.merge({ watch: 1 }), null)
  assert.equal(f.values.get('access'), '{"ownerId":null}')
})
test('archives both versions durably before returning to the original store', () => {
  const f = fixture()
  f.workspace.activate()
  f.workspace.storage.setItem('profile','{"watch":2}')
  assert.equal(f.workspace.archive({ watch: 1 }), true)
  assert.equal(f.workspace.complete(), true)
  assert.equal(createProfileRecoveryWorkspace(f.options).hasPending(), false)
  const archive = JSON.parse(f.values.get('profile_recovery_workspace_v1'))
  assert.equal(JSON.parse(archive.originalProfile).watch, 1)
  assert.equal(JSON.parse(archive.values.profile).watch, 2)
})

test('a newer session fallback wins over an older local copy after reload', () => {
  const f = fixture()
  f.workspace.activate()
  const oldLocal = f.values.get('profile_recovery_workspace_v1')
  const fresh = JSON.parse(oldLocal)
  fresh.sequence++
  fresh.values.profile = '{"watch":8}'
  f.sessionValues.set('profile_recovery_workspace_v1', JSON.stringify(fresh))
  const loaded = createProfileRecoveryWorkspace(f.options)
  loaded.activate()
  assert.equal(JSON.parse(loaded.storage.getItem('profile')).watch, 8)
})
test('a concurrent recovery writer invalidates the promotion fence', () => {
  const f = fixture()
  f.workspace.activate()
  const epoch = f.workspace.getEpoch()
  const newer = JSON.parse(f.values.get('profile_recovery_workspace_v1'))
  newer.sequence++
  newer.values.profile = '{"watch":99}'
  f.values.set('profile_recovery_workspace_v1', JSON.stringify(newer))
  assert.equal(f.workspace.matches(epoch), false)
})

test('interrupted promotion keeps an acknowledged baseline and rejects other ownership changes', () => {
  const f = fixture()
  f.workspace.activate()
  f.workspace.storage.setItem('access', '{"ownerId":null,"activationId":"this-tab"}')
  f.workspace.storage.setItem('profile', '{"watch":2,"language":"fr"}')
  assert.equal(f.workspace.markPromotion({ watch: 2, language: 'fr' }), true)
  const reopened = createProfileRecoveryWorkspace(f.options)
  reopened.activate()
  assert.equal(reopened.acceptsOriginalMetadata('access','{"ownerId":null}'), true)
  assert.equal(reopened.acceptsOriginalMetadata('access','{"ownerId":null,"activationId":"this-tab"}'), true)
  assert.equal(reopened.acceptsOriginalMetadata('access','{"ownerId":"different-owner"}'), false)
  assert.equal(reopened.acceptsOriginalProfile('{"ownerId":null,"activationId":"this-tab"}', '{"watch":2,"language":"fr"}'), true)
  assert.deepEqual(reopened.merge({ watch: 2, language: 'fr' }), { watch: 2, language: 'fr' })
})

test('an intentional replacement is never automatically mixed with intervening old progress', () => {
  const f = fixture()
  f.workspace.activate()
  f.workspace.storage.recordReplacement()
  f.workspace.storage.setItem('profile','{"watch":0,"language":"es"}')
  assert.deepEqual(f.workspace.merge({ watch: 1, language: 'fr' }), { watch: 0, language: 'es' })
  assert.equal(f.workspace.merge({ watch: 9, language: 'fr' }), null)
})

test('recovery repositories rebase independent tab changes and reject competing progress', () => {
  const f = fixture()
  let conflict
  const first = createProfileRecoveryWorkspace({ ...f.options, onConflict: value => { conflict = value } })
  first.activate()
  const old = first.repository.snapshot()
  const second = createProfileRecoveryWorkspace({ ...f.options, onConflict: value => { conflict = value } })
  second.activate()
  const next = second.repository.snapshot()
  next.language = 'es'
  assert.equal(second.repository.save(next), true)
  old.watch = 7
  assert.equal(first.repository.save(old), true)
  assert.deepEqual(first.repository.snapshot(), { watch: 7, language: 'es' })
  const stale = second.repository.snapshot()
  const newer = first.repository.snapshot()
  newer.watch = 9
  first.repository.save(newer)
  stale.watch = 8
  assert.equal(second.repository.save(stale), false)
  assert.equal(first.repository.snapshot().watch, 9)
  assert.equal(JSON.parse(conflict.desiredRaw).watch, 8)
  assert.equal(JSON.parse(conflict.currentRaw).watch, 9)
})
test('external recovery ownership changes invalidate a captured activation before a save', () => {
  const f = fixture()
  f.workspace.activate()
  const before = f.workspace.repository.snapshot()
  const other = createProfileRecoveryWorkspace(f.options)
  other.activate()
  other.storage.setItem('access','{"ownerId":"another-owner"}')
  assert.equal(f.workspace.repository.save(before, { canPersist: () => f.workspace.storage.getItem('access') === '{"ownerId":null}' }), false)
  assert.equal(f.workspace.storage.getItem('access'), '{"ownerId":"another-owner"}')
})

test('profile storage adapters recognize their native storage area through the facade', () => {
  const f = fixture()
  assert.equal(f.workspace.storage.acceptsStorageArea(f.options.getPrimary()), true)
  assert.equal(f.workspace.storage.acceptsStorageArea({}), false)
})

test('normal ownership and verification storage events survive the facade', async () => {
  const { createLearnerProfileLocalPersistenceAdapter } = await import('../../src/state/learner-profile-local-adapter.js')
  const { createLearnerProfileOwnerVerificationStore } = await import('../../src/state/learner-profile-owner-verification.js')
  const f = fixture()
  const target = new EventTarget()
  const local = createLearnerProfileLocalPersistenceAdapter({ accessStorageKey: 'access', accountlessProfileId: 'accountless',
    eventTarget: target, storage: f.workspace.storage, loadProfile: () => null })
  const owner = createLearnerProfileOwnerVerificationStore({ eventTarget: target, storage: f.workspace.storage, storageKey: 'access' })
  let observed = 0
  local.subscribe(() => observed++)
  owner.subscribe(() => observed++)
  const event = new Event('storage')
  Object.assign(event, { key: 'access', storageArea: f.options.getPrimary() })
  target.dispatchEvent(event)
  assert.equal(observed, 2)
  const foreign = new Event('storage')
  Object.assign(foreign, { key: 'access', storageArea: {} })
  target.dispatchEvent(foreign)
  assert.equal(observed, 2)
})

test('automatic reconciliation never crosses an original profile replacement', () => {
  const f = fixture()
  f.workspace.activate({ profile: f.values.get('profile'), replacementRevision: 3 })
  f.workspace.storage.setItem('profile','{"watch":2,"language":"fr"}')
  assert.deepEqual(f.workspace.merge({ watch: 1, language: 'es' }, { replacementRevision: 3 }), { watch: 2, language: 'es' })
  assert.equal(f.workspace.merge({ watch: 1, language: 'es' }, { replacementRevision: 4 }), null)
})

for (const side of ['recent', 'saved']) test(`choosing ${side} recovery progress retains the actual unchosen edit`, () => {
  const f = fixture()
  let conflict
  const first = createProfileRecoveryWorkspace({ ...f.options, onConflict: value => { conflict = value } })
  first.activate()
  const stale = first.repository.snapshot()
  const second = createProfileRecoveryWorkspace(f.options)
  second.activate()
  const newer = second.repository.snapshot()
  newer.watch = 3
  assert.equal(second.repository.save(newer), true)
  stale.watch = 2
  assert.equal(first.repository.save(stale), false)
  const recent = JSON.parse(conflict.desiredRaw)
  const saved = JSON.parse(conflict.currentRaw)
  assert.equal(first.archive(saved), true)
  first.acceptChoice(side === 'recent' ? recent : saved, saved,
    { preserveBaseline: true, unchosen: side === 'recent' ? saved : recent })
  const retained = JSON.parse(f.values.get('profile_recovery_workspace_v1'))
  assert.equal(JSON.parse(retained.values.profile).watch, side === 'recent' ? 2 : 3)
  assert.equal(JSON.parse(retained.unchosenProfile).watch, side === 'recent' ? 3 : 2)
})

function memoryPair() {
  const f = fixture()
  let denied = false
  const primary = f.options.getPrimary()
  const set = primary.setItem
  primary.setItem = (key, value) => { if (denied) throw new DOMException('', 'SecurityError'); set(key, value) }
  const secondary = { getItem: () => null, setItem() { throw new DOMException('', 'SecurityError') }, removeItem() {} }
  const conflicts = []
  const options = { ...f.options, getSecondary: () => secondary, onConflict: value => conflicts.push(value) }
  const first = createProfileRecoveryWorkspace(options)
  first.activate()
  denied = true
  const edit = first.repository.snapshot()
  edit.watch = 7
  first.repository.save(edit)
  denied = false
  const second = createProfileRecoveryWorkspace(options)
  second.activate()
  return { ...f, first, second, options, conflicts, deny: value => { denied = value } }
}
test('memory progress rebases against a peer before writing and follows a later peer reversion', () => {
  const f = memoryPair()
  const peer = f.second.repository.snapshot()
  peer.language = 'es'
  f.second.repository.save(peer)
  const recent = f.first.repository.snapshot()
  assert.deepEqual(recent, { watch: 7, language: 'es' })
  recent.watch = 8
  f.first.repository.save(recent)
  const reverted = f.second.repository.snapshot()
  reverted.language = 'fr'
  f.second.repository.save(reverted)
  assert.deepEqual(f.first.repository.snapshot(), { watch: 8, language: 'fr' })
})
test('a memory promotion fence detects a durable peer before acknowledging progress', () => {
  const f = memoryPair()
  const epoch = f.first.getEpoch()
  const peer = f.second.repository.snapshot()
  peer.language = 'es'
  f.second.repository.save(peer)
  assert.equal(f.first.matches(epoch), false)
})
test('a conflicting desired save survives closing and reopening the recovery workspace', async () => {
  const f = fixture()
  f.workspace.activate()
  const stale = f.workspace.repository.snapshot()
  const other = createProfileRecoveryWorkspace(f.options)
  other.activate()
  const peer = other.repository.snapshot()
  peer.watch = 9
  other.repository.save(peer)
  stale.watch = 8
  assert.equal(f.workspace.repository.save(stale), false)
  let resumed
  const reopened = createProfileRecoveryWorkspace({ ...f.options, onConflict: value => { resumed = value } })
  reopened.activate()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(JSON.parse(resumed.desiredRaw).watch, 8)
  assert.equal(JSON.parse(resumed.currentRaw).watch, 9)
})
test('memory recovery never merges across a peer ownership or reset fence and retains the old copy', () => {
  for (const change of ['owner', 'reset']) {
    const f = memoryPair()
    if (change === 'owner') f.second.storage.setItem('access', '{"ownerId":"new-owner"}')
    else { f.second.storage.recordReplacement(); f.second.storage.setItem('profile', '{"watch":0,"language":"es"}') }
    const peer = f.second.repository.snapshot()
    assert.deepEqual(f.first.repository.snapshot(), peer)
    const saved = JSON.parse(f.values.get('profile_recovery_workspace_v1'))
    assert.equal(JSON.parse(saved.protectedWorkspaces.at(-1).values.profile).watch, 7)
  }
})
test('a peer retirement does not discard memory progress that was never acknowledged', () => {
  const f = memoryPair()
  const peer = f.second.repository.snapshot()
  peer.language = 'es'
  f.second.repository.save(peer)
  f.second.markPromotion(peer, { replacementRevision: 0 })
  f.second.complete()
  assert.deepEqual(f.first.repository.snapshot(), { watch: 7, language: 'es' })
  assert.equal(f.first.isActive(), true)
})

test('a workspace opened before a peer save refreshes before activation', () => {
  const f = fixture()
  const waiting = createProfileRecoveryWorkspace(f.options)
  f.workspace.activate()
  const edit = f.workspace.repository.snapshot()
  edit.watch = 9
  f.workspace.repository.save(edit)
  waiting.activate()
  assert.equal(waiting.repository.snapshot().watch, 9)
})
for (const chooseSaved of [false, true]) test(`memory conflicts retain both copies after reload and choosing ${chooseSaved ? 'saved' : 'recent'}`, async () => {
  const f = memoryPair()
  const peer = f.second.repository.snapshot()
  peer.watch = 9
  f.second.repository.save(peer)
  f.first.repository.snapshot()
  const reopened = createProfileRecoveryWorkspace(f.options)
  reopened.activate()
  await new Promise(resolve => setImmediate(resolve))
  const conflict = f.conflicts.at(-1)
  assert.equal(JSON.parse(conflict.desiredRaw).watch, 7)
  assert.equal(JSON.parse(conflict.currentRaw).watch, 9)
  const recent = JSON.parse(conflict.desiredRaw), saved = JSON.parse(conflict.currentRaw)
  reopened.acceptChoice(chooseSaved ? saved : recent, saved, { preserveBaseline: true,
    conflictId: conflict.id, unchosen: chooseSaved ? recent : saved })
  assert.equal(reopened.repository.snapshot().watch, chooseSaved ? 9 : 7)
  const retained = JSON.parse(f.values.get('profile_recovery_workspace_v1'))
  assert.equal(JSON.parse(retained.unchosenProfile).watch, chooseSaved ? 7 : 9)
  assert.equal(retained.pendingConflicts.length, 0)
})
test('memory recovery keeps a new peer edit while both durable writers are still denied', () => {
  const f = memoryPair()
  const peer = f.second.repository.snapshot()
  peer.language = 'es'
  f.second.repository.save(peer)
  f.deny(true)
  assert.deepEqual(f.first.repository.snapshot(), { watch: 7, language: 'es' })
  assert.equal(f.first.getTier(), 'memory')
  f.deny(false)
  const edit = f.first.repository.snapshot()
  edit.watch = 8
  f.first.repository.save(edit)
  assert.deepEqual(f.second.repository.snapshot(), { watch: 8, language: 'es' })
})
test('pending choices remain fenced when another tab changes the owner', async () => {
  const f = memoryPair()
  const peer = f.second.repository.snapshot()
  peer.watch = 9
  f.second.repository.save(peer)
  f.first.repository.snapshot()
  f.second.storage.setItem('access', '{"ownerId":"new-owner"}')
  const resumed = []
  const reopened = createProfileRecoveryWorkspace({ ...f.options, onConflict: value => resumed.push(value) })
  reopened.activate()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(resumed.length, 0)
  assert.equal(JSON.parse(reopened.storage.getItem('access')).ownerId, 'new-owner')
  assert.equal(JSON.parse(f.values.get('profile_recovery_workspace_v1')).pendingConflicts.length, 1)
})

test('pending choice notifications follow bookkeeping and clear after a peer resolves it', async () => {
  const f = fixture()
  const notices = [], cleared = []
  const first = createProfileRecoveryWorkspace({ ...f.options,
    onConflict: value => notices.push(value), onConflictCleared: id => cleared.push(id) })
  first.activate()
  const stale = first.repository.snapshot()
  const second = createProfileRecoveryWorkspace(f.options)
  second.activate()
  const peer = second.repository.snapshot()
  peer.watch = 9
  second.repository.save(peer)
  stale.watch = 8
  first.repository.save(stale)
  first.storage.setItem('sync', 'startup bookkeeping')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(notices.at(-1).epoch, first.getEpoch())
  const conflict = notices.at(-1)
  second.repository.snapshot()
  second.acceptChoice(JSON.parse(conflict.currentRaw), JSON.parse(conflict.currentRaw),
    { preserveBaseline: true, conflictId: conflict.id, unchosen: JSON.parse(conflict.desiredRaw) })
  first.repository.snapshot()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(cleared, [conflict.id])
})

test('two independent intentional replacements never share a memory merge fence', () => {
  const f = memoryPair()
  f.deny(true)
  const first = f.first.repository.snapshot()
  first.watch = 0
  f.first.repository.save(first, { replace: true })
  f.deny(false)
  const second = f.second.repository.snapshot()
  second.language = 'es'
  f.second.repository.save(second, { replace: true })
  assert.deepEqual(f.first.repository.snapshot(), { watch: 1, language: 'es' })
  const retained = JSON.parse(f.values.get('profile_recovery_workspace_v1'))
  assert.equal(JSON.parse(retained.protectedWorkspaces.at(-1).values.profile).watch, 0)
})

test('memory recovery notices a changed shared local copy even when its old session sequence is higher', () => {
  const f = fixture({ denied: true })
  f.workspace.activate()
  for (let i = 0; i < 10; i++) f.workspace.storage.setItem('sync', String(i))
  const set = f.options.getSecondary().setItem
  let sessionDenied = true
  f.options.getSecondary().setItem = (key, value) => { if (sessionDenied) throw new DOMException('', 'SecurityError'); set(key, value) }
  const edit = f.workspace.repository.snapshot()
  edit.watch = 7
  f.workspace.repository.save(edit)
  assert.equal(f.workspace.getTier(), 'memory')
  const peer = { version: 1, status: 'active', sequence: 2,
    baseline: '{"watch":1,"language":"fr"}', originalAccess: '{"ownerId":null}', originalReplacementRevision: null,
    originalValues: { profile: '{"watch":1,"language":"fr"}', access: '{"ownerId":null}', sync: null },
    values: { profile: '{"watch":1,"language":"es"}', access: '{"ownerId":null}', sync: null } }
  f.values.set('profile_recovery_workspace_v1', JSON.stringify(peer))
  assert.deepEqual(f.workspace.repository.snapshot(), { watch: 7, language: 'es' })
})

test('a later recovery episode retains previously protected unchosen progress', () => {
  const f = fixture()
  f.workspace.activate()
  f.workspace.acceptChoice({ watch: 2, language: 'fr' }, { watch: 1, language: 'fr' },
    { unchosen: { watch: 9, language: 'fr' } })
  f.workspace.markPromotion({ watch: 2, language: 'fr' })
  f.workspace.complete()
  f.values.set('profile', '{"watch":2,"language":"fr"}')
  const next = createProfileRecoveryWorkspace(f.options)
  next.activate()
  const saved = JSON.parse(f.values.get('profile_recovery_workspace_v1'))
  assert.equal(JSON.parse(saved.protectedWorkspaces.at(-1).unchosenProfile).watch, 9)
})
test('a newer archived fallback prevents replaying an older active copy after reload', () => {
  const f = fixture()
  f.workspace.activate()
  const old = f.values.get('profile_recovery_workspace_v1')
  f.workspace.markPromotion({ watch: 2, language: 'fr' })
  f.workspace.complete()
  const newest = f.values.get('profile_recovery_workspace_v1')
  f.values.set('profile_recovery_workspace_v1', old)
  f.sessionValues.set('profile_recovery_workspace_v1', newest)
  const reopened = createProfileRecoveryWorkspace(f.options)
  assert.equal(reopened.hasPending(), false)
})

test('a peer ownership change after the last caller check cannot receive the old owner edit', () => {
  const f = fixture()
  f.workspace.activate()
  const other = createProfileRecoveryWorkspace(f.options)
  other.activate()
  const edit = f.workspace.repository.snapshot()
  edit.watch = 7
  let checks = 0
  const saved = f.workspace.repository.save(edit, { canPersist: () => {
    const observed = f.workspace.storage.getItem('access')
    if (++checks === 2) other.storage.setItem('access', '{"ownerId":"new-owner"}')
    return observed === '{"ownerId":null}'
  } })
  assert.equal(saved, false)
  assert.equal(other.repository.snapshot().watch, 1)
  assert.equal(JSON.parse(other.storage.getItem('access')).ownerId, 'new-owner')
})

test('a peer ownership change during the final check keeps the edit in memory without overwriting its workspace', () => {
  const f = fixture()
  f.workspace.activate()
  const other = createProfileRecoveryWorkspace(f.options)
  other.activate()
  const edit = f.workspace.repository.snapshot()
  edit.watch = 7
  let checks = 0
  assert.equal(f.workspace.repository.save(edit, { canPersist: () => {
    const observed = f.workspace.storage.getItem('access')
    if (++checks === 3) other.storage.setItem('access', '{"ownerId":"new-owner"}')
    return observed === '{"ownerId":null}'
  } }), true)
  assert.equal(JSON.parse(f.values.get('profile_recovery_workspace_v1')).values.access, '{"ownerId":"new-owner"}')
  assert.equal(f.workspace.getTier(), 'memory')
  assert.equal(f.workspace.repository.snapshot().watch, 1)
  assert.equal(JSON.parse(JSON.parse(f.values.get('profile_recovery_workspace_v1')).protectedWorkspaces.at(-1).values.profile).watch, 7)
})

test('a known original replacement revision still fences memory from a promoted peer', () => {
  const f = memoryPair()
  const peer = f.second.repository.snapshot()
  peer.language = 'es'
  f.second.repository.save(peer)
  f.second.markPromotion(peer, { replacementRevision: 1 })
  f.second.complete()
  assert.deepEqual(f.first.repository.snapshot(), { watch: 1, language: 'es' })
  assert.equal(JSON.parse(JSON.parse(f.values.get('profile_recovery_workspace_v1')).protectedWorkspaces.at(-1).values.profile).watch, 7)
})

test('refreshing an original comparison retains previously shown saved versions', () => {
  const f = fixture()
  f.workspace.activate()
  f.workspace.archive({ watch: 9, language: 'fr' })
  f.workspace.archive({ watch: 12, language: 'fr' })
  f.workspace.archive({ watch: 12, language: 'fr' })
  const saved = JSON.parse(f.values.get('profile_recovery_workspace_v1'))
  assert.equal(JSON.parse(saved.originalProfile).watch, 12)
  assert.deepEqual(saved.protectedOriginalProfiles.map(raw => JSON.parse(raw).watch), [9])
})

test('a deferred choice survives reload and requires a new comparison for an intervening saved version', () => {
  const f = fixture()
  f.workspace.activate()
  f.workspace.acceptChoice({ watch: 9, language: 'fr' }, { watch: 9, language: 'fr' },
    { deferred: true, unchosen: { watch: 7, language: 'fr' } })
  const restored = createProfileRecoveryWorkspace(f.options)
  restored.activate()
  assert.deepEqual(restored.merge({ watch: 9, language: 'fr' }), { watch: 9, language: 'fr' })
  assert.equal(restored.merge({ watch: 12, language: 'fr' }), null)
  restored.markPromotion({ watch: 9, language: 'fr' })
  assert.deepEqual(restored.merge({ watch: 9, language: 'es' }), { watch: 9, language: 'es' })
})
test('only a local decision tolerates an unavailable durable fence; missing or changed records still reject it', () => {
  const f = fixture()
  f.workspace.activate()
  const epoch = f.workspace.getEpoch()
  const primary = f.options.getPrimary()
  const read = primary.getItem
  primary.getItem = () => { throw new DOMException('', 'SecurityError') }
  assert.equal(f.workspace.matches(epoch), false)
  assert.equal(f.workspace.matches(epoch, { allowUnavailable: true }), true)
  primary.getItem = read
  f.values.delete('profile_recovery_workspace_v1')
  assert.equal(f.workspace.matches(epoch, { allowUnavailable: true }), false)
})

test('failed recovery writes report the actual exception when falling back to session or memory', () => {
  for (const memory of [false, true]) {
    const f = fixture({ denied: true })
    const failures = []
    const workspace = createProfileRecoveryWorkspace({ ...f.options,
      getSecondary: memory ? () => null : f.options.getSecondary,
      onStorageFailure: error => failures.push(error.name) })
    workspace.activate()
    assert.equal(workspace.getTier(), memory ? 'memory' : 'session')
    assert.deepEqual(failures, ['SecurityError'])
  }
})


test('a native import that activates recovery keeps its saved revision for subsequent UI updates', () => {
  const f = fixture({ denied: true })
  const store = createStateStore({ storage: f.workspace.storage, storageKey: 'profile',
    getRepository: () => f.workspace.isActive() ? f.workspace.repository : null,
    normalizeLoadedState: () => false, normalizeStateBeforeSave: () => {},
    createStateBackup: () => {}, pruneOldestStateBackup: () => false,
    saveConfigCookie: () => {}, syncPersistedStateToAnalytics: () => {},
    getLatestBackupState: () => null, loadConfigCookie: () => null, createDefaultStateFromConfig: () => ({}) })
  const imported = { watch: 7, language: 'es' }
  assert.equal(store.saveImportedState(imported).persisted, true)
  imported.insight = 'routine-return'
  assert.equal(store.saveState(imported, { backup: false }), true)
  assert.equal(f.workspace.repository.snapshot().insight, 'routine-return')
})
