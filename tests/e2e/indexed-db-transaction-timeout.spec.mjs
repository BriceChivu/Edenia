import { build } from 'esbuild'
import { expect, test } from '../support/network-fixture.mjs'
import { createProductionSourceResolver } from '../../scripts/build-production-experience.mjs'

test.beforeEach(async ({ page }) => {
  const bundle = await build({ stdin: {
    contents: "export { createProfileRecoveryJournal } from './src/state/profile-recovery-journal.js'; export { openIndexedDbProfile } from './src/state/indexed-db-profile.js'; export { createIndexedDbBackupStorage, readIndexedDbBackupEntries } from './src/state/indexed-db-backups.js'",
    resolveDir: process.cwd()
  }, bundle: true, format: 'esm', platform: 'browser', write: false })
  await page.route('**/__transaction-timeout.js', route => route.fulfill({ body: bundle.outputFiles[0].text, contentType: 'text/javascript' }))
  const { sourcePath, plugin } = await createProductionSourceResolver(process.cwd())
  const retained = await build({ entryPoints: [sourcePath('src/state/indexed-db-profile.js')],
    plugins: [plugin], bundle: true, format: 'esm', platform: 'browser', write: false })
  await page.route('**/__retained-timeout.js', route => route.fulfill({ body: retained.outputFiles[0].text, contentType: 'text/javascript' }))
  await page.route('**/__transaction-timeout.html', route => route.fulfill({ body: '<!doctype html><title>Storage fixture</title>', contentType: 'text/html' }))
  await page.goto('/__transaction-timeout.html')
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 1000))
})

for (const boundary of ['primary', 'retained-primary', 'recovery', 'backup']) {
  for (const nativeOutcome of ['complete', 'abort', 'stalled']) {
    test(`${boundary} respects native ${nativeOutcome} when the transaction deadline expires`, async ({ page }) => {
      await page.evaluate(async ({ boundary, nativeOutcome }) => {
        const modules = await import(boundary === 'retained-primary' ? '/__retained-timeout.js' : '/__transaction-timeout.js')
        const databaseName = boundary === 'recovery' ? 'edenia_profile_recovery_v1' : `timeout-${boundary}`
        const storeName = boundary.endsWith('primary') ? 'profiles' : boundary === 'backup' ? 'backups' : 'heads'
        const options = { indexedDb: indexedDB, storage: localStorage, storageKey: 'timeout-profile', accessKey: 'timeout-access',
          databaseName, eventTarget: null, isValidState: state => Number.isSafeInteger(state.points) }
        const backupOptions = { indexedDb: indexedDB, databaseName, backupKey: 'timeout-backup',
          legacyStorage: localStorage, isValidEntry: entry => typeof entry.id === 'string' && Number.isSafeInteger(entry.points) }
        let api, write, verify
        if (boundary.endsWith('primary')) {
          localStorage.setItem(options.storageKey, JSON.stringify({ points: 1 }))
          api = await modules.openIndexedDbProfile(options)
          write = async () => {
            const edit = api.snapshot(); edit.points = 2
            return { saved: await api.save(edit), error: api.getSaveFailure(edit)?.message }
          }
          verify = async () => {
            api.close()
            const fresh = await modules.openIndexedDbProfile(options)
            const points = fresh.snapshot().points; fresh.close(); return points
          }
        } else if (boundary === 'recovery') {
          const journalOptions = { namespace: 'timeout', indexedDb: indexedDB }
          api = modules.createProfileRecoveryJournal(journalOptions)
          await api.save(JSON.stringify({ points: 1 }), null)
          write = () => api.save(JSON.stringify({ points: 2 }), JSON.stringify({ points: 1 }))
          verify = async () => {
            api.close()
            const fresh = modules.createProfileRecoveryJournal(journalOptions)
            const points = JSON.parse((await fresh.read()).raw).points; fresh.close(); return points
          }
        } else {
          api = await modules.createIndexedDbBackupStorage(backupOptions)
          api.storage.setItem(backupOptions.backupKey, JSON.stringify([{ id: 'fixture', points: 1 }]))
          if (!(await api.flush()).persisted) throw new Error('Baseline failed')
          write = async () => {
            api.storage.setItem(backupOptions.backupKey, JSON.stringify([{ id: 'fixture', points: 2 }]))
            const result = await api.flush()
            return { saved: result.persisted, error: result.error?.message }
          }
          verify = async () => {
            api.close()
            const result = await modules.readIndexedDbBackupEntries(backupOptions)
            if (result.error) throw result.error
            return result.entries[0].points
          }
        }
        const original = IDBDatabase.prototype.transaction
        window.timeoutProbe = { created: false, nativeEvent: null, outcome: null, verify, original }
        IDBDatabase.prototype.transaction = function (...args) {
          const tx = original.apply(this, args)
          if (this.name !== databaseName || args[1] !== 'readwrite' || timeoutProbe.created) return tx
          timeoutProbe.created = true
          if (nativeOutcome === 'stalled') {
            const store = tx.objectStore(storeName)
            const pump = () => { try { store.get('fixture-hold').onsuccess = pump } catch {} }
            pump()
            return tx
          }
          // Hold delivery to application listeners after the native outcome.
          // The database is real: abort() must now throw InvalidStateError.
          const handlers = []
          const add = tx.addEventListener.bind(tx)
          const eventName = nativeOutcome === 'complete' ? 'complete' : 'abort'
          Object.defineProperty(tx, `on${eventName}`, { configurable: true,
            get: () => handlers[0] || null, set: handler => { handlers[0] = handler } })
          tx.addEventListener = (type, handler, options) => {
            if (type === eventName) handlers.push(handler)
            else add(type, handler, options)
          }
          add(eventName, event => {
            timeoutProbe.nativeEvent = event.type
            timeoutProbe.release = () => {
              for (const handler of handlers) if (handler) handler.call(tx, event)
            }
          }, { once: true })
          if (nativeOutcome === 'abort') queueMicrotask(() => tx.abort())
          return tx
        }
        timeoutProbe.pending = write().then(value => timeoutProbe.outcome = value,
          error => timeoutProbe.outcome = { saved: false, error: error.message })
      }, { boundary, nativeOutcome })
      await expect.poll(() => page.evaluate(() => timeoutProbe.created)).toBe(true)
      if (nativeOutcome !== 'stalled') await expect.poll(() => page.evaluate(() => timeoutProbe.nativeEvent)).toBe(nativeOutcome)
      await page.clock.runFor(8001)
      const result = await page.evaluate(async () => {
        timeoutProbe.release?.()
        await timeoutProbe.pending
        IDBDatabase.prototype.transaction = timeoutProbe.original
        return { ...timeoutProbe.outcome, points: await timeoutProbe.verify() }
      })
      expect(result.saved).toBe(nativeOutcome === 'complete')
      expect(result.points).toBe(nativeOutcome === 'complete' ? 2 : 1)
      if (nativeOutcome === 'abort') expect(result.error || '').not.toContain('timed out')
      if (nativeOutcome === 'stalled') expect(result.error).toContain('timed out')
    })
  }
}
