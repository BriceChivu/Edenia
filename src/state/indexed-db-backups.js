import { createStorageOperationMonitor } from './storage-operation-diagnostics.js'
import { annotateStorageFailure } from './profile-storage-recovery.js'
export const STATE_BACKUP_DATABASE_NAME = 'edenia_state_backups_v1'
export const STATE_BACKUP_DATABASE_VERSION = 1

const BACKUP_STORE_NAME = 'backups'
const METADATA_STORE_NAME = 'metadata'
const MIGRATION_METADATA_KEY = 'local-storage-migration-v1'

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function compareEntries(left, right) {
  return String(left?.id || '').localeCompare(String(right?.id || ''))
}

export function stateBackupEntriesMatch(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false
  if (left.length !== right.length) return false
  const sortedLeft = cloneJson(left).sort(compareEntries)
  const sortedRight = cloneJson(right).sort(compareEntries)
  return JSON.stringify(sortedLeft) === JSON.stringify(sortedRight)
}

export function mergeStateBackupEntries(...collections) {
  const byId = new Map()
  collections.forEach(collection => {
    if (!Array.isArray(collection)) return
    collection.forEach(entry => {
      if (!entry?.id) return
      byId.set(entry.id, cloneJson(entry))
    })
  })
  return [...byId.values()].sort(
    (left, right) => new Date(right.createdAt) - new Date(left.createdAt)
  )
}

export function parseLegacyStateBackupEntries(raw, isValidEntry) {
  if (raw === null) {
    return {
      entries: [],
      exists: false,
      valid: true
    }
  }

  try {
    const parsed = JSON.parse(raw)
    const uniqueIds = new Set()
    const valid = Array.isArray(parsed) && parsed.every(entry => {
      if (!isValidEntry(entry) || uniqueIds.has(entry.id)) return false
      uniqueIds.add(entry.id)
      return true
    })
    return {
      entries: valid ? cloneJson(parsed) : [],
      exists: true,
      valid
    }
  } catch {
    return {
      entries: [],
      exists: true,
      valid: false
    }
  }
}

export function shouldMirrorLegacyStateBackups({
  cleanupLegacy,
  legacyExists,
  legacyRemoved,
  legacyValid
}) {
  return !cleanupLegacy
    || (legacyExists && legacyValid && !legacyRemoved)
}

function backupTransaction(database, ...args) {
  try { return database.transaction(...args) }
  catch (error) { throw annotateStorageFailure(error, 'backup', 'transaction-open') }
}
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true
    })
    request.addEventListener('error', () => reject(
      annotateStorageFailure(request.error || new Error('IndexedDB request failed'), 'backup', 'request')
    ), { once: true })
  })
}

function transactionComplete(transaction) {
  const diagnostic = createStorageOperationMonitor({ storageTarget: 'backup', mode: transaction.mode })
  diagnostic.observe(transaction)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { transaction.abort() } catch (error) {
        // Completion/abort delivery can lag behind the native outcome.
        if (error.name === 'InvalidStateError') return
      }
      reject(diagnostic.failure(new Error('IndexedDB backup transaction timed out'), 'transaction-complete', 'timeout'))
    }, 8000)
    transaction.addEventListener('complete', () => {
      clearTimeout(timeout)
      resolve()
    }, { once: true })
    for (const event of ['abort', 'error']) {
      transaction.addEventListener(event, nativeEvent => {
        clearTimeout(timeout)
        reject(diagnostic.failure(nativeEvent.target?.error || transaction.error || new Error('IndexedDB backup transaction failed'), event === 'error' ? 'request' : 'transaction-complete', event === 'error' ? 'request-error' : 'abort'))
      }, { once: true })
    }
  })
}

