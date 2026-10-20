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

test('a quota failure in every durable store never acknowledges a memory-only profile save', async () => {
  const f = fixture()
  f.workspace.activate()
  await f.workspace.flush()
  const previous = f.disk.raw
  f.disk.failure = new DOMException('', 'QuotaExceededError')
  const edit = f.workspace.repository.snapshot()
  edit.watch = 8
  const saved = await f.workspace.repository.save(edit)
  assert.equal(f.workspace.getTier(), 'memory')
  assert.equal(f.workspace.repository.snapshot().watch, 8)
  assert.equal(f.disk.raw, previous)
  assert.equal(saved, false, 'memory-only edits must not be reported as safely persisted')
  f.disk.failure = null
  assert.equal(await f.workspace.flush(), true)
  const reopened = createProfileRecoveryWorkspace(f.options)
  await reopened.initialize()
  reopened.activate()
  assert.equal(reopened.repository.snapshot().watch, 8)
})

test('a session fallback is journaled before acknowledgement so closing the tab keeps progress', async () => {
  const f = fixture()
  const session = new Map()
  const workspace = createProfileRecoveryWorkspace({ ...f.options, getSecondary: () => ({
    getItem: key => session.get(key) ?? null,
    setItem: (key, value) => session.set(key, value), removeItem: key => session.delete(key)
  }) })
  workspace.activate()
  const edit = workspace.repository.snapshot()
  edit.watch = 8
  assert.equal(await workspace.repository.save(edit), true)
  // A new tab has no access to the preceding tab's sessionStorage.
  const reopened = createProfileRecoveryWorkspace(f.options)
  await reopened.initialize()
  reopened.activate()
  assert.equal(reopened.repository.snapshot().watch, 8)
})

test('ordinary profile saves remain acknowledged after journal recovery completes', async () => {
  const f = fixture()
  f.workspace.activate()
  await f.workspace.flush()
  assert.equal(await f.workspace.complete(), true)
  const store = createStateStore({ storage: f.workspace.storage, storageKey: 'profile',
    getRepository: () => ({ save: state => { f.values.set('profile', JSON.stringify(state)); return true } }),
    normalizeLoadedState: () => false, normalizeStateBeforeSave: () => {},
    createStateBackup: () => {}, pruneOldestStateBackup: () => false,
    saveConfigCookie: () => {}, syncPersistedStateToAnalytics: () => {},
    getLatestBackupState: () => null, loadConfigCookie: () => null, createDefaultStateFromConfig: () => ({}) })
  assert.equal(await store.saveState({ watch: 8, language: 'fr' }, { backup: false }), true)
  assert.equal(JSON.parse(f.values.get('profile')).watch, 8)
})

