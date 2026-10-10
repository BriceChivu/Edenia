import { rebaseProfileChanges } from './indexed-db-profile.js'

// A separate copy of the profile and its ownership/sync fences. The original
// namespace is never modified while it is inaccessible. Auth stays independent.
export function createProfileRecoveryWorkspace({
  storageKey, accessKey, keys, getPrimary, getSecondary = () => null,
  capture = () => ({}), onActivate = () => {}, onTierChange = () => {},
  eventTarget, onExternalChange = () => {}, onConflict = () => {}
}) {
  const workspaceKey = `${storageKey}_recovery_workspace_v1`
  const scopedKeys = new Set([storageKey, ...keys])
  let record = null
  let tier = 'none'
  let active = false
  let epoch = 0
  let persistedRaw = null
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
  for (const [name, getter] of [['local', getPrimary], ['session', getSecondary]]) {
    try {
      const saved = JSON.parse(safeRead(getter, workspaceKey))
      if (valid(saved) && (!record || (saved.sequence || 0) > (record.sequence || 0))) {
        record = saved; tier = name; persistedRaw = JSON.stringify(saved)
      }
    } catch {}
  }
  function refreshFromDisk() {
    if (!active || !persistedRaw || tier === 'memory') return
    const raw = safeRead(tier === 'local' ? getPrimary : getSecondary, workspaceKey)
    if (!raw || raw === persistedRaw) return
    try {
      const latest = JSON.parse(raw)
      if ((latest.sequence || 0) < (record.sequence || 0)) return
      if (latest.status === 'archived') {
        active = false
        record = null
        epoch++
        onExternalChange({ retired: true })
      } else if (valid(latest)) {
        record = latest
        persistedRaw = raw
        epoch++
        onExternalChange({ retired: false })
      }
    } catch {}
  }
  eventTarget?.addEventListener('storage', event => {
    if (event.key === workspaceKey) refreshFromDisk()
  })
  function persist() {
    record.sequence = (record.sequence || 0) + 1
    const raw = JSON.stringify(record)
    for (const [name, getter] of [['local', getPrimary], ['session', getSecondary]]) {
      try {
        const target = getter()
        if (!target) continue
        target.setItem(workspaceKey, raw)
        if (target.getItem(workspaceKey) !== raw) continue
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
        persistedRaw = raw
        if (tier !== name) { tier = name; onTierChange(tier) }
        return true
      } catch {}
    }
    if (tier !== 'memory') { tier = 'memory'; onTierChange(tier) }
    return false
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
        originalReplacementRevision: Number.isSafeInteger(seed.replacementRevision) ? seed.replacementRevision : null }
    }
    active = true
    epoch++
    persist()
    onActivate(failure, operation, resumed)
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
      if (active) { record.replacement = true; epoch++; persist() }
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
    save(profile, { canPersist = () => true, replace = false } = {}) {
      const currentRaw = storage.getItem(storageKey)
      if (!active || !canPersist()) return false
      const desiredRaw = JSON.stringify(profile)
      const base = baselines.get(profile)
      let desired = JSON.parse(desiredRaw)
      if (!replace && currentRaw && base !== currentRaw) {
        const merged = base ? rebaseProfileChanges(JSON.parse(base), desired, JSON.parse(currentRaw)) : null
        if (!merged) {
          onConflict({ currentRaw, desiredRaw, epoch })
          return false
        }
        desired = merged
      }
      if (!canPersist()) return false
      storage.setItem(storageKey, JSON.stringify(desired))
      if (replace) storage.recordReplacement()
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
    acceptChoice(chosen, original, { preserveBaseline = false } = {}) {
      record.unchosenProfile = record.values[storageKey]
      if (!preserveBaseline) record.baseline = JSON.stringify(original)
      record.values[storageKey] = JSON.stringify(chosen)
      epoch++
      persist()
    },
    complete() {
      if (!active) return false
      record.status = 'archived'
      if (!persist()) { record.status = 'active'; return false }
      active = false
      record = null
      epoch++
      return true
    }
  }
}
