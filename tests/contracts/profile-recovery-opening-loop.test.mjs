import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { createProfileRecoveryWorkspace } from '../../src/state/profile-recovery-workspace.js'
import { createLearnerProfileLocalPersistenceAdapter } from '../../src/state/learner-profile-local-adapter.js'
import { createLearnerProfileLifecycleAuthority } from '../../src/state/learner-profile-lifecycle.js'

function deferred() {
  let resolve
  const promise = new Promise(next => { resolve = next })
  return { promise, resolve }
}

// The native journal commits a transaction, then reads its head back before
// acknowledging save(). A recovery comparison can read that same head during
// the gap. No second browser context is needed to produce this ordering.
async function fixture() {
  const profile = { watch: 1, language: 'fr' }
  const access = { version: 1, activatedAt: 1, activationId: null,
    ownerId: 'owner-one', profileId: 'profile-one', generation: 1, revision: 1 }
  const originals = new Map([['profile', JSON.stringify(profile)], ['access', JSON.stringify(access)]])
  const storage = { getItem: key => originals.get(key) ?? null,
    setItem() { throw new DOMException('', 'QuotaExceededError') }, removeItem() {} }
  const disk = { raw: null, candidates: [], gate: null, readGate: null, beforeRead: null }
  const journal = {
    async read() {
      disk.beforeRead?.()
      // Opening the journal connection yields before its native readonly
      // transaction begins, so a new local writer can start in this gap too.
      const gate = disk.readGate
      if (gate) {
        disk.readGate = null
        gate.entered.resolve()
        await gate.observe.promise
      }
      return { raw: disk.raw, candidates: structuredClone(disk.candidates) }
    },
    async save(raw, expected, { consumedIds = [], canPersist = () => true } = {}) {
      if (!canPersist()) return { saved: false, cancelled: true, raw: disk.raw }
      if (disk.raw !== expected && disk.raw !== raw) {
        const candidate = { id: crypto.randomUUID(), raw, baselineRaw: expected }
        disk.candidates.push(candidate)
        return { saved: false, raw: disk.raw, candidate }
      }
      disk.raw = raw
      disk.candidates = disk.candidates.filter(copy => !consumedIds.includes(copy.id))
      const gate = disk.gate
      if (gate) {
        disk.gate = null
        gate.committed.resolve()
        await gate.acknowledge.promise
        if (gate.failure) throw gate.failure
      }
      if (disk.raw === raw) return { saved: true, raw }
      const candidate = { id: crypto.randomUUID(), raw, baselineRaw: raw }
      disk.candidates.push(candidate)
      return { saved: false, raw: disk.raw, candidate }
    }
  }
  const states = []
  let authority
  let externalChanges = 0
  let resolutions = 0
  let activationNumber = 0
  const workspace = createProfileRecoveryWorkspace({
    storageKey: 'profile', accessKey: 'access', keys: ['access', 'sync'], journal,
    getPrimary: () => storage, getSecondary: () => storage,
    capture: () => ({ profile: originals.get('profile') }),
    onExternalChange() {
      externalChanges++
      // This is the application callback: adopting an external workspace
      // refreshes the lifecycle and can show the opening screen again.
      queueMicrotask(() => authority?.refresh())
    }
  })
  workspace.activate()
  await workspace.flush()
  const localPersistence = createLearnerProfileLocalPersistenceAdapter({
    accessStorageKey: 'access', accountlessProfileId: 'accountless:browser',
    storage: workspace.storage,
    hasProfile: () => workspace.storage.getItem('profile') !== null,
    loadProfile: () => workspace.repository.snapshot(),
    readProfileRaw: () => workspace.storage.getItem('profile'),
    inheritProfileRevision: (state, source) => workspace.repository.inheritRevision(state, source),
    replaceProfile: (state, options, canPersist) => Promise.resolve(workspace.repository.save(state,
      { ...options, replace: true, canPersist })).then(persisted => ({ persisted })),
    saveProfile: (state, options, canPersist) => workspace.repository.save(state, { ...options, canPersist })
  })
  let verification = null
  authority = createLearnerProfileLifecycleAuthority({
    adapters: {
      analytics: { accessChanged() {}, profileActivated() {}, profileSaved() {} },
      authentication: { getObservation: () => ({ status: 'signed-in', userId: access.ownerId }), subscribe: () => () => {} },
      connectivity: { getObservation: () => ({ status: 'online' }), subscribe: () => () => {} },
      clock: { now: () => 1000 },
      cloudPersistence: {
        async resolve({ localProfile }) {
          resolutions++
          return { status: 'activate', ownerId: access.ownerId, profileId: access.profileId,
            generation: 1, revision: 1, profile: localProfile.profile, profileUnchanged: true }
        },
        activate() {}, start() {}, destroy() {}, subscribe: () => () => {}
      },
      exportDownload: {}, localPersistence,
      ownerVerification: { read: () => verification, record: next => { verification = next; return true } }
    },
    createActivationId: () => `activation-${++activationNumber}`,
    onStateChange: state => states.push(state.status)
  })
  authority.start()
  await setImmediate()
  await workspace.flush()
  assert.equal(authority.getState().status, 'active')
  assert.equal(resolutions, 1)

  function pauseNextAcknowledgment() {
    const gate = { committed: deferred(), acknowledge: deferred(), failure: null }
    disk.gate = gate
    return gate
  }
  function pauseNextObservation() {
    const gate = { entered: deferred(), observe: deferred() }
    disk.readGate = gate
    return gate
  }
  return { authority, workspace, disk, originals, states, pauseNextAcknowledgment, pauseNextObservation,
    get resolutions() { return resolutions }, get externalChanges() { return externalChanges } }
}

