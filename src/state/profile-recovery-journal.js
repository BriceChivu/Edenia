import { createStorageOperationMonitor } from './storage-operation-diagnostics.js'
import { annotateStorageFailure } from './profile-storage-recovery.js'
const DATABASE = 'edenia_profile_recovery_v1'

// Web Storage can run out of room while IndexedDB still has capacity. Keep the
// full recovery document here, separate from the primary learner-profile head.
// A stale writer retains its candidate instead of overwriting another tab.
export function createProfileRecoveryJournal({
  namespace, indexedDb, eventTarget, onChange = () => {}, timeoutMs = 8000
}) {
  let database = null
  let opening = null
  const channel = typeof eventTarget?.BroadcastChannel === 'function'
    ? new eventTarget.BroadcastChannel(`${DATABASE}:${namespace}`) : null
  if (channel) channel.onmessage = () => onChange()

  function discardConnection(db) {
    if (database === db) database = null
    try { db.close() } catch {}
  }

  function open(create) {
    if (database) return Promise.resolve(database)
    if (opening) return opening.then(value => value || (create ? open(true) : null))
    const diagnostic = createStorageOperationMonitor({ storageTarget: 'recovery-journal', timeoutMs, mode: 'open' })
    opening = new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE, 1)
      let missing = false
      let settled = false
      const timer = setTimeout(() => {
        settled = true
        reject(diagnostic.failure(new Error('Recovery archive opening timed out'), 'database-open', 'timeout'))
      }, timeoutMs)
      request.onupgradeneeded = event => {
        if (settled) { request.transaction.abort(); return }
        if (!create && event.oldVersion === 0) {
          missing = true
          request.transaction.abort()
          return
        }
        const db = request.result
        db.createObjectStore('heads', { keyPath: 'namespace' })
        db.createObjectStore('candidates', { keyPath: 'id' }).createIndex('namespace', 'namespace')
      }
      request.onsuccess = () => {
        clearTimeout(timer)
        if (settled) { request.result.close(); return }
        settled = true
        const db = request.result
        database = db
        db.onversionchange = db.onclose = () => discardConnection(db)
        resolve(db)
      }
      for (const event of ['blocked', 'error']) request.addEventListener(event, () => {
        clearTimeout(timer)
        if (settled) return
        settled = true
        if (missing && request.error?.name === 'AbortError') resolve(null)
        else reject(diagnostic.failure(request.error || new Error('Recovery archive opening blocked'), 'database-open', event === 'blocked' ? 'database-blocked' : 'database-error'))
      }, { once: true })
    }).catch(error => { throw diagnostic.failure(error, 'database-open', 'database-error') }).finally(() => { opening = null })
    return opening
  }
  async function transaction(db, mode, run, canReconnect = true) {
    let tx
    try { tx = db.transaction(['heads', 'candidates'], mode) }
    catch (error) {
      if (error.name === 'InvalidStateError') {
        discardConnection(db)
        // No transaction started, so retrying cannot replay an uncertain write.
        // The callback still checks the current head and ownership after opening.
        if (canReconnect) {
          const reopened = await open(mode === 'readwrite')
          if (!reopened) return { raw: null, candidates: [] }
          return transaction(reopened, mode, run, false)
        }
      }
      throw annotateStorageFailure(error, 'recovery-journal', 'transaction-open')
    }
    const diagnostic = createStorageOperationMonitor({ storageTarget: 'recovery-journal', timeoutMs, mode })
    diagnostic.observe(tx)
    return new Promise((resolve, reject) => {
      let result
      let failure
      const timer = setTimeout(() => {
        try { tx.abort() } catch (error) {
          // A finished transaction can still have its outcome event queued.
          // Let that native event settle the operation, including an abort.
          if (error.name === 'InvalidStateError') return
        }
        // Leave the head untouched and reopen on the next attempt. A timed-out
        // transaction may have an uncertain outcome and must not be replayed.
        discardConnection(db)
        reject(diagnostic.failure(new Error('Recovery archive transaction timed out'), 'transaction-complete', 'timeout'))
      }, timeoutMs)
      tx.oncomplete = () => { clearTimeout(timer); resolve(result) }
      tx.onabort = tx.onerror = event => {
        clearTimeout(timer)
        reject(diagnostic.failure(failure || event.target?.error || tx.error || new Error('Recovery archive transaction failed'), event.type === 'error' ? 'request' : 'transaction-complete', event.type === 'error' ? 'request-error' : 'abort'))
      }
      const fail = error => { failure = error; try { tx.abort() } catch {} }
      try { run(tx, value => { result = value }, fail) }
      catch (error) { failure = error; try { tx.abort() } catch {}; clearTimeout(timer); reject(diagnostic.failure(error, 'request', 'request-exception')) }
    })
  }
  async function read() {
    const db = await open(false)
    if (!db) return { raw: null, candidates: [] }
    return transaction(db, 'readonly', (tx, done, fail) => {
      const head = tx.objectStore('heads').get(namespace)
      const candidates = tx.objectStore('candidates').index('namespace').getAll(namespace)
      let raw = null
      let copies = []
      head.onsuccess = () => {
        try { raw = head.result?.raw ?? null; done({ raw, candidates: copies }) }
        catch (error) { fail(error) }
      }
      candidates.onsuccess = () => {
        try { copies = candidates.result; done({ raw, candidates: copies }) }
        catch (error) { fail(error) }
      }
    })
  }
  async function save(raw, expectedRaw, { consumedIds = [], canPersist = () => true } = {}) {
    const db = await open(true)
    const result = await transaction(db, 'readwrite', (tx, done, fail) => {
      const heads = tx.objectStore('heads')
      const copies = tx.objectStore('candidates')
      const request = heads.get(namespace)
      request.onsuccess = () => {
        try {
          const current = request.result?.raw ?? null
          if (!canPersist()) { done({ saved: false, cancelled: true, raw: current }); return }
          if (current !== expectedRaw && current !== raw) {
            const id = globalThis.crypto.randomUUID()
            const candidate = { id, raw, baselineRaw: expectedRaw }
            copies.add({ ...candidate, namespace })
            done({ saved: false, raw: current, candidate })
            return
          }
          heads.put({ namespace, raw })
          // Only candidates incorporated into this exact head can be retired.
          for (const id of consumedIds) {
            const copy = copies.get(id)
            copy.onsuccess = () => {
              try { if (copy.result?.namespace === namespace) copies.delete(id) }
              catch (error) { fail(error) }
            }
          }
          done({ saved: true, raw })
        } catch (error) { fail(error) }
      }
    })
    channel?.postMessage({ changed: true })
    if (!result.saved) return result
    const acknowledged = await read()
    if (acknowledged.raw === raw) return result
    // A peer advanced the head before readback. Preserve this acknowledged
    // write too; the workspace will reconcile it with the newer head.
    const candidate = { id: globalThis.crypto.randomUUID(), raw, baselineRaw: raw }
    await transaction(db, 'readwrite', (tx, done) => {
      tx.objectStore('candidates').add({ ...candidate, namespace })
      done()
    })
    return { saved: false, raw: acknowledged.raw, candidate }
  }
  return { read, save, close() { channel?.close(); if (database) discardConnection(database) } }
}
