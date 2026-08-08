export const STATE_BACKUP_LIMIT = 8
export const STATE_BACKUP_AUTO_INTERVAL_MS = 10 * 60_000

export function isValidStateBackupEntry(entry, isValidStateShape) {
  return Boolean(
    entry?.id
    && entry?.createdAt
    && isValidStateShape(entry.state)
  )
}

export function createStateBackupStore({
  storage,
  storageKey,
  stateBackupKey,
  isSandbox,
  isValidStateShape,
  prepareStateForBackup,
  now = () => new Date(),
  random = () => Math.random()
}) {
  function getStateBackupEntries() {
    try {
      const raw = storage.getItem(stateBackupKey)
      const entries = raw ? JSON.parse(raw) : []
      if (!Array.isArray(entries)) return []
      return entries
        .filter(entry => isValidStateBackupEntry(entry, isValidStateShape))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, STATE_BACKUP_LIMIT)
    } catch {
      return []
    }
  }

  function writeStateBackupEntries(entries, { removeOnFailure = true } = {}) {
    let nextEntries = entries.slice(0, STATE_BACKUP_LIMIT)
    while (nextEntries.length) {
      try {
        storage.setItem(stateBackupKey, JSON.stringify(nextEntries))
        return nextEntries
      } catch {
        nextEntries = nextEntries.slice(0, -1)
      }
    }
    if (removeOnFailure) {
      try { storage.removeItem(stateBackupKey) } catch {}
    }
    return []
  }

  function pruneOldestStateBackup({ preserveId = null } = {}) {
    const entries = getStateBackupEntries()
    if (!entries.length) return false
    const pruneIndex = entries.findLastIndex(entry => entry.id !== preserveId)
    if (pruneIndex < 0) return false
    const nextEntries = entries.filter((_, index) => index !== pruneIndex)
    if (!nextEntries.length) {
      try {
        storage.removeItem(stateBackupKey)
        return true
      } catch {
        return false
      }
    }
    const writtenEntries = writeStateBackupEntries(nextEntries, {
      removeOnFailure: false
    })
    return Boolean(
      writtenEntries.length
      && (
        !preserveId
        || writtenEntries.some(entry => entry.id === preserveId)
      )
    )
  }

  function getStoredStateForBackup() {
    try {
      const raw = storage.getItem(storageKey)
      if (!raw) return null
      return prepareStateForBackup(JSON.parse(raw))
    } catch {
      return null
    }
  }

  function createStateBackup(reason = 'automatic backup', options = {}) {
    const { force = false, returnExisting = false } = options
    const state = getStoredStateForBackup()
    if (!state) return null

    const entries = getStateBackupEntries()
    const latest = entries[0]
    const currentDate = now()
    const isAutomatic = reason === 'automatic backup'
    const latestAgeMs = latest
      ? currentDate - new Date(latest.createdAt)
      : Number.POSITIVE_INFINITY
    if (
      !force
      && isAutomatic
      && latest
      && latestAgeMs < STATE_BACKUP_AUTO_INTERVAL_MS
    ) {
      return null
    }

    try {
      if (latest && JSON.stringify(latest.state) === JSON.stringify(state)) {
        return returnExisting ? latest : null
      }
    } catch {}

    const entry = {
      id: `${currentDate.getTime().toString(36)}-${random().toString(36).slice(2, 8)}`,
      createdAt: currentDate.toISOString(),
      reason,
      sandbox: isSandbox,
      state
    }
    const writtenEntries = writeStateBackupEntries([entry, ...entries], {
      removeOnFailure: false
    })
    return writtenEntries.some(writtenEntry => writtenEntry.id === entry.id)
      ? entry
      : null
  }

  function getLatestBackupState() {
    const entry = getStateBackupEntries()[0]
    return entry ? prepareStateForBackup(entry.state) : null
  }

  return {
    createStateBackup,
    getLatestBackupState,
    getStateBackupEntries,
    getStoredStateForBackup,
    pruneOldestStateBackup,
    writeStateBackupEntries
  }
}