function openBackupDatabase(indexedDb, databaseName) {
  const diagnostic = createStorageOperationMonitor({ storageTarget: 'backup', mode: 'open' })
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(
      databaseName,
      STATE_BACKUP_DATABASE_VERSION
    )
    diagnostic.observe(request)
    let settled = false
    const timeout = setTimeout(() => {
      settled = true
      reject(diagnostic.failure(new Error('IndexedDB backup database opening timed out'), 'database-open', 'timeout'))
    }, 8000)
    request.addEventListener('upgradeneeded', () => {
      const database = request.result
      if (!database.objectStoreNames.contains(BACKUP_STORE_NAME)) {
        database.createObjectStore(BACKUP_STORE_NAME, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(METADATA_STORE_NAME)) {
        database.createObjectStore(METADATA_STORE_NAME, { keyPath: 'key' })
      }
    })
    request.addEventListener('success', () => {
      const database = request.result
      clearTimeout(timeout)
      if (settled) { database.close(); return }
      settled = true
      database.addEventListener('versionchange', () => database.close())
      resolve(database)
    }, { once: true })
    for (const event of ['blocked', 'error']) {
      request.addEventListener(event, () => {
        clearTimeout(timeout)
        settled = true
        reject(diagnostic.failure(request.error || new Error('Could not open IndexedDB backup database'), 'database-open', event === 'blocked' ? 'database-blocked' : 'database-error'))
      }, { once: true })
    }
  }).catch(error => { throw diagnostic.failure(error, 'database-open', 'database-error') })
}

function openExistingBackupDatabase(indexedDb, databaseName) {
  const diagnostic = createStorageOperationMonitor({ storageTarget: 'backup', mode: 'open' })
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(
      databaseName,
      STATE_BACKUP_DATABASE_VERSION
    )
    diagnostic.observe(request)
    let missing = false
    let settled = false
    const timeout = setTimeout(() => {
      settled = true
      reject(diagnostic.failure(new Error('IndexedDB existing backup database opening timed out'), 'database-open', 'timeout'))
    }, 8000)
    request.addEventListener('upgradeneeded', event => {
      if (event.oldVersion === 0) {
        missing = true
        request.transaction?.abort()
      }
    })
    request.addEventListener('success', () => {
      const database = request.result
      clearTimeout(timeout)
      if (settled) { database.close(); return }
      settled = true
      if (missing) {
        database.close()
        resolve(null)
        return
      }
      database.addEventListener('versionchange', () => database.close())
      resolve(database)
    }, { once: true })
    request.addEventListener('blocked', () => {
      clearTimeout(timeout)
      settled = true
      reject(diagnostic.failure(new Error('IndexedDB backup database open was blocked'), 'database-open', 'database-blocked'))
    }, { once: true })
    request.addEventListener('error', () => {
      clearTimeout(timeout)
      settled = true
      if (missing && request.error?.name === 'AbortError') {
        resolve(null)
        return
      }
      reject(diagnostic.failure(request.error || new Error('Could not open the existing IndexedDB backup database'), 'database-open', 'database-error'))
    }, { once: true })
  }).catch(error => { throw diagnostic.failure(error, 'database-open', 'database-error') })
}

async function readBackupEntries(database) {
  const transaction = backupTransaction(database, BACKUP_STORE_NAME, 'readonly')
  const request = transaction.objectStore(BACKUP_STORE_NAME).getAll()
  const [entries] = await Promise.all([
    requestResult(request),
    transactionComplete(transaction)
  ])
  return Array.isArray(entries) ? entries : []
}

