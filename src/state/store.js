export function createStateStore({
  storage,
  storageKey,
  normalizeLoadedState,
  normalizeStateBeforeSave,
  createStateBackup,
  pruneOldestStateBackup,
  saveConfigCookie,
  syncPersistedStateToAnalytics,
  getLatestBackupState,
  loadConfigCookie,
  createDefaultStateFromConfig
}) {
  function saveImportedState(state, {
    preserveBackupId = null,
    syncAnalytics = true
  } = {}, canPersist = () => true) {
    normalizeStateBeforeSave(state)
    const serializedState = JSON.stringify(state)
    let persistenceError = null

    while (true) {
      if (!canPersist()) {
        return { persisted: false, error: null }
      }
      try {
        storage.setItem(storageKey, serializedState)
        persistenceError = null
        break
      } catch (error) {
        persistenceError = error
        if (
          !canPersist()
          || !isStorageQuotaError(error)
          || !pruneOldestStateBackup({ preserveId: preserveBackupId })
        ) break
      }
    }

    const persisted = persistenceError === null
    if (persisted) {
      saveConfigCookie(state.config)
      if (syncAnalytics) syncPersistedStateToAnalytics(state)
    }
    return { persisted, error: persistenceError }
  }

  function saveState(state, options = {}, canPersist = () => true) {
    const {
      backup = true,
      backupReason = 'automatic backup',
      forceBackup = false,
      syncAnalytics = true
    } = options
    normalizeStateBeforeSave(state)
    if (!canPersist()) return false
    if (backup) createStateBackup(backupReason, { force: forceBackup })
    const serializedState = JSON.stringify(state)
    if (!canPersist()) return false
    let persisted = false
    try {
      storage.setItem(storageKey, serializedState)
      persisted = true
    } catch {
      if (!canPersist()) return false
      pruneOldestStateBackup()
      if (!canPersist()) return false
      try {
        storage.setItem(storageKey, serializedState)
        persisted = true
      } catch {}
    }
    saveConfigCookie(state.config)
    if (persisted && syncAnalytics) syncPersistedStateToAnalytics(state)
    return persisted
  }

  function loadState({ persistCleanup = true } = {}) {
    let storageError = false
    try {
      const raw = storage.getItem(storageKey)
      if (raw) {
        const state = JSON.parse(raw)
        const shouldSave = normalizeLoadedState(state)
        if (shouldSave && persistCleanup) {
          saveState(state, {
            backupReason: 'before automatic cleanup',
            forceBackup: true
          })
        }
        return state
      }
    } catch {
      storageError = true
    }

    if (storageError) {
      const recoveredState = getLatestBackupState()
      if (recoveredState) return recoveredState
    }

    const fallback = loadConfigCookie()
    if (fallback) return createDefaultStateFromConfig(fallback)
    return null
  }

  function canPersistLocalState() {
    const probeKey = `${storageKey}_storage_probe`
    try {
      storage.setItem(probeKey, '1')
      const available = storage.getItem(probeKey) === '1'
      storage.removeItem(probeKey)
      return available
    } catch {
      try { storage.removeItem(probeKey) } catch {}
      return false
    }
  }

  return {
    canPersistLocalState,
    loadState,
    saveImportedState,
    saveState
  }
}

export function isStorageQuotaError(error) {
  return Boolean(
    error
    && (
      error.name === 'QuotaExceededError'
      || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || error.code === 22
      || error.code === 1014
    )
  )
}
