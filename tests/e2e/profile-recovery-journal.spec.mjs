import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { expect, test } from '../support/network-fixture.mjs'

test.beforeEach(async ({ page }) => {
  const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../../src/state/profile-recovery-journal.js', import.meta.url))], bundle: true, format: 'esm', platform: 'browser', write: false })
  const source = outputFiles[0].text
  await page.route('**/__recovery-journal.js', route => route.fulfill({ body: source, contentType: 'application/javascript' }))
  await page.goto('/')
})

test('a stale recovery writer retains its complete candidate and retires it only with a verified successor', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createProfileRecoveryJournal } = await import('/__recovery-journal.js')
    const options = { namespace: 'journal-transaction-test', indexedDb: indexedDB }
    const first = createProfileRecoveryJournal(options)
    const second = createProfileRecoveryJournal(options)
    const other = createProfileRecoveryJournal({ ...options, namespace: 'other-owner-namespace' })
    await other.save('separate namespace', null)
    const empty = await second.read()
    const original = JSON.stringify({ progress: 7, archive: 'saved original and unchosen progress' })
    const desired = JSON.stringify({ progress: 8, archive: 'saved original and unchosen progress' })
    const accepted = await first.save(original, null)
    const stale = await second.save(desired, empty.raw)
    second.close()
    const reopened = createProfileRecoveryJournal(options)
    const afterCrash = await reopened.read()
    const merged = JSON.stringify({ progress: 8, protected: [original, desired] })
    const acknowledged = await reopened.save(merged, afterCrash.raw, { consumedIds: afterCrash.candidates.map(copy => copy.id) })
    const afterMerge = await first.read()
    const untouched = await other.read()
    first.close(); reopened.close(); other.close()
    return { accepted, stale, afterCrash, acknowledged, afterMerge, untouched }
  })
  expect(result.accepted.saved).toBe(true)
  expect(result.stale.saved).toBe(false)
  expect(JSON.parse(result.afterCrash.raw).progress).toBe(7)
  expect(JSON.parse(result.afterCrash.candidates[0].raw).progress).toBe(8)
  expect(result.acknowledged.saved).toBe(true)
  expect(JSON.parse(result.afterMerge.raw).protected).toHaveLength(2)
  expect(result.afterMerge.candidates).toEqual([])
  expect(result.untouched.raw).toBe('separate namespace')
})

test('cancelling after opening leaves the head and another namespace candidate intact', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createProfileRecoveryJournal } = await import('/__recovery-journal.js')
    const first = createProfileRecoveryJournal({ namespace: 'cancelled-test', indexedDb: indexedDB })
    const other = createProfileRecoveryJournal({ namespace: 'unrelated-candidate', indexedDb: indexedDB })
    await first.save('acknowledged', null)
    await other.save('original', null)
    const collision = await other.save('protected edit', null)
    const cancelled = await first.save('cancelled edit', 'acknowledged', { canPersist: () => false })
    await first.save('next acknowledged', 'acknowledged', { consumedIds: [collision.candidate.id] })
    const head = await first.read()
    const copies = await other.read()
    first.close(); other.close()
    return { cancelled, head, copies }
  })
  expect(result.cancelled.cancelled).toBe(true)
  expect(result.head.raw).toBe('next acknowledged')
  expect(result.copies.candidates[0].raw).toBe('protected edit')
})

test('a failed archive transaction rejects and preserves the preceding acknowledged head', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createProfileRecoveryJournal } = await import('/__recovery-journal.js')
    const journal = createProfileRecoveryJournal({ namespace: 'failed-write-test', indexedDb: indexedDB, timeoutMs: 1000 })
    await journal.save('acknowledged', null)
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'heads') throw new DOMException('fixture', 'QuotaExceededError')
      return put.apply(this, args)
    }
    let errorName
    try { await journal.save('unacknowledged', 'acknowledged') } catch (error) { errorName = error.name }
    IDBObjectStore.prototype.put = put
    const saved = await journal.read()
    journal.close()
    return { errorName, saved }
  })
  expect(result.errorName).toBe('QuotaExceededError')
  expect(result.saved.raw).toBe('acknowledged')
})

test('an unreadable recovery head reports the read failure without erasing acknowledged progress', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createProfileRecoveryJournal } = await import('/__recovery-journal.js')
    const journal = createProfileRecoveryJournal({ namespace: 'failed-read-test', indexedDb: indexedDB })
    await journal.save('acknowledged', null)
    const descriptor = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result')
    Object.defineProperty(IDBRequest.prototype, 'result', { ...descriptor, get() {
      if (this.source?.name === 'heads') throw new DOMException('fixture', 'SecurityError')
      return descriptor.get.call(this)
    } })
    let errorName
    try { await journal.read() } catch (error) { errorName = error.name }
    Object.defineProperty(IDBRequest.prototype, 'result', descriptor)
    const saved = await journal.read()
    journal.close()
    return { errorName, saved }
  })
  expect(result.errorName).toBe('SecurityError')
  expect(result.saved.raw).toBe('acknowledged')
})

