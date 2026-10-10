import test from 'node:test'
import assert from 'node:assert/strict'
import { createProfileRecoveryWorkspace } from '../../src/state/profile-recovery-workspace.js'
function fixture({ denied = false } = {}) {
  const values = new Map([['profile', JSON.stringify({ watch: 1, language: 'fr' })], ['access', '{"ownerId":null}'], ['auth', 'SECRET']])
  const primary = { getItem: key => values.get(key) ?? null, setItem(key, value) { if (denied) throw new DOMException('', 'SecurityError'); values.set(key, value) }, removeItem: key => values.delete(key) }
  const sessionValues = new Map()
  const secondary = { getItem: key => sessionValues.get(key) ?? null, setItem: (key, value) => sessionValues.set(key, value), removeItem: key => sessionValues.delete(key) }
  const options = { storageKey: 'profile', accessKey: 'access', keys: ['access','sync'], getPrimary: () => primary, getSecondary: () => secondary, capture: () => ({ profile: primary.getItem('profile') }) }
  return { values, sessionValues, options, workspace: createProfileRecoveryWorkspace(options) }
}
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
