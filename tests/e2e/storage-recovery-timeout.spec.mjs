import { expect, test } from '../support/network-fixture.mjs'
import { readRecoveryRecord } from '../support/profile-recovery-fixture.mjs'

const key = 'edenia_v1_internal_test_2'
const primary = `${key}_profiles_indexed_db_v1`

test('a primary transaction timeout and Web Storage quota retain progress in a reopened recovery journal', async ({ page }) => {
  await page.addInitScript(() => {
    window.fixtureRecoveryConnections = []
    const open = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (...args) {
      const request = open.apply(this, args)
      if (args[0] === 'edenia_profile_recovery_v1') request.addEventListener('success', () => window.fixtureRecoveryConnections.push(request.result))
      return request
    }
  })
  await page.route('**/config.local.js*', route => route.fulfill({
    body: 'window.EDENIA_CONFIG = { indexedDbProfileEnabled: true, accountFeaturesRollout: "off", learnerProfileLifecycleEnabled: false, storageRecoveryTestRunId: "android-timeout-quota" }',
    contentType: 'application/javascript'
  }))
  await page.goto('/?internal_test=2')
  await expect.poll(() => page.evaluate(() => applicationStarted && stateBackupStorageReady)).toBe(true)
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('edenia_profile_recovery_v1', 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('heads', { keyPath: 'namespace' })
        request.result.createObjectStore('candidates', { keyPath: 'id' }).createIndex('namespace', 'namespace')
      }
      request.onsuccess = () => { request.result.close(); resolve() }
      request.onerror = () => reject(request.error)
    })
    const state = loadState()
    state.anki['2026-10-11'] = { reviewed: 1, created: 0 }
    if (!await saveState(state, { backup: false })) throw new Error('Fixture baseline failed')
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => applicationStarted && stateBackupStorageReady)).toBe(true)
  const outcome = await page.evaluate(async ({ key, primary }) => {
    // Reproduce a suspended/closed recovery connection, a primary write that
    // never completes, and the reported shared Web Storage quota failure.
    window.fixtureRecoveryConnections.forEach(db => db.close())
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name.startsWith(key)) throw new DOMException('Fixture quota', 'QuotaExceededError')
      return set.call(this, name, value)
    }
    const timer = window.setTimeout
    window.setTimeout = function (callback, delay, ...args) {
      return timer.call(this, callback, delay === 8000 ? 100 : delay, ...args)
    }
    const transact = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transact.apply(this, args)
      if (this.name === primary && args[1] === 'readwrite') {
        const store = tx.objectStore('profiles')
        const keepAlive = () => { try { store.get('fixture-hold').onsuccess = keepAlive } catch {} }
        keepAlive()
      }
      return tx
    }
    const edit = loadState()
    edit.anki['2026-10-11'].reviewed = 7
    const saved = await saveState(edit, { backup: false })
    IDBDatabase.prototype.transaction = transact
    window.setTimeout = timer
    await profileRecoveryWorkspace.flush()
    return { saved, reviewed: loadState().anki['2026-10-11'].reviewed, tier: profileRecoveryWorkspace.getTier() }
  }, { key, primary })
  expect(outcome.saved).toBe(true)
  expect(outcome.reviewed).toBe(7)
  expect(outcome.tier).toBe('indexed-db')
  const archive = await readRecoveryRecord(page, key)
  expect(JSON.parse(archive.values[key]).anki['2026-10-11'].reviewed).toBe(7)
  await page.reload()
  await expect.poll(() => page.evaluate(() => applicationStarted && stateBackupStorageReady)).toBe(true)
  expect(await page.evaluate(() => loadState().anki['2026-10-11'].reviewed)).toBe(7)
})
