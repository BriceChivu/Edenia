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
