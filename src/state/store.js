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
  function saveState(state, options = {}) {
    const {
      backup = true,
      backupReason = 'automatic backup',
      forceBackup = false,
      syncAnalytics = true
    } = options
    normalizeStateBeforeSave(state)
    if (backup) createStateBackup(backupReason, { force: forceBackup })
    let persisted = false
    try {
      storage.setItem(storageKey, JSON.stringify(state))
      persisted = true
    } catch {
      pruneOldestStateBackup()
      try {
        storage.setItem(storageKey, JSON.stringify(state))
        persisted = true
      } catch {}
    }
    saveConfigCookie(state.config)
    if (persisted && syncAnalytics) syncPersistedStateToAnalytics(state)
    return persisted
  }

  function loadState() {
    let storageError = false
    try {
      const raw = storage.getItem(storageKey)
      if (raw) {
        const state = JSON.parse(raw)
        const shouldSave = normalizeLoadedState(state)
        if (shouldSave) {
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
    saveState
  }
}