for (const { learnerEdit, refreshFirst } of [
  { learnerEdit: false, refreshFirst: false },
  { learnerEdit: true, refreshFirst: false },
  { learnerEdit: false, refreshFirst: true }
]) {
  test(`reading our committed ${learnerEdit ? 'learner save' : 'metadata write'} before acknowledgment${refreshFirst ? ' when the comparison started first' : ''} does not reopen the active profile`, async t => {
    const f = await fixture()
    t.after(() => f.authority.destroy())
    const activation = f.authority.getState().activation
    const previousStates = f.states.length
    const gate = f.pauseNextAcknowledgment()
    const observation = refreshFirst ? f.pauseNextObservation() : null
    let refreshing = refreshFirst ? f.workspace.refresh() : null
    if (observation) await observation.entered.promise
    let saving
    if (learnerEdit) {
      const current = f.authority.readActiveProfile()
      current.watch = 8
      saving = f.authority.saveActiveProfile(current, { backup: false, syncCloud: false })
    } else f.workspace.storage.setItem('sync', 'own sync bookkeeping')
    await gate.committed.promise
    refreshing ||= f.workspace.refresh()
    observation?.observe.resolve()
    await setImmediate()
    gate.acknowledge.resolve()
    await refreshing
    if (saving) await saving
    await f.workspace.flush()
    await setImmediate()
    assert.deepEqual(f.states.slice(previousStates), [], 'the opening notice must stay hidden after activation')
    assert.equal(f.externalChanges, 0, 'a local in-flight commit must not masquerade as a peer change')
    assert.equal(f.resolutions, 1, 'recovery comparison must not initiate another cloud opening')
    assert.equal(f.authority.getState().activation, activation)
    assert.equal(f.authority.readActiveProfile().watch, learnerEdit ? 8 : 1)
    assert.equal(JSON.parse(JSON.parse(f.disk.raw).values.profile).watch, learnerEdit ? 8 : 1)
    assert.equal(JSON.parse(JSON.parse(f.disk.raw).values.access).ownerId, 'owner-one')
    assert.equal(f.originals.get('profile'), '{"watch":1,"language":"fr"}')
  })
}

