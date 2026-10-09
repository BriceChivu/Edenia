import assert from 'node:assert/strict'
import test from 'node:test'
import { createLearnerProfileLocalPersistenceAdapter } from '../../src/state/learner-profile-local-adapter.js'
import { createLearnerProfileLifecycleAuthority } from '../../src/state/learner-profile-lifecycle.js'

const noop = () => {}
const subscribe = () => noop
const settled = () => new Promise(resolve => setImmediate(resolve))

function harness({ activationId = 'closed-window', backupRequired = false, normalize = profile => profile } = {}) {
  const ownerId = 'fixture-owner'
  const profileId = 'fixture-profile'
  const original = {
    config: { locale: 'en' },
    videos: { kept: { watchedSeconds: 42 } },
    anki: { '2026-10-08': { reviews: 3 } }
  }
  const oldFence = { id: activationId, ownerId, profileId, activatedAt: 10 }
  const values = new Map([
    ['profile', JSON.stringify(original)],
    ['access', JSON.stringify({ version: 1, ownerId, profileId, generation: 1,
      revision: 3, activatedAt: 10, activationId, onboardingFinalizationPending: false })]
  ])
  let refuseAccessWrites = false
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      if (key === 'access' && refuseAccessWrites) throw new DOMException('Full', 'QuotaExceededError')
      values.set(key, String(value))
    },
    removeItem: key => values.delete(key)
  }
  function adapter() {
    return createLearnerProfileLocalPersistenceAdapter({
      accessStorageKey: 'access', accountlessProfileId: 'accountless:profile', eventTarget: null,
      hasProfile: () => values.has('profile'), loadProfile: () => normalize(JSON.parse(values.get('profile'))),
      readProfileRaw: () => storage.getItem('profile'),
      replaceProfile(profile, _options, current) {
        if (!current()) return { persisted: false }
        storage.setItem('profile', JSON.stringify(profile))
        return { persisted: current() }
      },
      saveProfile(profile, _options, current) {
        if (!current()) return false
        storage.setItem('profile', JSON.stringify(profile))
        return current()
      },
      storage
    })
  }
  const requests = []
  let nextActivation = 0
  function createTab() {
    const localPersistence = adapter()
    const authority = createLearnerProfileLifecycleAuthority({
      adapters: {
        analytics: { accessChanged: noop, profileActivated: noop, profileSaved: noop },
        authentication: { getObservation: () => ({ status: 'signed-in', userId: ownerId }), subscribe },
        clock: { now: () => 100 },
        cloudPersistence: {
          resolve: () => new Promise(resolve => requests.push(resolve)),
          start: noop, subscribe, activate: () => true, markDirty: () => true,
          save: async () => ({ status: 'saved' })
        },
        connectivity: { getObservation: () => ({ status: 'online' }), subscribe },
        exportDownload: { download: async () => true }, localPersistence,
        ownerVerification: { record: () => true, read: () => null, clear: noop, subscribe }
      },
      createActivationId: () => `new-window-${++nextActivation}`, onStateChange: noop
    })
    return { authority, localPersistence }
  }
  function resolve(index = 0, overrides = {}) {
    requests[index]({ status: 'activate', ownerId, profileId, generation: 1,
      revision: 3, profile: structuredClone(original), backupRequired, ...overrides })
  }
  return { adapter, createTab, oldFence, original, resolve, storage,
    refuseAccessWrites: () => { refuseAccessWrites = true } }
}

for (const backupRequired of [false, true]) {
  test(`verified profile opens after abrupt exit and fences the retired writer (${backupRequired ? 'unsynced local' : 'cloud current'})`, async () => {
    const h = harness({ backupRequired })
    const tab = h.createTab()
    tab.authority.start()
    const cloudProfile = structuredClone(h.original)
    if (backupRequired) cloudProfile.videos.kept.watchedSeconds = 20
    h.resolve(0, { profile: cloudProfile })
    await settled()
    assert.equal(tab.authority.getState().status, 'active')
    assert.deepEqual(tab.authority.readActiveProfile(), h.original)
    assert.equal(h.adapter().save({ videos: { overwritten: {} } }, {}, h.oldFence), false)
    assert.deepEqual(JSON.parse(h.storage.getItem('profile')), h.original)
  })
}

