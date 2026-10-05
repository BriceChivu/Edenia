const STORE = 'profiles'
const HEAD = 'active'
const RECOVERY = 'legacy-recovery'
const BODY = 'active-body'
const HEAD_SCHEMA = 'edenia-profile-head-v2'
const POINTER_SCHEMA = 'edenia-indexed-db-profile-v1'
const CONFLICT = Symbol('conflicting profile changes')

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}
function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function mergeChanges(base, desired, current) {
  if (equal(base, desired)) return current
  if (equal(base, current) || equal(desired, current)) return desired
  // Arrays (including Undo and ordered learner facts) stay atomic. Concurrent
  // edits to the same value require a fresh operation rather than guessing.
  if (!record(base) || !record(desired) || !record(current)) return CONFLICT
  const merged = { ...current }
  for (const key of new Set([...Object.keys(base), ...Object.keys(desired)])) {
    const value = mergeChanges(
      Object.hasOwn(base, key) ? base[key] : undefined,
      Object.hasOwn(desired, key) ? desired[key] : undefined,
      Object.hasOwn(current, key) ? current[key] : undefined
    )
    if (value === CONFLICT) return CONFLICT
    if (value === undefined) delete merged[key]
    else Object.defineProperty(merged, key, { value, enumerable: true, configurable: true, writable: true })
  }
  return merged
}

export function rebaseProfileChanges(base, desired, current) {
  const merged = mergeChanges(base, desired, current)
  return merged === CONFLICT ? null : merged
}

export function isIndexedDbProfilePointer(raw) {
  try { return JSON.parse(raw)?.schema === POINTER_SCHEMA } catch { return false }
}

function complete(transaction) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { transaction.abort() } catch {}
      reject(new Error('Profile transaction timed out'))
    }, 8000)
    transaction.oncomplete = () => { clearTimeout(timeout); resolve() }
    transaction.onabort = () => { clearTimeout(timeout); reject(transaction.error || new Error('Profile transaction aborted')) }
    transaction.onerror = () => { clearTimeout(timeout); reject(transaction.error || new Error('Profile transaction failed')) }
  })
}

function open(indexedDb, name) {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(name, 1)
    let settled = false
    const timeout = setTimeout(() => {
      settled = true
      reject(new Error('Profile database opening timed out'))
    }, 8000)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' })
    request.onerror = () => { clearTimeout(timeout); settled = true; reject(request.error) }
    request.onblocked = () => { clearTimeout(timeout); settled = true; reject(new Error('Profile database opening blocked')) }
    request.onsuccess = () => {
      clearTimeout(timeout)
      if (settled) { request.result.close(); return }
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
  })
}

function splitHead(value) { return value?.schema === HEAD_SCHEMA }
function checkpointFields(state) {
  return { islandRaw: JSON.stringify(state.tinySwordsIsland) ?? null, cityProgress: state.cityProgress ?? null }
}
function replacementFields(previous, revision, replace = false) {
  return replace ? { replacementRevision: revision }
    : previous?.replacementRevision ? { replacementRevision: previous.replacementRevision } : {}
}
function hydrate(head, bodyRaw) {
  if (!splitHead(head)) return head
  if (typeof bodyRaw !== 'string' || !Number.isSafeInteger(head.revision) || head.revision < 1
    || !Number.isSafeInteger(head.bodyRevision) || head.bodyRevision < 1 || head.bodyRevision > head.revision
    || !(head.islandRaw === null || typeof head.islandRaw === 'string')) {
    throw new Error('Invalid durable profile body')
  }
  if (head.islandRaw !== null) JSON.parse(head.islandRaw)
  let raw
  Object.defineProperties(head, {
    bodyRaw: { value: bodyRaw },
    raw: { get() {
      if (raw === undefined) {
        const state = JSON.parse(bodyRaw)
        if (head.islandRaw === null) delete state.tinySwordsIsland
        else state.tinySwordsIsland = JSON.parse(head.islandRaw)
        raw = JSON.stringify(state)
      }
      return raw
    } }
  })
  return head
}
function durableHead(head) {
  return splitHead(head) ? { ...head } : head
}
function sameHead(left, right) {
  return left?.revision === right?.revision && (splitHead(right)
    ? splitHead(left) && left.bodyRevision === right.bodyRevision && left.islandRaw === right.islandRaw
    : left?.raw === right?.raw)
}
// Cache the large, immutable body across island revisions. Warm checkpoints
// neither fetch nor serialize it; complete profile reads compose it lazily.
async function read(database, key = HEAD, cached = null, headOnly = false) {
  const transaction = database.transaction(STORE, 'readonly')
  const finished = complete(transaction)
  const store = transaction.objectStore(STORE)
  const request = store.get(key)
  let result
  request.onsuccess = () => {
    try {
      result = request.result || null
      if (headOnly || !splitHead(result)) return
      if (cached?.bodyRevision === result.bodyRevision && typeof cached.bodyRaw === 'string') {
        result = hydrate(result, cached.bodyRaw)
      } else {
        const body = store.get(BODY)
        body.onsuccess = () => {
          try {
            if (body.result?.revision !== result.bodyRevision) throw new Error('Missing durable profile body')
            result = hydrate(result, body.result.raw)
          } catch { transaction.abort() }
        }
      }
    } catch { transaction.abort() }
  }
  await finished
  return result
}

