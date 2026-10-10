import { rebaseProfileChanges } from './indexed-db-profile.js'

// A separate copy of the profile and its ownership/sync fences. The original
// namespace is never modified while it is inaccessible. Auth stays independent.
export function createProfileRecoveryWorkspace({
  storageKey, accessKey, keys, getPrimary, getSecondary = () => null,
  capture = () => ({}), onActivate = () => {}, onTierChange = () => {},
  eventTarget, onExternalChange = () => {}, onConflict = () => {}, onConflictCleared = () => {}
}) {
  const workspaceKey = `${storageKey}_recovery_workspace_v1`
  const scopedKeys = new Set([storageKey, ...keys])
  let record = null
  let archivedRecord = null
  let tier = 'none'
  let active = false
  let epoch = 0
  let persistedRaw = null
  const observedRaw = new Map()
  const safeRead = (getStorage, key) => {
    try { return getStorage()?.getItem(key) ?? null } catch { return null }
  }
  function valid(value) {
    return value?.version === 1 && value.status === 'active'
      && value.values && typeof value.values === 'object'
      && !Array.isArray(value.values)
      && Object.entries(value.values).every(([key, item]) => scopedKeys.has(key) && (item === null || typeof item === 'string'))
      && (value.originalAccess === null || typeof value.originalAccess === 'string')
      && (value.baseline === null || typeof value.baseline === 'string')
  }
  let loaded = null
  for (const [name, getter] of [['local', getPrimary], ['session', getSecondary]]) {
    try {
      const raw = safeRead(getter, workspaceKey)
      observedRaw.set(name, raw)
      const saved = JSON.parse(raw)
      if (valid({ ...saved, status: 'active' }) && ['active', 'archived'].includes(saved.status)
        && (!loaded || (saved.sequence || 0) > (loaded.saved.sequence || 0))) loaded = { name, raw, saved }
    } catch {}
  }
  if (loaded?.saved.status === 'active') {
    record = loaded.saved; tier = loaded.name; persistedRaw = loaded.raw
  } else if (loaded) archivedRecord = loaded.saved
  const pendingConflicts = value => Array.isArray(value?.pendingConflicts)
    ? value.pendingConflicts.filter(item => item && typeof item.id === 'string'
      && typeof item.currentRaw === 'string' && typeof item.desiredRaw === 'string'
      && (item.accessRaw === null || typeof item.accessRaw === 'string')) : []
  let conflictNotificationPending = false
  let notifiedConflict = null
  function notifyPendingConflict() {
    if (conflictNotificationPending) return
    conflictNotificationPending = true
    queueMicrotask(() => {
      conflictNotificationPending = false
      if (!active) return
      const pending = pendingConflicts(record).find(item =>
        item.accessRaw === (record.values[accessKey] ?? null)
        && typeof item.desiredRaw === 'string')
      const currentRaw = record.values[storageKey]
      if (!pending || !currentRaw) {
        if (notifiedConflict) onConflictCleared(notifiedConflict.id)
        notifiedConflict = null
        return
      }
      const signature = JSON.stringify([pending.id, currentRaw, pending.desiredRaw, epoch])
      if (notifiedConflict?.signature === signature) return
      try {
        if (!JSON.parse(pending.desiredRaw) || !JSON.parse(currentRaw)) return
        notifiedConflict = { id: pending.id, signature }
        onConflict({ id: pending.id, currentRaw, desiredRaw: pending.desiredRaw, epoch })
      } catch {}
    })
  }
  function rememberConflict(currentRaw, desiredRaw) {
    record.pendingConflicts = pendingConflicts(record)
    let pending = record.pendingConflicts.find(item => item.desiredRaw === desiredRaw
      && item.accessRaw === (record.values[accessKey] ?? null))
    if (!pending) {
      pending = { id: globalThis.crypto.randomUUID(), currentRaw, desiredRaw,
        accessRaw: record.values[accessKey] ?? null }
      record.pendingConflicts.push(pending)
    }
    persist()
    // Show the current candidate synchronously to retain the repository's save
    // contract. Reopening and external changes notify through a microtask.
    notifiedConflict = { id: pending.id, signature: JSON.stringify([pending.id, currentRaw, desiredRaw, epoch]) }
    onConflict({ id: pending.id, currentRaw, desiredRaw, epoch })
  }
  function protectWorkspace(previous) {
    const { protectedWorkspaces, ...snapshot } = previous
    const retained = [...(Array.isArray(record.protectedWorkspaces) ? record.protectedWorkspaces : []),
      ...(Array.isArray(protectedWorkspaces) ? protectedWorkspaces : []), snapshot]
    record.protectedWorkspaces = [...new Map(retained.map(item => [JSON.stringify(item), item])).values()]
  }
  function refreshFromDisk() {
    if (!active) return
    let newest = null
    for (const [name, getter] of [['local', getPrimary], ['session', getSecondary]]) {
      const raw = safeRead(getter, workspaceKey)
      const changed = raw !== observedRaw.get(name)
      observedRaw.set(name, raw)
      if (!raw || !changed) continue
      try {
        const saved = JSON.parse(raw)
        if (!valid({ ...saved, status: 'active' }) || !['active', 'archived'].includes(saved.status)) continue
        if (!newest || (saved.sequence || 0) > (newest.saved.sequence || 0)) newest = { name, raw, saved }
      } catch {}
    }
    if (!newest || newest.raw === persistedRaw) return
    const { name, raw, saved: latest } = newest
    if (tier !== 'memory' && (latest.sequence || 0) < (record.sequence || 0)) return
    if (tier === 'memory') {
      const previous = record
      let acknowledged = null
      try { acknowledged = JSON.parse(persistedRaw) } catch {}
      const baseRaw = acknowledged?.values?.[storageKey] ?? previous.baseline
      const firstPromotion = previous.originalReplacementRevision === null
        && latest.originalReplacementRevision === 0 && latest.promotion && !latest.replacement
      const sameScope = previous.originalAccess === latest.originalAccess
        && (previous.values[accessKey] ?? null) === (latest.values[accessKey] ?? null)
        && (previous.originalReplacementRevision === latest.originalReplacementRevision || firstPromotion)
        && Boolean(previous.replacement) === Boolean(latest.replacement)
        && (previous.replacementId ?? null) === (latest.replacementId ?? null)
      let merged = null
      try {
        if (sameScope && baseRaw) merged = rebaseProfileChanges(JSON.parse(baseRaw),
          JSON.parse(previous.values[storageKey]), JSON.parse(latest.values[storageKey]))
      } catch {}
      record = latest
      persistedRaw = raw
      tier = name
      epoch++
      record.pendingConflicts = [...new Map([...pendingConflicts(latest),
        ...pendingConflicts(previous)].map(item => [item.id, item])).values()]
      // A peer may have finished promotion while this tab was still in memory.
      // Its acknowledged head becomes the baseline for the remaining edits.
      if (latest.status === 'archived') {
        record.status = 'active'
        record.baseline = latest.values[storageKey]
        record.originalAccess = latest.values[accessKey] ?? null
        record.originalValues = { ...latest.values }
      }
      if (merged) {
        for (const key of scopedKeys) {
          if (key === storageKey || key === accessKey) continue
          const baseline = acknowledged?.values?.[key] ?? previous.originalValues?.[key] ?? null
          const desired = previous.values[key] ?? null
          const current = latest.values[key] ?? null
          if (desired !== baseline && current === baseline) record.values[key] = desired
          else if (desired !== baseline && desired !== current) protectWorkspace(previous)
        }
        record.values[storageKey] = JSON.stringify(merged)
        persist()
      } else {
        protectWorkspace(previous)
        if (sameScope && previous.values[storageKey] && latest.values[storageKey]) {
          rememberConflict(latest.values[storageKey], previous.values[storageKey])
        } else persist()
      }
      onExternalChange({ retired: false })
      notifyPendingConflict()
      return
    }
    if (latest.status === 'archived') {
      archivedRecord = latest
      active = false
      record = null
      epoch++
      onExternalChange({ retired: true })
    } else {
      record = latest
      tier = name
      persistedRaw = raw
      epoch++
      onExternalChange({ retired: false })
      notifyPendingConflict()
    }
  }
  eventTarget?.addEventListener('storage', event => {
    if (event.key === workspaceKey) refreshFromDisk()
  })
  function keepInMemory() {
    if (tier !== 'memory') { tier = 'memory'; onTierChange(tier) }
    notifyPendingConflict()
    return false
  }
  function persist() {
    record.sequence = (record.sequence || 0) + 1
    const raw = JSON.stringify(record)
    for (const [name, getter] of [['local', getPrimary], ['session', getSecondary]]) {
      try {
        const target = getter()
        if (!target) continue
        const before = target.getItem(workspaceKey)
        // Do not replace a peer that changed after the last scope check. Keep
        // this candidate in memory until refresh can reconcile both versions.
        if (before !== (observedRaw.get(name) ?? null)) return keepInMemory()
        target.setItem(workspaceKey, raw)
        const written = target.getItem(workspaceKey)
        if (written !== raw) {
          if (written !== before) return keepInMemory()
          continue
        }
        observedRaw.set(name, raw)
        // A stale fallback must not be replayed after a newer local copy.
        if (name === 'local') {
          try { getSecondary()?.removeItem(workspaceKey) } catch {}
        } else {
          // Quota can leave a small older local record readable but unwritable.
          // Another tab must not replay that stale record as the latest progress.
          try {
            const old = JSON.parse(getPrimary()?.getItem(workspaceKey))
            if (!old || (old.sequence || 0) <= record.sequence) getPrimary()?.removeItem(workspaceKey)
          } catch {}
        }
        const otherName = name === 'local' ? 'session' : 'local'
        observedRaw.set(otherName, safeRead(name === 'local' ? getSecondary : getPrimary, workspaceKey))
        persistedRaw = raw
        if (tier !== name) { tier = name; onTierChange(tier) }
        notifyPendingConflict()
        return true
      } catch {}
    }
    return keepInMemory()
  }
  function activate(seed = capture(), failure = null, operation = 'recovery') {
    if (active) return
    const resumed = Boolean(record)
    if (!record) {
      const values = Object.create(null)
      for (const key of scopedKeys) values[key] = null
      const rawProfile = seed.profile ?? null
      // Without a readable profile, retain the cloud operation ledger but do
      // not invent a profile belonging to the saved owner. Verified cloud
      // opening installs the actual profile into this empty workspace.
      if (rawProfile) {
        for (const key of scopedKeys) values[key] = safeRead(getPrimary, key)
        values[storageKey] = rawProfile
      } else {
        for (const key of seed.preserveKeys || []) {
          if (scopedKeys.has(key)) values[key] = safeRead(getPrimary, key)
        }
      }
      const originalValues = Object.create(null)
      for (const key of scopedKeys) originalValues[key] = safeRead(getPrimary, key)
      record = { version: 1, status: 'active', baseline: Object.hasOwn(seed, 'baseline') ? seed.baseline : rawProfile,
        originalAccess: safeRead(getPrimary, accessKey), originalValues, values,
        originalReplacementRevision: Number.isSafeInteger(seed.replacementRevision) ? seed.replacementRevision : null,
        sequence: archivedRecord?.sequence || 0 }
      if (archivedRecord) protectWorkspace(archivedRecord)
    }
    active = true
    epoch++
    refreshFromDisk()
    if (!active) return
    persist()
    onActivate(failure, operation, resumed)
    notifyPendingConflict()
  }
  const storage = {
    acceptsStorageArea(area) {
      try { return area === getPrimary() || area === getSecondary() } catch { return false }
    },
    getItem(key) {
      refreshFromDisk()
      if (active && scopedKeys.has(key)) return record.values[key] ?? null
      try { return getPrimary().getItem(key) }
      catch (error) {
        if (!scopedKeys.has(key)) throw error
        activate(undefined, error, 'open')
        return record.values[key] ?? null
      }
    },
    setItem(key, value) {
      refreshFromDisk()
      if (!active || !scopedKeys.has(key)) {
        try { getPrimary().setItem(key, value); return }
        catch (error) { if (!scopedKeys.has(key)) throw error; activate(undefined, error, 'save') }
      }
      record.values[key] = String(value)
      epoch++
      persist()
    },
    recordReplacement() {
      refreshFromDisk()
      if (active) { record.replacement = true; record.replacementId = globalThis.crypto.randomUUID(); epoch++; persist() }
    },
    removeItem(key) {
      refreshFromDisk()
      if (!active || !scopedKeys.has(key)) {
        try { getPrimary().removeItem(key); return }
        catch (error) { if (!scopedKeys.has(key)) throw error; activate(undefined, error, 'save') }
      }
      record.values[key] = null
      epoch++
      persist()
    }
  }
  const baselines = new WeakMap()
  const repository = {
    readRaw: () => storage.getItem(storageKey),
    snapshot() {
      const raw = storage.getItem(storageKey)
      if (!raw) return null
      const profile = JSON.parse(raw)
      baselines.set(profile, raw)
      return profile
    },
    save(profile, { canPersist = () => true, replace = false } = {}, attempt = 0) {
      const currentRaw = storage.getItem(storageKey)
      if (!active) return false
      const started = { ...record, values: { ...record.values } }
      if (!canPersist()) return false
      const desiredRaw = JSON.stringify(profile)
      const base = baselines.get(profile)
      let desired = JSON.parse(desiredRaw)
      if (!replace && currentRaw && base !== currentRaw) {
        const merged = base ? rebaseProfileChanges(JSON.parse(base), desired, JSON.parse(currentRaw)) : null
        if (!merged) {
          rememberConflict(currentRaw, desiredRaw)
          return false
        }
        desired = merged
      }
      if (!canPersist()) return false
      refreshFromDisk()
      if (!active) return false
      if ((record.values[accessKey] ?? null) !== (started.values[accessKey] ?? null)
        || record.originalAccess !== started.originalAccess
        || record.originalReplacementRevision !== started.originalReplacementRevision
        || record.replacementId !== started.replacementId) {
        protectWorkspace({ ...started, values: { ...started.values, [storageKey]: desiredRaw } })
        persist()
        return false
      }
      if (record.values[storageKey] !== currentRaw) {
        if (attempt === 0) return repository.save(profile, { canPersist, replace }, 1)
        rememberConflict(record.values[storageKey], desiredRaw)
        return false
      }
      const writeEpoch = epoch
      if (!canPersist() || !active || epoch !== writeEpoch) return false
      // No refreshing storage facade between the final scope fence and this
      // mutation: refreshing there could adopt a different owner and then put
      // the old edit into that owner's profile.
      record.values[storageKey] = JSON.stringify(desired)
      if (replace) { record.replacement = true; record.replacementId = globalThis.crypto.randomUUID() }
      epoch++
      persist()
      for (const key of Object.keys(profile)) delete profile[key]
      Object.defineProperties(profile, Object.getOwnPropertyDescriptors(desired))
      baselines.set(profile, JSON.stringify(desired))
      return true
    },
    inheritRevision(profile, source) { baselines.set(profile, baselines.get(source)) },
    adoptSnapshot(profile) { baselines.set(profile, storage.getItem(storageKey)) }
  }
  return {
    repository, storage, activate, hasPending: () => Boolean(record),
    isActive: () => active, getTier: () => tier,
    getOriginalAccess: () => record?.originalAccess ?? null,
    acceptsOriginalMetadata(key, value) {
      return value === (record?.originalValues?.[key] ?? null)
        || (record?.promotion && value === (record.promotion.values[key] ?? null))
    },
    acceptsOriginalProfile(access, raw) {
      return access === record?.originalAccess
        || (record?.promotion && raw === record.promotion.profile)
    },
    markPromotion(profile, { replacementRevision } = {}) {
      if (Number.isSafeInteger(replacementRevision)) record.originalReplacementRevision = replacementRevision
      record.baseline = JSON.stringify(profile)
      record.values[storageKey] = record.baseline
      record.promotion = { profile: record.baseline, values: { ...record.values } }
      epoch++
      return persist()
    },
    getEpoch: () => epoch,
    matches(epochAtStart) {
      refreshFromDisk()
      if (!active || epoch !== epochAtStart) return false
      if (!persistedRaw || tier === 'memory') return true
      const raw = safeRead(tier === 'local' ? getPrimary : getSecondary, workspaceKey)
      return raw === persistedRaw
    },
    merge(original, { replacementRevision } = {}) {
      if (!active) return null
      let recent, base
      try {
        recent = JSON.parse(record.values[storageKey])
        base = JSON.parse(record.baseline)
      } catch { return null }
      if (!recent) return original
      if (JSON.stringify(recent) === JSON.stringify(original)) return recent
      if (record.originalReplacementRevision !== null && replacementRevision !== undefined
        && record.originalReplacementRevision !== replacementRevision) return null
      // A missing baseline cannot prove that either copy's changes are safe.
      if (record.replacement && JSON.stringify(base) !== JSON.stringify(original)) return null
      return base ? rebaseProfileChanges(base, recent, original) : null
    },
    archive(original) {
      if (!active) return false
      record.originalProfile = JSON.stringify(original)
      return persist()
    },
    acceptChoice(chosen, original, { preserveBaseline = false, unchosen, conflictId } = {}) {
      record.unchosenProfile = unchosen === undefined ? record.values[storageKey] : JSON.stringify(unchosen)
      record.pendingConflicts = pendingConflicts(record).filter(item => conflictId
        ? item.id !== conflictId : item.desiredRaw !== JSON.stringify(chosen) && item.currentRaw !== JSON.stringify(chosen))
      if (!preserveBaseline) record.baseline = JSON.stringify(original)
      record.values[storageKey] = JSON.stringify(chosen)
      epoch++
      persist()
      notifyPendingConflict()
    },
    complete() {
      if (!active) return false
      record.status = 'archived'
      if (!persist()) { record.status = 'active'; return false }
      archivedRecord = record
      active = false
      record = null
      epoch++
      return true
    }
  }
}
