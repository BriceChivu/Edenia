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

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true
    })
    request.addEventListener('error', () => reject(
      request.error || new Error('IndexedDB request failed')
    ), { once: true })
  })
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener('abort', () => reject(
      transaction.error || new Error('IndexedDB transaction was aborted')
    ), { once: true })
    transaction.addEventListener('error', () => reject(
      transaction.error || new Error('IndexedDB transaction failed')
    ), { once: true })
  })
}

function openBackupDatabase(indexedDb, databaseName) {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(
      databaseName,
      STATE_BACKUP_DATABASE_VERSION
    )
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
      database.addEventListener('versionchange', () => database.close())
      resolve(database)
    }, { once: true })
    request.addEventListener('blocked', () => reject(
      new Error('IndexedDB backup database upgrade was blocked')
    ), { once: true })
    request.addEventListener('error', () => reject(
      request.error || new Error('Could not open IndexedDB backup database')
    ), { once: true })
  })
}

async function readBackupEntries(database) {
  const transaction = database.transaction(BACKUP_STORE_NAME, 'readonly')
  const request = transaction.objectStore(BACKUP_STORE_NAME).getAll()
  const [entries] = await Promise.all([
    requestResult(request),
    transactionComplete(transaction)
  ])
  return Array.isArray(entries) ? entries : []
}

async function replaceBackupEntries(database, entries) {
  const transaction = database.transaction(BACKUP_STORE_NAME, 'readwrite')
  const store = transaction.objectStore(BACKUP_STORE_NAME)
  store.clear()
  entries.forEach(entry => store.put(cloneJson(entry)))
  await transactionComplete(transaction)

  const persistedEntries = await readBackupEntries(database)
  if (!stateBackupEntriesMatch(entries, persistedEntries)) {
    throw new Error('IndexedDB backup verification failed')
  }
  return persistedEntries
}

async function writeMigrationMetadata(database, metadata) {
  const transaction = database.transaction(METADATA_STORE_NAME, 'readwrite')
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
  let currentEntries = cloneJson(initialEntries)
  let persistedEntries = cloneJson(initialEntries)
  let currentRevision = 0
  let latestOperation = Promise.resolve(persistedEntries)

  function scheduleWrite(entries) {
    const snapshot = cloneJson(entries)
    const revision = currentRevision + 1
    currentRevision = revision
    currentEntries = snapshot

    const operation = latestOperation
      .catch(() => {})
      .then(() => replaceBackupEntries(database, snapshot))
      .then(writtenEntries => {
        persistedEntries = cloneJson(writtenEntries)
        return writtenEntries
      })
      .catch(error => {
        if (revision === currentRevision) {
          currentEntries = cloneJson(persistedEntries)
        }
        throw error
      })
    latestOperation = operation
    void operation.catch(() => {})
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
      scheduleWrite([])
      try { legacyStorage.removeItem(backupKey) } catch {}
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
    const legacy = parseLegacyStateBackupEntries(
      legacyStorage.getItem(backupKey),
      isValidEntry
    )
    const indexedEntries = await readBackupEntries(database)
    if (!indexedEntries.every(isValidEntry)) {
      throw new Error('IndexedDB contains an invalid state backup')
    }
    const mergedEntries = legacy.valid
      ? mergeStateBackupEntries(indexedEntries, legacy.entries)
      : mergeStateBackupEntries(indexedEntries)
    const verifiedEntries = await replaceBackupEntries(database, mergedEntries)
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
        if (cleanupAuthorized !== false) {
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
