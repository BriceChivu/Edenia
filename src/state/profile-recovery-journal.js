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

  function open(create) {
    if (database) return Promise.resolve(database)
    if (opening) return opening.then(value => value || (create ? open(true) : null))
    opening = new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE, 1)
      let missing = false
      let settled = false
      const timer = setTimeout(() => {
        settled = true
        reject(new Error('Recovery archive opening timed out'))
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
        database = request.result
        database.onversionchange = () => { database.close(); database = null }
        resolve(database)
      }
      for (const event of ['blocked', 'error']) request.addEventListener(event, () => {
        clearTimeout(timer)
        if (settled) return
        settled = true
        if (missing && request.error?.name === 'AbortError') resolve(null)
        else reject(request.error || new Error('Recovery archive opening blocked'))
      }, { once: true })
    }).catch(error => { throw annotateStorageFailure(error, 'recovery-journal', 'database-open') }).finally(() => { opening = null })
    return opening
  }
  function transaction(db, mode, run) {
    return new Promise((resolve, reject) => {
      let tx
      try { tx = db.transaction(['heads', 'candidates'], mode) }
      catch (error) { reject(annotateStorageFailure(error, 'recovery-journal', 'transaction-open')); return }
      let result
      let failure
      const timer = setTimeout(() => {
        try { tx.abort() } catch {}
        reject(annotateStorageFailure(new Error('Recovery archive transaction timed out'), 'recovery-journal', 'transaction-complete'))
      }, timeoutMs)
      tx.oncomplete = () => { clearTimeout(timer); resolve(result) }
      tx.onabort = tx.onerror = () => {
        clearTimeout(timer)
        reject(annotateStorageFailure(failure || tx.error || new Error('Recovery archive transaction failed'), 'recovery-journal', 'transaction-complete'))
      }
      const fail = error => { failure = error; try { tx.abort() } catch {} }
      try { run(tx, value => { result = value }, fail) }
      catch (error) { failure = error; try { tx.abort() } catch {}; clearTimeout(timer); reject(annotateStorageFailure(error, 'recovery-journal', 'request')) }
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
  return { read, save, close() { channel?.close(); database?.close(); database = null } }
}
