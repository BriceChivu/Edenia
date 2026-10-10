import test from 'node:test'
import assert from 'node:assert/strict'
import { createProfileRecoveryWorkspace } from '../../src/state/profile-recovery-workspace.js'
import { createStateStore } from '../../src/state/store.js'

function fixture() {
  const values = new Map([['profile', '{"watch":1,"language":"fr"}'], ['access', '{"ownerId":null}']])
  const storage = { getItem: key => values.get(key) ?? null,
    setItem() { throw new DOMException('', 'QuotaExceededError') }, removeItem() {} }
  const disk = { raw: null, candidates: [], failure: null, beforeWrite: null }
  const journal = {
    async read() { return { raw: disk.raw, candidates: structuredClone(disk.candidates) } },
    async save(raw, expected, { consumedIds = [], canPersist = () => true } = {}) {
      await disk.beforeWrite?.(raw)
      if (disk.failure) throw disk.failure
      if (!canPersist()) return { saved: false, cancelled: true, raw: disk.raw }
      if (disk.raw !== expected && disk.raw !== raw) {
        const candidate = { id: crypto.randomUUID(), raw }
        disk.candidates.push(candidate)
        return { saved: false, raw: disk.raw, candidate }
      }
      disk.raw = raw
      disk.candidates = disk.candidates.filter(copy => !consumedIds.includes(copy.id))
      return { saved: true, raw }
    }
  }
  const options = { storageKey: 'profile', accessKey: 'access', keys: ['access', 'sync'],
    getPrimary: () => storage, getSecondary: () => storage, journal,
    capture: () => ({ profile: values.get('profile') }) }
  return { disk, values, options, workspace: createProfileRecoveryWorkspace(options) }
}

test('a journal archive protects both progress versions across reload and completed promotion', async () => {
  const f = fixture()
  f.workspace.activate()
  const edit = f.workspace.repository.snapshot()
  edit.watch = 8
  assert.equal(await f.workspace.repository.save(edit), true)
  assert.equal(f.workspace.getTier(), 'indexed-db')
  assert.equal(await f.workspace.archive({ watch: 7, language: 'fr' }), true)
  const reopened = createProfileRecoveryWorkspace(f.options)
  await reopened.initialize()
  reopened.activate()
  assert.equal(reopened.repository.snapshot().watch, 8)
  assert.equal(JSON.parse(JSON.parse(f.disk.raw).originalProfile).watch, 7)
  assert.equal(await reopened.markPromotion(edit), true)
  assert.equal(await reopened.complete(), true)
  const afterPromotion = createProfileRecoveryWorkspace(f.options)
  await afterPromotion.initialize()
  assert.equal(afterPromotion.hasPending(), false)
  assert.equal(JSON.parse(JSON.parse(f.disk.raw).values.profile).watch, 8)
})

for (const competing of [false, true]) test(`an interrupted journal collision ${competing ? 'reopens a meaningful choice' : 'merges compatible progress'} on reload`, async () => {
  const f = fixture()
  f.workspace.activate()
  await f.workspace.flush()
  const own = JSON.parse(f.disk.raw)
  own.values.profile = competing ? '{"watch":8,"language":"fr"}' : '{"watch":1,"language":"es"}'
  const peer = JSON.parse(f.disk.raw)
  peer.values.profile = '{"watch":7,"language":"fr"}'
  peer.sequence++
  f.disk.raw = JSON.stringify(peer)
  f.disk.candidates.push({ id: 'interrupted-candidate', raw: JSON.stringify(own) })
  let conflict
  const reopened = createProfileRecoveryWorkspace({ ...f.options, onConflict: value => { conflict = value } })
  await reopened.initialize()
  reopened.activate()
  await reopened.flush()
  await Promise.resolve()
  const saved = JSON.parse(f.disk.raw)
  assert.ok(saved.protectedWorkspaces.some(copy => JSON.parse(copy.values.profile).language === (competing ? 'fr' : 'es')))
  if (competing) {
    assert.equal(JSON.parse(conflict?.desiredRaw).watch, 8)
    assert.equal(JSON.parse(conflict?.currentRaw).watch, 7)
    assert.equal(saved.pendingConflicts[0].id, 'interrupted-candidate')
  } else assert.deepEqual(reopened.repository.snapshot(), { watch: 7, language: 'es' })
  assert.equal(f.disk.candidates.length, 0)
})