for (const winningResponse of [0, 1]) {
  test(`a newer opening wins without a late response taking its activation (response ${winningResponse})`, async () => {
    const h = harness()
    const tabs = [h.createTab(), h.createTab()]
    for (const tab of tabs) tab.authority.start()
    h.resolve(winningResponse)
    await settled()
    assert.equal(tabs[winningResponse].authority.getState().status, 'active')
    const winningAccess = h.storage.getItem('access')
    h.resolve(1 - winningResponse)
    await settled()
    assert.equal(tabs[1 - winningResponse].authority.getState().status, 'recovering')
    assert.equal(tabs[1 - winningResponse].authority.readActiveProfile(), null)
    assert.equal(h.storage.getItem('access'), winningAccess)
    assert.deepEqual(JSON.parse(h.storage.getItem('profile')), h.original)
  })
}

test('opening refuses to retire a changed activation while cloud verification is pending', async () => {
  const h = harness()
  const tab = h.createTab()
  tab.authority.start()
  const nextFence = { ...h.oldFence, id: 'newer-live-tab', activatedAt: 101 }
  assert.equal(h.adapter().claimActivation(nextFence), true)
  const currentAccess = h.storage.getItem('access')
  h.resolve()
  await settled()
  assert.equal(tab.authority.getState().status, 'recovering')
  assert.equal(h.storage.getItem('access'), currentAccess)
  assert.equal(h.adapter().isActivationCurrent(nextFence), true)
})

test('opening preserves a newer local checkpoint under the captured activation', async () => {
  const h = harness()
  const tab = h.createTab()
  tab.authority.start()
  const latest = structuredClone(h.original)
  latest.videos.kept.watchedSeconds = 43
  assert.equal(h.adapter().save(latest, {}, h.oldFence), true)
  h.resolve()
  await settled()
  assert.equal(tab.authority.getState().status, 'recovering')
  assert.deepEqual(JSON.parse(h.storage.getItem('profile')), latest)
  assert.equal(h.adapter().isActivationCurrent(h.oldFence), true)
})

test('a different resolved owner cannot retire the captured activation', async () => {
  const h = harness()
  const tab = h.createTab()
  const originalAccess = h.storage.getItem('access')
  tab.authority.start()
  h.resolve(0, { ownerId: 'different-owner' })
  await settled()
  assert.notEqual(tab.authority.getState().status, 'active')
  assert.equal(h.storage.getItem('access'), originalAccess)
  assert.deepEqual(JSON.parse(h.storage.getItem('profile')), h.original)
})

test('failed activation retirement preserves access metadata and the cached profile', async () => {
  const h = harness()
  const tab = h.createTab()
  const originalAccess = h.storage.getItem('access')
  tab.authority.start()
  h.refuseAccessWrites()
  h.resolve()
  await settled()
  assert.equal(tab.authority.getState().status, 'recovering')
  assert.equal(h.storage.getItem('access'), originalAccess)
  assert.deepEqual(JSON.parse(h.storage.getItem('profile')), h.original)
})

test('an active profile can reopen after releasing its own activation', async () => {
  const h = harness({ activationId: null })
  const tab = h.createTab()
  tab.authority.start()
  h.resolve()
  await settled()
  assert.equal(tab.authority.getState().status, 'active')
  tab.authority.refresh()
  h.resolve(1)
  await settled()
  assert.equal(tab.authority.getState().status, 'active')
  assert.deepEqual(tab.authority.readActiveProfile(), h.original)
})

test('a verified fresh profile can replace the cached profile after abrupt exit', async () => {
  const h = harness()
  const tab = h.createTab()
  const fresh = { config: { locale: 'fr' }, videos: {}, anki: {} }
  tab.authority.start()
  h.resolve(0, { freshProfile: true, generation: 2, revision: 1, profile: fresh })
  await settled()
  assert.equal(tab.authority.getState().status, 'active')
  assert.deepEqual(tab.authority.readActiveProfile(), fresh)
  assert.equal(h.adapter().isActivationCurrent(h.oldFence), false)
})

test('opening compares durable bytes when load normalization adds changing defaults', async () => {
  let reads = 0
  const h = harness({ normalize(profile) {
    profile.config.ankiDisabledAt = `default-${++reads}`
    return profile
  } })
  const tab = h.createTab()
  tab.authority.start()
  h.resolve()
  await settled()
  assert.equal(tab.authority.getState().status, 'active')
  assert.equal(tab.authority.readActiveProfile().videos.kept.watchedSeconds, 42)
  assert.deepEqual(JSON.parse(h.storage.getItem('profile')), h.original)
})