export async function readIndexedDbBackupEntries({
  databaseName = STATE_BACKUP_DATABASE_NAME,
  indexedDb = globalThis.indexedDB,
  isValidEntry
} = {}) {
  if (!indexedDb || typeof indexedDb.open !== 'function') {
    throw new TypeError('IndexedDB backup reader requires IndexedDB')
  }
  if (typeof isValidEntry !== 'function') {
    throw new TypeError('IndexedDB backup reader requires an entry validator')
  }

  let database
  try {
    database = await openExistingBackupDatabase(indexedDb, databaseName)
    if (!database) return { exists: false, entries: [], error: null }
    if (!database.objectStoreNames.contains(BACKUP_STORE_NAME)) {
      return {
        exists: true,
        entries: [],
        error: new Error('IndexedDB backup store is missing')
      }
    }
    const entries = await readBackupEntries(database)
    if (!entries.every(isValidEntry)) {
      return {
        exists: true,
        entries: [],
        error: new Error('IndexedDB contains an invalid state backup')
      }
    }
    return { exists: true, entries: cloneJson(entries), error: null }
  } catch (error) {
    return { exists: Boolean(database), entries: [], error }
  } finally {
    database?.close()
  }
}

// Apply only this adapter's changes in one transaction. A stale tab must not
// clear recovery entries created by another tab since its last read.
async function applyBackupChanges(database, previous, next) {
  const previousById = new Map(previous.map(entry => [entry.id, entry]))
  const nextById = new Map(next.map(entry => [entry.id, entry]))
  const transaction = backupTransaction(database, BACKUP_STORE_NAME, 'readwrite', { durability: 'strict' })
  const finished = transactionComplete(transaction)
  const store = transaction.objectStore(BACKUP_STORE_NAME)
  try {
    for (const id of previousById.keys()) if (!nextById.has(id)) store.delete(id)
    for (const entry of next) {
      if (JSON.stringify(previousById.get(entry.id)) !== JSON.stringify(entry)) store.put(entry)
    }
  } catch { transaction.abort() }
  await finished
  const persisted = await readBackupEntries(database)
  const persistedById = new Map(persisted.map(entry => [entry.id, entry]))
  if (!next.every(entry => JSON.stringify(persistedById.get(entry.id)) === JSON.stringify(entry))) {
    throw new Error('IndexedDB backup change verification failed')
  }
  return persisted
}

async function writeMigrationMetadata(database, metadata) {
  const transaction = backupTransaction(database, METADATA_STORE_NAME, 'readwrite')
  transaction.objectStore(METADATA_STORE_NAME).put({
    key: MIGRATION_METADATA_KEY,
    ...metadata
  })
  await transactionComplete(transaction)
}

function createIndexedDbStorageAdapter({
  backupKey,
  database,
  initialEntries,
  legacyStorage,
  mirrorLegacy
}) {
  // IndexedDB reads and JSON.parse produce owned snapshots. Only strings and
  // cloned flush results leave the adapter; replace these arrays, never mutate
  // them. Sharing an unchanged snapshot avoids two more full backup-bank copies.
  let currentEntries = initialEntries
  let persistedEntries = initialEntries
  let currentRevision = 0
  let latestOperation = Promise.resolve(persistedEntries)

  function scheduleWrite(entries) {
    const snapshot = entries
    const previous = currentEntries
    const revision = currentRevision + 1
    currentRevision = revision
    currentEntries = snapshot

    const operation = latestOperation
      .catch(() => {})
      .then(() => applyBackupChanges(database, previous, snapshot))
      .then(writtenEntries => {
        persistedEntries = writtenEntries
        if (revision === currentRevision) currentEntries = writtenEntries
        return writtenEntries
      })
      .catch(error => {
        if (revision === currentRevision) {
          currentEntries = persistedEntries
        }
        throw error
      })
    latestOperation = operation
    void operation.catch(() => {})
    return operation
  }

  const storage = {
    getItem(key) {
      if (key !== backupKey) return legacyStorage.getItem(key)
      return currentEntries.length ? JSON.stringify(currentEntries) : null
    },
    setItem(key, value) {
      if (key !== backupKey) {
        legacyStorage.setItem(key, value)
        return
      }
      const entries = JSON.parse(value)
      if (!Array.isArray(entries)) {
        throw new TypeError('State backup storage requires an array')
      }
      scheduleWrite(entries)
      if (mirrorLegacy) {
        try {
          legacyStorage.setItem(backupKey, value)
        } catch {}
      }
    },
    removeItem(key) {
      if (key !== backupKey) {
        legacyStorage.removeItem(key)
        return
      }
      void scheduleWrite([]).then(() => {
        try { legacyStorage.removeItem(backupKey) } catch {}
      }).catch(() => {})
    }
  }

  return {
    storage,
    async flush() {
      try {
        const entries = await latestOperation
        return {
          entries: cloneJson(entries),
          error: null,
          persisted: true
        }
      } catch (error) {
        return {
          entries: cloneJson(persistedEntries),
          error,
          persisted: false
        }
      }
    }
  }
}