test('an unavailable journal does not acknowledge an archive or retire the memory workspace', async () => {
  const f = fixture()
  f.workspace.activate()
  await f.workspace.flush()
  const previous = f.disk.raw
  f.disk.failure = new DOMException('', 'QuotaExceededError')
  assert.equal(await f.workspace.archive({ watch: 7 }), false)
  assert.equal(await f.workspace.complete(), false)
  assert.equal(f.workspace.isActive(), true)
  assert.equal(f.disk.raw, previous)
})

test('a caller cancelled while journal acknowledgement is pending does not report a successful save', async () => {
  const f = fixture()
  f.workspace.activate()
  await f.workspace.flush()
  let release
  let entered
  const writing = new Promise(resolve => { entered = resolve })
  f.disk.beforeWrite = () => new Promise(resolve => { release = resolve; entered() })
  const edit = f.workspace.repository.snapshot()
  edit.watch = 8
  let allowed = true
  const saving = f.workspace.repository.save(edit, { canPersist: () => allowed })
  await writing
  allowed = false
  // Remove the gate for subsequent facade snapshots in the same flush.
  f.disk.beforeWrite = null
  release()
  assert.equal(await saving, false)
  assert.equal(JSON.parse(JSON.parse(f.disk.raw).values.profile).watch, 8)
  assert.equal(JSON.parse(f.values.get('profile')).watch, 1)
})

test('progress edited during archive completion stays active and survives reload', async () => {
  const f = fixture()
  f.workspace.activate()
  await f.workspace.flush()
  let release
  let entered
  const writing = new Promise(resolve => { entered = resolve })
  f.disk.beforeWrite = raw => JSON.parse(raw).status === 'archived'
    ? new Promise(resolve => { release = resolve; entered() }) : undefined
  const completing = f.workspace.complete()
  await writing
  const edit = f.workspace.repository.snapshot()
  edit.watch = 8
  const saving = f.workspace.repository.save(edit)
  f.disk.beforeWrite = null
  release()
  assert.equal(await completing, false)
  assert.equal(await saving, true)
  assert.equal(f.workspace.isActive(), true)
  const reopened = createProfileRecoveryWorkspace(f.options)
  await reopened.initialize()
  assert.equal(reopened.hasPending(), true)
  reopened.activate()
  assert.equal(reopened.repository.snapshot().watch, 8)
})

for (const nativeNewer of [false, true]) test(`startup reconciles compatible native and journal edits when the native sequence is ${nativeNewer ? 'higher' : 'lower'}`, async () => {
  const f = fixture()
  f.workspace.activate()
  await f.workspace.flush()
  const native = JSON.parse(f.disk.raw)
  const journal = JSON.parse(f.disk.raw)
  native.values.profile = '{"watch":1,"language":"es"}'
  journal.values.profile = '{"watch":7,"language":"fr"}'
  native.sequence += nativeNewer ? 2 : 1
  journal.sequence += nativeNewer ? 1 : 2
  f.values.set('profile_recovery_workspace_v1', JSON.stringify(native))
  f.disk.raw = JSON.stringify(journal)
  const reopened = createProfileRecoveryWorkspace(f.options)
  await reopened.initialize()
  reopened.activate()
  await reopened.flush()
  assert.deepEqual(reopened.repository.snapshot(), { watch: 7, language: 'es' })
})

test('tabs observing already retained history do not rewrite each other indefinitely', async () => {
  const f = fixture()
  f.workspace.activate()
  f.workspace.storage.setItem('profile', '{"watch":7,"language":"fr"}')
  await f.workspace.flush()
  const other = createProfileRecoveryWorkspace(f.options)
  await other.initialize()
  other.activate()
  await other.flush()
  const sequence = JSON.parse(f.disk.raw).sequence
  await f.workspace.refresh()
  await f.workspace.flush()
  await other.refresh()
  await other.flush()
  assert.equal(JSON.parse(f.disk.raw).sequence, sequence)
})