// The primary profile, its original recovery copy and its revision are owned by
// IndexedDB. localStorage retains only an opening marker and a change signal.
export async function openIndexedDbProfile({
  indexedDb = globalThis.indexedDB, storage, storageKey, accessKey,
  isValidState, eventTarget = globalThis.window, onChange = () => {},
  databaseName = `${storageKey}_profiles_indexed_db_v1`
}) {
  if (!indexedDb) throw new Error('IndexedDB is unavailable')
  const markerKey = `${storageKey}_indexed_db_v1`
  const signalKey = `${markerKey}_revision`
  let database = await open(indexedDb, databaseName)
  let head
  let capturedLegacy
  const validate = record => {
    if (!record) return
    if (!Number.isSafeInteger(record.revision) || record.revision < 1
      || typeof record.raw !== 'string' || !isValidState(JSON.parse(record.raw))) {
      throw new Error('Invalid durable learner profile')
    }
  }
  try {
    const capturedPrimary = storage.getItem(storageKey)
    const pointer = isIndexedDbProfilePointer(capturedPrimary)
    const marker = storage.getItem(markerKey)
    const migrated = marker === '1' || pointer
    capturedLegacy = pointer ? null : capturedPrimary
    const capturedAccess = storage.getItem(accessKey)
    head = await read(database)
    validate(head)
    if ((marker === '1' || pointer) && !head) throw new Error('The migrated learner profile is missing')
    if (!migrated && capturedLegacy !== null) {
      if (!isValidState(JSON.parse(capturedLegacy))) throw new Error('Invalid legacy learner profile')
      if (head && head.raw !== capturedLegacy) throw new Error('Profile migration has conflicting durable copies')
      if (!head) {
        const transaction = database.transaction(STORE, 'readwrite', { durability: 'strict' })
        const finished = complete(transaction)
        const store = transaction.objectStore(STORE)
        const request = store.get(HEAD)
        request.onsuccess = () => {
          try {
            if (storage.getItem(storageKey) !== capturedLegacy || storage.getItem(accessKey) !== capturedAccess
              || (request.result && request.result.raw !== capturedLegacy)) {
              transaction.abort()
              return
            }
            if (!request.result) {
              const record = { key: HEAD, raw: capturedLegacy, revision: 1 }
              store.put(record)
              store.put({ ...record, key: RECOVERY, access: capturedAccess })
            }
          } catch { transaction.abort() }
        }
        await finished
      }
    }
    // Reopening verifies the migration through the same boundary used on reload.
    database.close()
    database = await open(indexedDb, databaseName)
    head = await read(database)
    validate(head)
    if (!migrated && capturedLegacy !== null) {
      if (head?.raw !== capturedLegacy || storage.getItem(storageKey) !== capturedLegacy
        || storage.getItem(accessKey) !== capturedAccess) throw new Error('Profile migration readback failed or became stale')
    }
    const nextMarker = head ? '1' : 'empty'
    try {
      if (storage.getItem(markerKey) !== nextMarker) storage.setItem(markerKey, nextMarker)
    } catch (error) {
      if (!head || capturedPrimary !== storage.getItem(storageKey)
        || storage.getItem(accessKey) !== capturedAccess
        || (!pointer && capturedPrimary !== head.raw)) throw error
      // Replacing the verified legacy value frees quota atomically. A crash
      // before the separate marker is written still leaves an opening pointer.
      storage.setItem(storageKey, JSON.stringify({ schema: POINTER_SCHEMA }))
      storage.setItem(markerKey, '1')
    }
    if (storage.getItem(markerKey) !== nextMarker) throw new Error('Profile opening marker readback failed')
    if ((capturedLegacy !== null && head?.raw === capturedLegacy && storage.getItem(storageKey) === capturedLegacy)
      || isIndexedDbProfilePointer(storage.getItem(storageKey))) {
      // Exact-value comparison prevents deleting a newer legacy-tab write.
      storage.removeItem(storageKey)
    }
  } catch (error) {
    database.close()
    throw error
  }

  let current = head
  let writeQueue = Promise.resolve()
  let refreshQueue = Promise.resolve()
  const revisions = new WeakMap()
  const baselines = new WeakMap()
  const pendingByState = new WeakMap()
  const localRevisions = new Set()
  const listeners = new Set()
  const islandStates = new WeakMap()
  const channel = typeof eventTarget?.BroadcastChannel === 'function'
    ? new eventTarget.BroadcastChannel(databaseName) : null
  function snapshot() {
    if (!current) return null
    const state = JSON.parse(current.raw)
    revisions.set(state, current.revision)
    baselines.set(state, current)
    return state
  }
  function readIslandState() {
    if (!current) return null
    let fields = islandStates.get(current)
    if (!fields) {
      fields = splitHead(current) ? current : checkpointFields(JSON.parse(current.raw))
      islandStates.set(current, fields)
    }
    const state = { cityProgress: structuredClone(fields.cityProgress) }
    if (fields.islandRaw !== null) state.tinySwordsIsland = JSON.parse(fields.islandRaw)
    return state
  }
  async function refresh() {
    refreshQueue = refreshQueue.catch(() => {}).then(async () => {
      const next = await read(database, HEAD, current)
      if (next?.revision === current?.revision) return
      const islandOnly = splitHead(next) && next.bodyRevision === current?.bodyRevision
      const replacement = (next?.replacementRevision || 0) !== (current?.replacementRevision || 0)
      if (!islandOnly) validate(next)
      current = next
      for (const listener of listeners) listener()
      onChange({ islandOnly, replacement })
    })
    return refreshQueue
  }
  function signal() {
    try { storage.setItem(markerKey, current ? '1' : 'empty') } catch {}
    try { storage.setItem(signalKey, String(current?.revision || 0)) } catch {}
    try { channel?.postMessage({ revision: current?.revision || 0 }) } catch {}
  }
  const handleStorage = event => {
    if (event.key === signalKey || event.key === markerKey || event.key === null) void refresh().catch(() => {})
  }
  const handleFocus = () => { void refresh().catch(() => {}) }
  eventTarget?.addEventListener('storage', handleStorage)
  eventTarget?.addEventListener('focus', handleFocus)
  if (channel) channel.onmessage = handleFocus

  async function restoreUnacknowledgedHead(next, previous) {
    const rollback = database.transaction(STORE, 'readwrite', { durability: 'strict' })
    const rolledBack = complete(rollback)
    const store = rollback.objectStore(STORE)
    const latest = store.get(HEAD)
    latest.onsuccess = () => {
      try {
        if (!sameHead(latest.result, next)) return
        if (previous) {
          store.put({ ...durableHead(previous), revision: next.revision + 1 })
          if (splitHead(previous) && previous.bodyRevision !== next.bodyRevision) {
            store.put({ key: BODY, revision: previous.bodyRevision, raw: previous.bodyRaw })
          }
          else if (!splitHead(previous)) store.delete(BODY)
        }
        else store.delete(HEAD)
      } catch { rollback.abort() }
    }
    await rolledBack
    await refresh()
    signal()
  }

  function save(state, { canPersist = () => true, replace = false } = {}) {
    const raw = JSON.stringify(state)
    if (!isValidState(JSON.parse(raw))) return Promise.resolve(false)
    const expectedRevision = revisions.get(state) ?? (replace || !current ? current?.revision || 0 : -1)
    const expectedBaseline = baselines.get(state)
    const capturedAccess = storage.getItem(accessKey)
    const previousOperation = pendingByState.get(state)
    const predecessor = previousOperation?.pending ? previousOperation : null
    const token = { pending: true, revision: null, raw }
    pendingByState.set(state, token)
    const operation = writeQueue.catch(() => {}).then(async () => {
      let next
      let previous
      const baseRevision = predecessor ? predecessor.revision : expectedRevision
      if (baseRevision === null || !canPersist()) return false
      const transaction = database.transaction(STORE, 'readwrite', { durability: 'strict' })
      const finished = complete(transaction)
      const store = transaction.objectStore(STORE)
      const request = store.get(HEAD)
      const apply = latest => {
        try {
          const latestRevision = latest?.revision || 0
          const baseline = predecessor ? predecessor.raw : expectedBaseline?.raw
          let ownInterveningWrites = baseRevision >= 1 && baseline !== undefined && !replace
          for (let revision = baseRevision + 1; ownInterveningWrites && revision <= latestRevision; revision += 1) {
            if (!localRevisions.has(revision)) ownInterveningWrites = false
          }
          if (!canPersist() || storage.getItem(accessKey) !== capturedAccess
            || (latestRevision !== baseRevision && (!ownInterveningWrites || latestRevision < baseRevision))) {
            transaction.abort()
            return
          }
          previous = latest || null
          let nextRaw = raw
          if (baseline !== undefined && previous?.raw !== baseline) {
            if (!ownInterveningWrites) { transaction.abort(); return }
            const merged = rebaseProfileChanges(JSON.parse(baseline), JSON.parse(raw), JSON.parse(previous.raw))
            if (!merged || !isValidState(merged)) { transaction.abort(); return }
            nextRaw = JSON.stringify(merged)
          }
          if (splitHead(previous)) {
            next = hydrate({ key: HEAD, schema: HEAD_SCHEMA, revision: latestRevision + 1,
              bodyRevision: latestRevision + 1, ...checkpointFields(JSON.parse(nextRaw)),
              ...replacementFields(previous, latestRevision + 1, replace) }, nextRaw)
            store.put({ key: BODY, revision: next.bodyRevision, raw: nextRaw })
          } else next = { key: HEAD, raw: nextRaw, revision: latestRevision + 1,
            ...replacementFields(previous, latestRevision + 1, replace) }
          store.put(durableHead(next))
        } catch { transaction.abort() }
      }
      request.onsuccess = () => {
        const latest = request.result
        if (!splitHead(latest)) { apply(latest); return }
        const body = store.get(BODY)
        body.onsuccess = () => {
          try {
            if (body.result?.revision !== latest.bodyRevision) throw new Error('Missing durable profile body')
            apply(hydrate(latest, body.result.raw))
          } catch { transaction.abort() }
        }
      }
      await finished
      let verified
      try { verified = await read(database) } catch {
        await restoreUnacknowledgedHead(next, previous)
        return false
      }
      // A newer transaction can win before readback. Never claim that this
      // snapshot is the latest state or render it over the other tab's update.
      if (!sameHead(verified, next) || verified.raw !== next.raw) {
        await refresh()
        return false
      }
      if (!canPersist() || storage.getItem(accessKey) !== capturedAccess) {
        // Access metadata remains in localStorage. If its fence was lost after
        // commit, undo only our exact head; never replace a newer tab's write.
        await restoreUnacknowledgedHead(next, previous)
        return false
      }
      if (!replace) localRevisions.add(next.revision)
      if (localRevisions.size > 2048) localRevisions.delete(localRevisions.values().next().value)
      current = verified
      // The same live object can have another queued mutation. A caller that
      // awaits this save must render the acknowledged snapshot, not that later
      // mutation. Queued writes already captured their own serialized values.
      for (const key of Object.keys(state)) delete state[key]
      Object.defineProperties(state, Object.getOwnPropertyDescriptors(JSON.parse(next.raw)))
      revisions.set(state, current.revision)
      baselines.set(state, current)
      token.revision = current.revision
      signal()
      return true
    }).catch(async () => {
      try { await refresh() } catch {}
      return false
    })
    void operation.finally(() => { token.pending = false })
    writeQueue = operation
    return operation
  }
  function saveIsland(layout, expected, { canPersist = () => true } = {}) {
    const islandRaw = JSON.stringify(layout)
    const expectedRevision = current?.revision
    const capturedAccess = storage.getItem(accessKey)
    const operation = writeQueue.catch(() => {}).then(async () => {
      if (expectedRevision === undefined || islandRaw === undefined || !canPersist()) return false
      let previous
      let next
      const transaction = database.transaction(STORE, 'readwrite', { durability: 'strict' })
      const finished = complete(transaction)
      const store = transaction.objectStore(STORE)
      const request = store.get(HEAD)
      request.onsuccess = () => {
        try {
          const latest = request.result
          let owned = latest && latest.revision >= expectedRevision
          for (let revision = expectedRevision + 1; owned && revision <= latest.revision; revision += 1) {
            if (!localRevisions.has(revision)) owned = false
          }
          const fields = splitHead(latest) ? latest : latest && checkpointFields(JSON.parse(latest.raw))
          if (!owned || (fields.islandRaw ?? 'absent') !== expected
            || !canPersist() || storage.getItem(accessKey) !== capturedAccess) {
            transaction.abort(); return
          }
          // The queue owns local writes. An external body change cannot pass
          // the revision fence, so the cached body is safe to reuse here.
          previous = splitHead(latest) ? hydrate(latest, current.bodyRaw) : latest
          const bodyRaw = splitHead(previous) ? previous.bodyRaw : previous.raw
          next = hydrate({ key: HEAD, schema: HEAD_SCHEMA, revision: latest.revision + 1,
            bodyRevision: splitHead(latest) ? latest.bodyRevision : latest.revision,
            islandRaw, cityProgress: fields.cityProgress, ...replacementFields(latest) }, bodyRaw)
          if (!splitHead(previous)) store.put({ key: BODY, revision: next.bodyRevision, raw: bodyRaw })
          store.put(durableHead(next))
        } catch { transaction.abort() }
      }
      await finished
      let verified
      try { verified = await read(database, HEAD, null, true) } catch {
        await restoreUnacknowledgedHead(next, previous)
        return false
      }
      if (!sameHead(verified, next)) { await refresh(); return false }
      if (!canPersist() || storage.getItem(accessKey) !== capturedAccess) {
        await restoreUnacknowledgedHead(next, previous)
        return false
      }
      current = hydrate(verified, next.bodyRaw)
      localRevisions.add(next.revision)
      if (localRevisions.size > 2048) localRevisions.delete(localRevisions.values().next().value)
      signal()
      return true
    }).catch(async () => {
      try { await refresh() } catch {}
      return false
    })
    writeQueue = operation
    return operation
  }
  return {
    snapshot,
    readIslandState,
    saveIsland,
    save,
    refresh,
    hasProfile: () => Boolean(current),
    readRaw: () => current?.raw || null,
    adoptSnapshot(state) {
      revisions.set(state, current?.revision || 0)
      baselines.set(state, current)
    },
    inheritRevision(state, source) {
      revisions.set(state, revisions.get(source))
      baselines.set(state, baselines.get(source))
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    close() {
      eventTarget?.removeEventListener('storage', handleStorage)
      eventTarget?.removeEventListener('focus', handleFocus)
      channel?.close()
      database.close()
    }
  }
}