for (const configFailure of [false, true]) test(`profile acknowledgement ${configFailure ? 'rejects failed' : 'includes'} follow-up config writes to the recovery journal`, async () => {
  const f = fixture()
  f.workspace.activate()
  await f.workspace.flush()
  const store = createStateStore({ storage: f.workspace.storage, storageKey: 'profile',
    getRepository: () => f.workspace.repository,
    normalizeLoadedState: () => false, normalizeStateBeforeSave: () => {},
    createStateBackup: () => {}, pruneOldestStateBackup: () => false,
    saveConfigCookie: () => {
      if (configFailure) f.disk.failure = new DOMException('', 'QuotaExceededError')
      f.workspace.storage.setItem('sync', 'latest config')
    },
    syncPersistedStateToAnalytics: () => {}, getLatestBackupState: () => null,
    loadConfigCookie: () => null, createDefaultStateFromConfig: () => ({}) })
  const edit = store.loadState()
  edit.watch = 8
  assert.equal(await store.saveState(edit, { backup: false }), !configFailure)
  assert.equal(f.workspace.getTier(), configFailure ? 'memory' : 'indexed-db')
  assert.equal(JSON.parse(f.disk.raw).values.sync, configFailure ? null : 'latest config')
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

test('repeated identical profile-opening replacements do not accumulate recovery snapshots', async () => {
  const f = fixture()
  const large = { config: {}, study: 'x'.repeat(16000) }
  f.values.set('profile', JSON.stringify(large))
  f.workspace.activate()
  await f.workspace.flush()
  const store = createStateStore({ storage: f.workspace.storage, storageKey: 'profile',
    getRepository: () => f.workspace.repository, normalizeStateBeforeSave: () => {},
    saveConfigCookie: () => {}, syncPersistedStateToAnalytics: () => {} })
  for (let attempt = 0; attempt < 20; attempt++) {
    assert.equal((await store.saveImportedState(structuredClone(large), { syncAnalytics: false })).persisted, true)
  }
  const saved = JSON.parse(f.disk.raw)
  assert.ok((saved.protectedWorkspaces || []).length <= 1)
  assert.ok(f.disk.raw.length < JSON.stringify(large).length * 5)
  const reopened = createProfileRecoveryWorkspace(f.options)
  await reopened.initialize()
  reopened.activate()
  assert.deepEqual(reopened.repository.snapshot(), large)
})

test('legacy recovery history is compacted while current, original, unchosen and pending progress survive', async () => {
  const f = fixture()
  f.workspace.activate()
  await f.workspace.flush()
  const saved = JSON.parse(f.disk.raw)
  const current = JSON.stringify({ watch: 30, language: 'fr' })
  saved.values.profile = current
  saved.originalProfile = '{"watch":1,"language":"fr"}'
  saved.unchosenProfile = '{"watch":29,"language":"fr"}'
  saved.pendingConflicts = [{ id: 'pending', currentRaw: current, desiredRaw: '{"watch":31,"language":"fr"}', accessRaw: saved.values.access }]
  saved.protectedWorkspaces = Array.from({ length: 30 }, (_, i) => ({ ...saved,
    sequence: i, values: { ...saved.values, profile: JSON.stringify({ watch: i, language: 'fr' }) },
    originalValues: { huge: 'x'.repeat(10000) }, promotion: { profile: 'x'.repeat(10000) } }))
  f.disk.raw = JSON.stringify(saved)
  const reopened = createProfileRecoveryWorkspace(f.options)
  await reopened.initialize()
  reopened.activate()
  await reopened.flush()
  const compact = JSON.parse(f.disk.raw)
  assert.equal(compact.values.profile, current)
  assert.equal(compact.originalProfile, saved.originalProfile)
  assert.equal(compact.unchosenProfile, saved.unchosenProfile)
  assert.deepEqual(compact.pendingConflicts, saved.pendingConflicts)
  assert.ok(compact.protectedWorkspaces.length <= 4)
  assert.ok(f.disk.raw.length < 10000)
  for (const copy of compact.protectedWorkspaces) {
    assert.equal(typeof copy.values.profile, 'string')
    assert.equal(copy.originalValues, undefined)
    assert.equal(copy.promotion, undefined)
  }
})

test('activation-only changes deduplicate history and old original comparisons stay bounded', async () => {
  const f = fixture()
  f.workspace.activate()
  await f.workspace.flush()
  for (let revision = 1; revision <= 20; revision++) {
    f.workspace.storage.setItem('access', JSON.stringify({ ownerId: 'same', profileId: 'profile', generation: 1, activationId: String(revision), revision }))
    await f.workspace.flush()
    await f.workspace.archive({ watch: revision, language: 'fr' })
  }
  const saved = JSON.parse(f.disk.raw)
  assert.ok(saved.protectedWorkspaces.length <= 2)
  assert.deepEqual(saved.protectedOriginalProfiles.map(raw => JSON.parse(raw).watch), [16, 17, 18, 19])
  assert.equal(JSON.parse(saved.originalProfile).watch, 20)
  assert.equal(JSON.parse(saved.values.profile).watch, 1)
})

test('tabs do not resurrect evicted history when a peer advances a full archive', async () => {
  const f = fixture()
  f.workspace.activate()
  for (let watch = 2; watch <= 5; watch++) {
    f.workspace.storage.setItem('profile', JSON.stringify({ watch, language: 'fr' }))
    await f.workspace.flush()
  }
  const other = createProfileRecoveryWorkspace(f.options)
  await other.initialize()
  other.activate()
  await other.flush()
  await f.workspace.refresh()
  await f.workspace.flush()
  other.storage.setItem('profile', '{"watch":6,"language":"fr"}')
  await other.flush()
  const sequence = JSON.parse(f.disk.raw).sequence
  for (let cycle = 0; cycle < 3; cycle++) {
    await f.workspace.refresh()
    await f.workspace.flush()
    await other.refresh()
    await other.flush()
  }
  assert.equal(JSON.parse(f.disk.raw).sequence, sequence)
  assert.deepEqual(JSON.parse(f.disk.raw).protectedWorkspaces.map(copy => JSON.parse(copy.values.profile).watch), [2, 3, 4, 5])
})

test('one owner filling history cannot evict another owners unreconciled progress', async () => {
  const f = fixture()
  f.workspace.activate()
  f.workspace.storage.setItem('access', '{"ownerId":"first"}')
  f.workspace.storage.setItem('profile', '{"watch":7,"language":"fr"}')
  await f.workspace.flush()
  f.workspace.storage.setItem('access', '{"ownerId":"second"}')
  for (let watch = 10; watch < 20; watch++) {
    f.workspace.storage.setItem('profile', JSON.stringify({ watch, language: 'es' }))
    await f.workspace.flush()
  }
  const saved = JSON.parse(f.disk.raw)
  const first = saved.protectedWorkspaces.filter(copy => JSON.parse(copy.values.access)?.ownerId === 'first')
  const second = saved.protectedWorkspaces.filter(copy => JSON.parse(copy.values.access)?.ownerId === 'second')
  assert.ok(first.some(copy => JSON.parse(copy.values.profile).watch === 7))
  assert.ok(second.length <= 4)
  assert.equal(JSON.parse(saved.values.profile).watch, 19)
})