for (const operation of ['read', 'save']) test(`a closed recovery connection reopens for ${operation} and retains acknowledged progress`, async ({ page }) => {
  const result = await page.evaluate(async operation => {
    const { createProfileRecoveryJournal } = await import('/__recovery-journal.js')
    const connections = []
    const journal = createProfileRecoveryJournal({ namespace: 'closed-recovery', indexedDb: {
      open(...args) {
        const request = indexedDB.open(...args)
        request.addEventListener('success', () => connections.push(request.result))
        return request
      }
    } })
    await journal.save('acknowledged progress', null)
    connections.at(-1).close()
    let error = null
    try {
      if (operation === 'save') await journal.save('later progress', 'acknowledged progress')
      else await journal.read()
    } catch (failure) { error = failure.name }
    // An independent reader proves the database itself remains available.
    const fresh = createProfileRecoveryJournal({ namespace: 'closed-recovery', indexedDb: indexedDB })
    const persisted = await fresh.read()
    journal.close(); fresh.close()
    return { error, persisted, connections: connections.length }
  }, operation)
  expect(result.error).toBeNull()
  expect(result.connections).toBe(2)
  expect(result.persisted.raw).toBe(operation === 'save' ? 'later progress' : 'acknowledged progress')
})

test('reopening still checks the latest head and cancels retired profile work', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createProfileRecoveryJournal } = await import('/__recovery-journal.js')
    let connection
    const namespace = 'reopened-fences'
    const journal = createProfileRecoveryJournal({ namespace, indexedDb: {
      open(...args) {
        const request = indexedDB.open(...args)
        request.addEventListener('success', () => { connection = request.result })
        return request
      }
    } })
    const peer = createProfileRecoveryJournal({ namespace, indexedDb: indexedDB })
    await journal.save('original progress', null)
    connection.close()
    await peer.save('peer progress', 'original progress')
    const collision = await journal.save('recent progress', 'original progress')
    connection.close()
    const cancelled = await journal.save('retired owner progress', 'peer progress', {
      consumedIds: [collision.candidate.id], canPersist: () => false
    })
    const saved = await peer.read()
    journal.close(); peer.close()
    return { collision, cancelled, saved }
  })
  expect(result.collision.saved).toBe(false)
  expect(result.cancelled.cancelled).toBe(true)
  expect(result.saved.raw).toBe('peer progress')
  expect(result.saved.candidates.map(copy => copy.raw)).toEqual(['recent progress'])
})

test('an unavailable reopened connection fails after one retry and keeps the saved head', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createProfileRecoveryJournal } = await import('/__recovery-journal.js')
    let connection
    let opens = 0
    const journal = createProfileRecoveryJournal({ namespace: 'bounded-reconnect', indexedDb: {
      open(...args) {
        opens += 1
        const request = indexedDB.open(...args)
        request.addEventListener('success', () => {
          connection = request.result
          if (opens > 1) connection.close()
        })
        return request
      }
    } })
    await journal.save('acknowledged progress', null)
    connection.close()
    let error
    try { await journal.save('new progress', 'acknowledged progress') } catch (failure) { error = failure.name }
    const fresh = createProfileRecoveryJournal({ namespace: 'bounded-reconnect', indexedDb: indexedDB })
    const saved = await fresh.read()
    journal.close(); fresh.close()
    return { error, opens, saved }
  })
  expect(result.error).toBe('InvalidStateError')
  expect(result.opens).toBe(2)
  expect(result.saved.raw).toBe('acknowledged progress')
})

test('an archive transaction timeout preserves the head and reopens for the next save', async ({ page }) => {
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  try {
    await page.evaluate(async () => {
      const { createProfileRecoveryJournal } = await import('/__recovery-journal.js')
      let opens = 0
      const journal = createProfileRecoveryJournal({ namespace: 'timed-out-recovery', timeoutMs: 100, indexedDb: {
        open(...args) { opens += 1; return indexedDB.open(...args) }
      } })
      // Healthy opening uses real IndexedDB events while the test clock is
      // paused. Only the deliberately stalled transaction advances to expiry.
      await journal.save('acknowledged progress', null)
      const transact = IDBDatabase.prototype.transaction
      window.archiveTimeoutCase = { journal, transact, opens: () => opens, started: false }
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = transact.apply(this, args)
        if (this.name === 'edenia_profile_recovery_v1' && args[1] === 'readwrite') {
          const heads = tx.objectStore('heads')
          const hold = () => { try { heads.get('fixture-hold').onsuccess = hold } catch {} }
          hold()
          window.archiveTimeoutCase.started = true
        }
        return tx
      }
      window.archiveTimeoutCase.failure = journal.save('timed-out progress', 'acknowledged progress')
        .then(() => null, error => error.message)
    })
    await expect.poll(() => page.evaluate(() => window.archiveTimeoutCase.started)).toBe(true)
    await page.clock.runFor(101)
    const result = await page.evaluate(async () => {
      const { journal, transact, failure, opens } = window.archiveTimeoutCase
      const error = await failure
      IDBDatabase.prototype.transaction = transact
      const afterTimeout = await journal.read()
      const next = await journal.save('later progress', afterTimeout.raw)
      const saved = await journal.read()
      return { error, opens: opens(), afterTimeout, next, saved }
    })
    expect(result.error).toBe('Recovery archive transaction timed out')
    expect(result.opens).toBe(2)
    expect(result.afterTimeout.raw).toBe('acknowledged progress')
    expect(result.next.saved).toBe(true)
    expect(result.saved.raw).toBe('later progress')
  } finally {
    await page.evaluate(() => {
      if (!window.archiveTimeoutCase) return
      IDBDatabase.prototype.transaction = window.archiveTimeoutCase.transact
      window.archiveTimeoutCase.journal.close()
    })
  }
})

