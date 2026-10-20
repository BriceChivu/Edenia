import { mapPersistenceResult } from './persistence-result.js'

export function createStateStore({
  storage,
  onPersisted = () => {},
  getRepository = () => null,
  storageKey,
  discardableCacheKeys = [],
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
  function discardReplaceableCaches(canPersist) {
    let reclaimed = false
    for (const key of discardableCacheKeys) {
      if (key === storageKey || !canPersist()) continue
      try {
        if (storage.getItem(key) === null || !canPersist()) continue
        storage.removeItem(key)
        if (storage.getItem(key) === null) reclaimed = true
      } catch {}
    }
    return reclaimed
  }

  function settleNativeWrite(state, raw, canPersist) {
    if (!canPersist()) return false
    const activatedRepository = getRepository()
    if (!activatedRepository) return true
    // A native write can activate asynchronous recovery. Bind this exact
    // candidate, then wait for the repository's available durable journal.
    if (activatedRepository.readRaw() !== raw) return false
    activatedRepository.adoptSnapshot?.(state)
    return activatedRepository.save(state, { canPersist })
  }

  function acknowledge(state, canPersist, { syncAnalytics, replacement = false }) {
    if (!canPersist()) return false
    saveConfigCookie(state.config)
    // Recovery's storage facade can queue another journal write for config.
    // A successful profile write alone does not acknowledge that pending copy.
    return mapPersistenceResult(storage.flush?.() ?? true, persisted => {
      if (!persisted || !canPersist()) return false
      onPersisted(state, { replacement })
      if (syncAnalytics) syncPersistedStateToAnalytics(state)
      return true
    })
  }

  function saveImportedState(state, {
    preserveBackupId = null,
    syncAnalytics = true
  } = {}, canPersist = () => true) {
    normalizeStateBeforeSave(state)
    const repository = getRepository()
    if (repository) {
      return mapPersistenceResult(repository.save(state, { canPersist, replace: true }), persisted => {
        return mapPersistenceResult(persisted && acknowledge(state, canPersist, { replacement: true, syncAnalytics }), saved =>
          ({ persisted: saved, error: saved ? null : new Error('Durable profile save failed') }))
      })
    }
    const serializedState = JSON.stringify(state)
    let persistenceError = null

    while (true) {
      if (!canPersist()) {
        return { persisted: false, error: null }
      }
      try {
        storage.setItem(storageKey, serializedState, { canPersist })
        persistenceError = null
        break
      } catch (error) {
        persistenceError = error
        if (!canPersist() || !isStorageQuotaError(error)) break
        if (discardReplaceableCaches(canPersist)) continue
        if (!pruneOldestStateBackup({ preserveId: preserveBackupId })) break
      }
    }

    if (persistenceError !== null || !canPersist()) return { persisted: false, error: persistenceError }
    storage.recordReplacement?.()
    return mapPersistenceResult(settleNativeWrite(state, serializedState, canPersist), persisted => {
      return mapPersistenceResult(persisted && acknowledge(state, canPersist, { replacement: true, syncAnalytics }), saved =>
        ({ persisted: saved, error: saved ? null : persistenceError || new Error('Durable profile save failed') }))
    })
  }

  function saveState(state, options = {}, canPersist = () => true) {
    const {
      backup = true,
      backupReason = 'automatic backup',
      forceBackup = false,
      syncAnalytics = true,
      pruneBackups = true
    } = options
    normalizeStateBeforeSave(state)
    if (!canPersist()) return false
    const repositoryBeforeBackup = getRepository()
    if (backup) createStateBackup(backupReason, { force: forceBackup })
    const repository = getRepository()
    if (repository) {
      // A backup write can activate recovery before the profile write starts.
      // Carry this in-flight edit onto the captured acknowledged baseline.
      if (repository !== repositoryBeforeBackup) repository.adoptSnapshot?.(state)
      return mapPersistenceResult(repository.save(state, { canPersist, syncBase: options.syncBase }), persisted => {
        return persisted && acknowledge(state, canPersist, { replacement: options.replaceIsland === true, syncAnalytics })
      })
    }
    const serializedState = JSON.stringify(state)
    if (!canPersist()) return false
    let persisted = false
    try {
      storage.setItem(storageKey, serializedState, { canPersist })
      persisted = true
    } catch (error) {
      if (!canPersist()) return false
      if (!isStorageQuotaError(error)) return false
      if (discardReplaceableCaches(canPersist)) {
        if (!canPersist()) return false
        try {
          storage.setItem(storageKey, serializedState, { canPersist })
          persisted = true
        } catch (retryError) {
          if (!isStorageQuotaError(retryError)) return false
        }
      }
      if (!persisted && pruneBackups && canPersist() && pruneOldestStateBackup()) {
        if (!canPersist()) return false
        try {
          storage.setItem(storageKey, serializedState, { canPersist })
          persisted = true
        } catch {}
      }
    }
    if (!persisted) return false
    return mapPersistenceResult(settleNativeWrite(state, serializedState, canPersist), acknowledged => {
      return acknowledged && acknowledge(state, canPersist, { replacement: options.replaceIsland === true, syncAnalytics })
    })
  }

  function loadState({ persistCleanup = true } = {}) {
    let storageError = false
    try {
      let repository = getRepository()
      const raw = repository ? repository.readRaw() : storage.getItem(storageKey)
      repository ||= getRepository()
      if (raw) {
        const state = repository ? repository.snapshot() : JSON.parse(raw)
        const shouldSave = normalizeLoadedState(state)
        if (shouldSave && persistCleanup && !repository) {
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
    if (getRepository()) return true
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