export async function createIndexedDbBackupStorage({
  backupKey,
  beforeLegacyCleanup = () => true,
  cleanupLegacy = false,
  databaseName = STATE_BACKUP_DATABASE_NAME,
  indexedDb = globalThis.indexedDB,
  isValidEntry,
  legacyStorage
}) {
  if (!indexedDb || typeof indexedDb.open !== 'function') {
    throw new Error('IndexedDB is unavailable')
  }
  if (!legacyStorage || typeof legacyStorage.getItem !== 'function') {
    throw new TypeError('Legacy backup storage is required')
  }
  if (typeof isValidEntry !== 'function') {
    throw new TypeError('A backup entry validator is required')
  }

  const database = await openBackupDatabase(indexedDb, databaseName)
  try {
    const capturedLegacyRaw = legacyStorage.getItem(backupKey)
    const legacy = parseLegacyStateBackupEntries(
      capturedLegacyRaw,
      isValidEntry
    )
    const indexedEntries = await readBackupEntries(database)
    if (!indexedEntries.every(isValidEntry)) {
      throw new Error('IndexedDB contains an invalid state backup')
    }
    // Most reloads have no legacy bank to migrate. The validated native read
    // already owns its values: do not rewrite, reread, or JSON-clone every full
    // learner profile merely to open its recovery bank.
    const verifiedEntries = legacy.valid && legacy.entries.length
      ? await applyBackupChanges(database, indexedEntries,
        mergeStateBackupEntries(indexedEntries, legacy.entries))
      : indexedEntries
    const legacyWasVerified = legacy.valid && legacy.entries.every(entry => (
      verifiedEntries.some(candidate => stateBackupEntriesMatch(
        [entry],
        [candidate]
      ))
    ))

    await writeMigrationMetadata(database, {
      backupKey,
      entryCount: verifiedEntries.length,
      legacyPresent: legacy.exists,
      legacyValid: legacy.valid,
      legacyVerified: legacyWasVerified,
      migratedAt: new Date().toISOString(),
      schemaVersion: STATE_BACKUP_DATABASE_VERSION
    })

    let legacyRemoved = false
    if (cleanupLegacy && legacy.exists && legacyWasVerified) {
      try {
        const cleanupAuthorized = await beforeLegacyCleanup()
        if (cleanupAuthorized !== false && legacyStorage.getItem(backupKey) === capturedLegacyRaw) {
          legacyStorage.removeItem(backupKey)
          legacyRemoved = legacyStorage.getItem(backupKey) === null
        }
      } catch {}
    }

    const mirrorLegacy = shouldMirrorLegacyStateBackups({
      cleanupLegacy,
      legacyExists: legacy.exists,
      legacyRemoved,
      legacyValid: legacy.valid
    })
    const adapter = createIndexedDbStorageAdapter({
      backupKey,
      database,
      initialEntries: verifiedEntries,
      legacyStorage,
      mirrorLegacy
    })

    return {
      ...adapter,
      close() {
        database.close()
      },
      migration: {
        entryCount: verifiedEntries.length,
        legacyPresent: legacy.exists,
        legacyRemoved,
        legacyValid: legacy.valid,
        legacyVerified: legacyWasVerified
      },
      mirrorsLegacy: mirrorLegacy
    }
  } catch (error) {
    database.close()
    throw error
  }
}