test('legacy snapshot accumulation compacts and unchanged replacements survive browser reload', async ({ page }) => {
  const { outputFiles } = await build({
    stdin: { contents: "export { createProfileRecoveryWorkspace } from './src/state/profile-recovery-workspace.js'; export { createStateStore } from './src/state/store.js'", resolveDir: process.cwd() },
    bundle: true, format: 'esm', platform: 'browser', write: false
  })
  await page.route('**/__recovery-workspace.js', route => route.fulfill({ body: outputFiles[0].text, contentType: 'application/javascript' }))
  const result = await page.evaluate(async () => {
    const { createProfileRecoveryWorkspace, createStateStore } = await import('/__recovery-workspace.js')
    const { createProfileRecoveryJournal } = await import('/__recovery-journal.js')
    const namespace = 'bounded-history-test'
    const profile = JSON.stringify({ watch: 30, library: 'lesson '.repeat(16000) })
    const original = JSON.stringify({ watch: 1 })
    const unchosen = JSON.stringify({ watch: 29 })
    const head = { version: 1, status: 'active', baseline: original, originalAccess: null,
      originalValues: {}, values: { profile, access: null }, sequence: 30,
      originalProfile: original, unchosenProfile: unchosen }
    head.protectedWorkspaces = Array.from({ length: 30 }, (_, sequence) => ({ ...head,
      sequence, values: { profile: JSON.stringify({ watch: sequence, library: 'lesson '.repeat(16000) }), access: null },
      promotion: { profile }, originalValues: { backup: profile } }))
    const journal = createProfileRecoveryJournal({ namespace, indexedDb: indexedDB })
    const legacy = JSON.stringify(head)
    await journal.save(legacy, null)
    const storage = { getItem: () => null, setItem() { throw new DOMException('fixture', 'QuotaExceededError') } }
    const workspace = createProfileRecoveryWorkspace({ storageKey: 'profile', accessKey: 'access', keys: ['access'], getPrimary: () => storage, journal })
    await workspace.initialize()
    workspace.activate()
    await workspace.flush()
    const store = createStateStore({ storage: workspace.storage, storageKey: 'profile', getRepository: () => workspace.repository,
      normalizeStateBeforeSave: () => {}, saveConfigCookie: () => {}, syncPersistedStateToAnalytics: () => {} })
    for (let i = 0; i < 20; i++) {
      if (!(await store.saveImportedState(JSON.parse(profile), { syncAnalytics: false })).persisted) throw new Error('Profile save failed')
    }
    const saved = await journal.read()
    const archive = JSON.parse(saved.raw)
    journal.close()
    return { oldChars: legacy.length, newChars: saved.raw.length, copies: archive.protectedWorkspaces.length,
      unchanged: archive.values.profile === profile, original: archive.originalProfile === original, unchosen: archive.unchosenProfile === unchosen }
  })
  expect(result.unchanged).toBe(true)
  expect(result.original).toBe(true)
  expect(result.unchosen).toBe(true)
  expect(result.copies).toBeLessThanOrEqual(4)
  expect(result.newChars).toBeLessThan(result.oldChars / 10)
  await page.reload()
  const reopened = await page.evaluate(async () => {
    const { createProfileRecoveryWorkspace } = await import('/__recovery-workspace.js')
    const { createProfileRecoveryJournal } = await import('/__recovery-journal.js')
    const journal = createProfileRecoveryJournal({ namespace: 'bounded-history-test', indexedDb: indexedDB })
    const workspace = createProfileRecoveryWorkspace({ storageKey: 'profile', accessKey: 'access', keys: ['access'],
      getPrimary: () => ({ getItem: () => null, setItem() { throw new DOMException('fixture', 'QuotaExceededError') } }), journal })
    await workspace.initialize()
    workspace.activate()
    await workspace.flush()
    const profile = workspace.repository.snapshot()
    journal.close()
    return { watch: profile.watch, library: profile.library.length }
  })
  expect(reopened).toEqual({ watch: 30, library: 'lesson '.repeat(16000).length })
})
