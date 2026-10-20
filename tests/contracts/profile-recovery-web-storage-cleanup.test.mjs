import assert from 'node:assert/strict'
import test from 'node:test'
import { createProfileRecoveryWorkspace } from '../../src/state/profile-recovery-workspace.js'

const key = 'profile_recovery_workspace_v1'
function fixture() {
  const local = new Map([['cache', 'x'.repeat(800)]])
  const session = new Map()
  const disk = { raw: null, failure: false, beforeWrite: null }
  let deniedRemoval = false
  const storage = values => ({
    getItem: name => values.get(name) ?? null,
    setItem(name, value) {
      const proposed = new Map(values).set(name, String(value))
      if ([...proposed].reduce((n, [k, v]) => n + k.length + v.length, 0) > 6000) {
        throw new DOMException('Fixture quota', 'QuotaExceededError')
      }
      values.set(name, String(value))
    },
    removeItem(name) {
      if (deniedRemoval) throw new DOMException('Fixture denied', 'SecurityError')
      values.delete(name)
    }
  })
  const primary = storage(local)
  const secondary = storage(session)
  const journal = {
    async read() { return { raw: disk.raw, candidates: [] } },
    async save(raw, expected, { canPersist = () => true } = {}) {
      await disk.beforeWrite?.()
      if (disk.failure) throw new DOMException('Fixture quota', 'QuotaExceededError')
      if (!canPersist()) return { saved: false, cancelled: true, raw: disk.raw }
      assert.equal(disk.raw, expected)
      disk.raw = raw
      return { saved: true, raw }
    }
  }
  const profile = JSON.stringify({ config: {}, study: 'x'.repeat(1800) })
  const options = { storageKey: 'profile', accessKey: 'access', keys: ['access', 'backup'],
    getPrimary: () => primary, getSecondary: () => secondary,
    journal, capture: () => ({ profile }) }
  const workspace = createProfileRecoveryWorkspace(options)
  return { workspace, options, disk, local, session, primary,
    denyRemoval() { deniedRemoval = true } }
}
async function growIntoJournal(f) {
  f.workspace.activate()
  const fallback = f.local.get(key)
  const edit = f.workspace.repository.snapshot()
  edit.study += 'edited'
  assert.equal(await f.workspace.repository.save(edit, { replace: true }), true)
  assert.equal(f.workspace.getTier(), 'indexed-db')
  return fallback
}

test('journal acknowledgement retires covered local and session copies before later backup writes', async () => {
  const f = fixture()
  await growIntoJournal(f)
  assert.equal(f.local.has(key), false)
  assert.equal(f.session.has(key), false)
  assert.equal(await f.workspace.complete(), true)
  f.workspace.storage.setItem('backup', 'x'.repeat(4000))
  assert.equal(f.workspace.isActive(), false)
  assert.ok(JSON.parse(f.disk.raw).values.profile.includes('edited'))
})

test('opening a completed journal reclaims a covered stale fallback from an older release', async () => {
  const f = fixture()
  const fallback = await growIntoJournal(f)
  assert.equal(await f.workspace.complete(), true)
  f.local.set(key, fallback)
  const reopened = createProfileRecoveryWorkspace(f.options)
  await reopened.initialize()
  assert.equal(reopened.hasPending(), false)
  assert.equal(f.local.has(key), false)
  assert.ok(JSON.parse(f.disk.raw).values.profile.includes('edited'))
})

test('failed journal acknowledgement retains the Web Storage fallback', async () => {
  const f = fixture()
  f.workspace.activate()
  const fallback = f.local.get(key)
  f.disk.failure = true
  const edit = f.workspace.repository.snapshot()
  edit.study += 'edited'
  assert.equal(await f.workspace.repository.save(edit, { replace: true }), false)
  assert.equal(f.local.get(key), fallback)
})

test('a fallback changed by a peer during acknowledgement is not removed', async () => {
  const f = fixture()
  f.workspace.activate()
  const peer = JSON.parse(f.local.get(key))
  peer.values.profile = JSON.stringify({ config: {}, study: 'peer progress' })
  peer.sequence += 10
  const peerRaw = JSON.stringify(peer)
  f.disk.beforeWrite = () => { f.local.set(key, peerRaw); f.disk.beforeWrite = null }
  const edit = f.workspace.repository.snapshot()
  edit.study += 'edited'
  await f.workspace.repository.save(edit, { replace: true })
  assert.equal(f.local.get(key), peerRaw)
})

for (const difference of ['profile', 'owner', 'backup', 'conflict', 'protected record', 'replacement fence', 'nested original']) {
  test(`startup preserves an unrepresented fallback ${difference}`, async () => {
    const f = fixture()
    const fallback = JSON.parse(await growIntoJournal(f))
    assert.equal(await f.workspace.complete(), true)
    if (difference === 'profile') fallback.values.profile = '{"study":"unique progress"}'
    if (difference === 'owner') fallback.values.access = '{"ownerId":"other","generation":2}'
    if (difference === 'backup') fallback.values.backup = 'unique backup bank'
    if (difference === 'conflict') fallback.pendingConflicts = [{ id: 'pending', currentRaw: '{}', desiredRaw: '{"study":3}', accessRaw: null }]
    if (difference === 'protected record') fallback.protectedJournalRecords = ['unrepresented archive']
    if (difference === 'replacement fence') { fallback.replacement = true; fallback.replacementId = 'another-choice' }
    if (difference === 'nested original') fallback.protectedWorkspaces = [{ ...fallback,
      originalProfile: '{"study":"unique nested original"}' }]
    const raw = JSON.stringify(fallback)
    f.local.set(key, raw)
    await createProfileRecoveryWorkspace(f.options).initialize()
    assert.equal(f.local.get(key), raw)
  })
}

test('denied cleanup does not turn a durable journal acknowledgement into a failed save', async () => {
  const f = fixture()
  f.denyRemoval()
  await growIntoJournal(f)
  assert.equal(await f.workspace.complete(), true)
  assert.ok(f.local.has(key))
  assert.equal(JSON.parse(f.disk.raw).status, 'archived')
})