for (const ownerChange of [false, true]) {
  test(`a real peer ${ownerChange ? 'owner change' : 'progress edit'} during our acknowledgment remains observable and protected`, async t => {
    const f = await fixture()
    t.after(() => f.authority.destroy())
    const gate = f.pauseNextAcknowledgment()
    f.workspace.storage.setItem('sync', 'own sync bookkeeping')
    await gate.committed.promise
    const own = JSON.parse(f.disk.raw)
    const peer = structuredClone(own)
    peer.sequence++
    peer.values.profile = '{"watch":9,"language":"fr"}'
    if (ownerChange) peer.values.access = JSON.stringify({ ...JSON.parse(peer.values.access), ownerId: 'owner-two', activationId: null })
    f.disk.raw = JSON.stringify(peer)
    const refreshing = f.workspace.refresh()
    await setImmediate()
    gate.acknowledge.resolve()
    await refreshing
    await f.workspace.flush()
    await setImmediate()
    assert.ok(f.externalChanges > 0, 'genuine peer changes must still reach lifecycle ownership checks')
    assert.equal(f.workspace.repository.snapshot().watch, 9)
    const saved = JSON.parse(f.disk.raw)
    assert.equal(JSON.parse(saved.values.profile).watch, 9)
    assert.ok(saved.protectedWorkspaces.some(copy => JSON.parse(copy.values.profile).watch === 1), 'retain our previous learner progress')
    if (ownerChange) {
      assert.equal(f.authority.getState().status, 'account-change')
      assert.equal(f.authority.readActiveProfile(), null, 'old owner must not retain access after a real owner change')
      assert.equal(JSON.parse(saved.values.access).ownerId, 'owner-two')
    } else {
      assert.equal(f.authority.getState().status, 'active')
      assert.equal(f.authority.readActiveProfile().watch, 9)
    }
  })
}

test('a failed acknowledgment retains committed recovery progress and a later refresh can observe it', async t => {
  const f = await fixture()
  t.after(() => f.authority.destroy())
  const gate = f.pauseNextAcknowledgment()
  gate.failure = new Error('Recovery archive transaction timed out')
  f.workspace.storage.setItem('sync', 'own unacknowledged bookkeeping')
  await gate.committed.promise
  const refreshing = f.workspace.refresh()
  await setImmediate()
  gate.acknowledge.resolve()
  await refreshing
  await f.workspace.flush()
  await setImmediate()
  assert.equal(f.workspace.repository.snapshot().watch, 1)
  assert.equal(JSON.parse(JSON.parse(f.disk.raw).values.profile).watch, 1)
  assert.equal(JSON.parse(JSON.parse(f.disk.raw).values.access).ownerId, 'owner-one')
  assert.equal(f.originals.get('profile'), '{"watch":1,"language":"fr"}')
})

test('sustained local writes postpone a recovery comparison without reopening or losing progress', async t => {
  const f = await fixture()
  t.after(() => f.authority.destroy())
  const activation = f.authority.getState().activation
  const previousStates = f.states.length
  let writes = 0
  f.disk.beforeRead = () => f.workspace.storage.setItem('sync', `busy-${++writes}`)
  let refreshed
  try { refreshed = await f.workspace.refresh() }
  finally { f.disk.beforeRead = null }
  await f.workspace.flush()
  assert.equal(refreshed, false, 'a superseded comparison yields for a later quiet opportunity')
  assert.ok(writes > 0 && writes < 10, 'continuous changes must not cause an unbounded observation loop')
  assert.equal(f.externalChanges, 0)
  assert.deepEqual(f.states.slice(previousStates), [])
  assert.equal(f.authority.getState().activation, activation)
  assert.equal(f.authority.readActiveProfile().watch, 1)
  assert.equal(JSON.parse(f.disk.raw).values.sync, `busy-${writes}`)
  assert.equal(await f.workspace.refresh(), true, 'the comparison succeeds once local writes settle')
})