test('readback collision recovery does not turn an acknowledged predecessor into a false choice', async () => {
  const f = fixture()
  f.workspace.activate()
  await f.workspace.flush()
  const predecessor = JSON.parse(f.disk.raw)
  predecessor.values.profile = '{"watch":7,"language":"fr"}'
  const latest = structuredClone(predecessor)
  latest.values.profile = '{"watch":9,"language":"fr"}'
  latest.sequence++
  f.disk.raw = JSON.stringify(latest)
  f.disk.candidates.push({ id: 'acknowledged-predecessor', raw: JSON.stringify(predecessor), baselineRaw: JSON.stringify(predecessor) })
  let conflict
  const reopened = createProfileRecoveryWorkspace({ ...f.options, onConflict: value => { conflict = value } })
  await reopened.initialize()
  reopened.activate()
  await reopened.flush()
  assert.equal(reopened.repository.snapshot().watch, 9)
  assert.equal(conflict, undefined)
  assert.equal(JSON.parse(f.disk.raw).pendingConflicts?.length || 0, 0)
})

for (const fence of ['owner', 'activation', 'generation', 'replacement']) test(`a late journal ${fence} change protects the old edit without acknowledging it against the new scope`, async () => {
  const f = fixture()
  const access = { ownerId: 'owner-a', activationId: 'activation-a', profileId: 'profile-a', generation: 1 }
  f.values.set('access', JSON.stringify(access))
  f.workspace.activate()
  await f.workspace.flush()
  const edit = f.workspace.repository.snapshot()
  edit.watch = 8
  const foreign = JSON.parse(f.disk.raw)
  const next = { ...access }
  if (fence === 'owner') next.ownerId = 'owner-b'
  if (fence === 'activation') next.activationId = 'activation-b'
  if (fence === 'generation') next.generation = 2
  if (fence === 'replacement') { foreign.replacement = true; foreign.replacementId = 'independent-reset' }
  foreign.values.access = JSON.stringify(next)
  foreign.values.profile = '{"watch":100,"language":"es"}'
  foreign.sequence++
  f.disk.beforeWrite = () => { f.disk.beforeWrite = null; f.disk.raw = JSON.stringify(foreign) }
  assert.equal(await f.workspace.repository.save(edit), false)
  await f.workspace.flush()
  const saved = JSON.parse(f.disk.raw)
  assert.equal(JSON.parse(saved.values.profile).watch, 100)
  assert.ok(saved.protectedWorkspaces.some(copy => JSON.parse(copy.values.profile).watch === 8 && copy.values.access === JSON.stringify(access)))
})

test('a malformed journal head remains protected while a new recovery workspace continues normally', async () => {
  const f = fixture()
  f.disk.raw = '{"malformed":'
  const failures = []
  const workspace = createProfileRecoveryWorkspace({ ...f.options, onStorageFailure: (...args) => failures.push(args) })
  await workspace.initialize()
  workspace.activate()
  assert.equal(await workspace.flush(), true)
  assert.equal(workspace.repository.snapshot().watch, 1)
  assert.deepEqual(JSON.parse(f.disk.raw).protectedJournalRecords, ['{"malformed":'])
  assert.equal(failures[0]?.[0].name, 'SyntaxError')
  assert.equal(failures[0]?.[1], 'open')
  assert.equal(failures[0]?.[2], 'recovery-journal')
})

for (const importing of [false, true]) test(`a native ${importing ? 'import' : 'save'} that activates journal recovery waits for its available durable write`, async () => {
  const f = fixture()
  let release
  let entered
  const writing = new Promise(resolve => { entered = resolve })
  f.disk.beforeWrite = () => new Promise(resolve => { release = resolve; entered() })
  let notifications = 0
  const store = createStateStore({ storage: f.workspace.storage, storageKey: 'profile',
    getRepository: () => f.workspace.isActive() ? f.workspace.repository : null,
    normalizeLoadedState: () => false, normalizeStateBeforeSave: () => {},
    createStateBackup: () => {}, pruneOldestStateBackup: () => false,
    saveConfigCookie: () => {}, syncPersistedStateToAnalytics: () => {},
    onPersisted: () => { notifications++ }, getLatestBackupState: () => null,
    loadConfigCookie: () => null, createDefaultStateFromConfig: () => ({}) })
  const state = store.loadState()
  state.watch = 8
  const saving = importing ? store.saveImportedState(state) : store.saveState(state, { backup: false })
  await writing
  try {
    assert.equal(notifications, 0)
    f.disk.beforeWrite = null
    release()
    const result = await saving
    assert.equal(importing ? result.persisted : result, true)
    assert.equal(JSON.parse(JSON.parse(f.disk.raw).values.profile).watch, 8)
    assert.equal(notifications, 1)
  } finally { f.disk.beforeWrite = null; release() }
})
