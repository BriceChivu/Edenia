import { createStorageOperationMonitor } from './storage-operation-diagnostics.js'
import { annotateStorageFailure } from './profile-storage-recovery.js'
import { mergeStudyInsightHistoryChanges } from './study-insights-state.js'
import { mergeActivityLogAdditions } from './activity-log.js'
import { isValidTimestamp } from '../core/date-keys.js'
import { budgetRecentEntries } from './storage-budget.js'

const STORE = 'profiles'
const HEAD = 'active'
const RECOVERY = 'legacy-recovery'
const BODY = 'active-body'
const SYNC_BASE = 'deferred-sync-base'
const SYNC_BASE_BODY = 'deferred-sync-base-body'
const HEAD_SCHEMA = 'edenia-profile-head-v3'
const PREVIOUS_HEAD_SCHEMA = 'edenia-profile-head-v2'
const RECORD_CHECKPOINT_MAX_BYTES = 128 * 1024
const POINTER_SCHEMA = 'edenia-indexed-db-profile-v1'
const CONFLICT = Symbol('conflicting profile changes')

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}
function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function mergeChanges(base, desired, current, path = []) {
  if (equal(base, desired)) return current
  if (equal(base, current) || equal(desired, current)) return desired
  // Loading a disabled Anki profile initializes this missing timestamp. Two
  // observations of the same unset value are compatible; later edits are not.
  if (path.length === 2 && path[0] === 'config' && path[1] === 'ankiDisabledAt'
    && (base === null || base === undefined) && isValidTimestamp(desired) && isValidTimestamp(current)) {
    return new Date(desired) < new Date(current) ? desired : current
  }
  if (path.length === 1 && path[0] === 'activityLog') {
    return mergeActivityLogAdditions(base, desired, current) ?? CONFLICT
  }
  if (path.length === 3 && path[0] === 'config' && path[1] === 'studyInsights' && path[2] === 'history') {
    return mergeStudyInsightHistoryChanges(base, desired, current) ?? CONFLICT
  }
  // Arrays (including Undo and ordered learner facts) stay atomic. Concurrent
  // edits to the same value require a fresh operation rather than guessing.
  if (!record(base) || !record(desired) || !record(current)) return CONFLICT
  const merged = { ...current }
  for (const key of new Set([...Object.keys(base), ...Object.keys(desired)])) {
    const value = mergeChanges(
      Object.hasOwn(base, key) ? base[key] : undefined,
      Object.hasOwn(desired, key) ? desired[key] : undefined,
      Object.hasOwn(current, key) ? current[key] : undefined,
      [...path, key]
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

function profileTransaction(database, ...args) {
  try { return database.transaction(...args) }
  catch (error) { throw annotateStorageFailure(error, 'primary-profile', 'transaction-open') }
}
function complete(transaction) {
  const diagnostic = createStorageOperationMonitor({ storageTarget: 'primary-profile', mode: transaction.mode })
  diagnostic.observe(transaction)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { transaction.abort() } catch (error) {
        // Completion/abort delivery can lag behind the native outcome.
        if (error.name === 'InvalidStateError') return
      }
      reject(diagnostic.failure(new Error('Profile transaction timed out'), 'transaction-complete', 'timeout'))
    }, 8000)
    transaction.oncomplete = () => { clearTimeout(timeout); resolve() }
    transaction.onabort = () => { clearTimeout(timeout); reject(diagnostic.failure(transaction.error || new Error('Profile transaction aborted'), 'transaction-complete', 'abort')) }
    transaction.onerror = event => { clearTimeout(timeout); reject(diagnostic.failure(event.target?.error || transaction.error || new Error('Profile transaction failed'), 'request', 'request-error')) }
  })
}

function openProfileDatabase(indexedDb, name) {
  const diagnostic = createStorageOperationMonitor({ storageTarget: 'primary-profile', mode: 'open' })
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(name, 1)
    diagnostic.observe(request)
    let settled = false
    const timeout = setTimeout(() => {
      settled = true
      reject(diagnostic.failure(new Error('Profile database opening timed out'), 'database-open', 'timeout'))
    }, 8000)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' })
    request.onerror = () => { clearTimeout(timeout); settled = true; reject(diagnostic.failure(request.error, 'database-open', 'database-error')) }
    request.onblocked = () => { clearTimeout(timeout); settled = true; reject(diagnostic.failure(new Error('Profile database opening blocked'), 'database-open', 'database-blocked')) }
    request.onsuccess = () => {
      clearTimeout(timeout)
      if (settled) { request.result.close(); return }
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
  }).catch(error => { throw diagnostic.failure(error, 'database-open', 'database-error') })
}

function splitHead(value) { return [HEAD_SCHEMA, PREVIOUS_HEAD_SCHEMA].includes(value?.schema) }
function safeRecordKey(key) { return typeof key === 'string' && key && !['__proto__', 'prototype', 'constructor'].includes(key) }
function validateRecordCheckpoints(value) {
  if (value === undefined) return
  if (!record(value) || Object.keys(value).some(key => !['videos', 'anki', 'activity'].includes(key))
    || JSON.stringify(value).length * 2 > RECORD_CHECKPOINT_MAX_BYTES) throw new Error('Invalid record checkpoints')
  for (const [kind, entries] of Object.entries(value)) {
    if (!record(entries)) throw new Error('Invalid record checkpoints')
    for (const [key, raw] of Object.entries(entries)) {
      if (!safeRecordKey(key) || !(raw === null || typeof raw === 'string')
        || (raw !== null && !record(JSON.parse(raw)))
        || (kind === 'anki' && !/^\d{4}-\d{2}-\d{2}$/.test(key))) throw new Error('Invalid record checkpoint')
    }
  }
}
function applyRecordCheckpoints(state, checkpoints = {}) {
  for (const kind of ['videos', 'anki']) {
    for (const [key, raw] of Object.entries(checkpoints[kind] || {})) {
      if (raw === null) delete state[kind][key]
      else Object.defineProperty(state[kind], key, { value: JSON.parse(raw), enumerable: true, writable: true, configurable: true })
    }
  }
  if (Object.keys(checkpoints.activity || {}).length) {
    const entries = new Map((state.activityLog || []).map(entry => [entry.id, entry]))
    for (const [key, raw] of Object.entries(checkpoints.activity)) {
      if (raw === null) entries.delete(key)
      else entries.set(key, JSON.parse(raw))
    }
    state.activityLog = budgetRecentEntries([...entries.values()]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 500), { maxBytes: 128 * 1024 })
  }
}
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
  if (head.schema === PREVIOUS_HEAD_SCHEMA && head.recordCheckpoints !== undefined) throw new Error('Unsupported record checkpoints')
  validateRecordCheckpoints(head.recordCheckpoints)
  let raw
  Object.defineProperties(head, {
    bodyRaw: { value: bodyRaw },
    raw: { get() {
      if (raw === undefined) {
        const state = JSON.parse(bodyRaw)
        if (head.islandRaw === null) delete state.tinySwordsIsland
        else state.tinySwordsIsland = JSON.parse(head.islandRaw)
        applyRecordCheckpoints(state, head.recordCheckpoints)
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
      && equal(left.recordCheckpoints, right.recordCheckpoints)
    : left?.raw === right?.raw)
}
// Cache the large, immutable body across island revisions. Warm checkpoints
// neither fetch nor serialize it; complete profile reads compose it lazily.
async function read(database, key = HEAD, cached = null, headOnly = false) {
  const transaction = profileTransaction(database, STORE, 'readonly')
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
  let database = await openProfileDatabase(indexedDb, databaseName)
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
        const transaction = profileTransaction(database, STORE, 'readwrite', { durability: 'strict' })
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
    database = await openProfileDatabase(indexedDb, databaseName)
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
  const pendingRecordsByState = new WeakMap()
  const saveFailures = new WeakMap()
  const islandSaveFailures = new WeakMap()
  const emptyIslandFailureKey = {}
  const localRevisions = new Set()
  const unacknowledgedHeads = new Set()
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
      // Focus can observe our commit before its readback. The writer owns
      // acknowledgment and rollback; this is not another writer's update.
      for (const pendingHead of unacknowledgedHeads) {
        if (equal(durableHead(next), durableHead(pendingHead))) return
      }
      const islandOnly = splitHead(next) && next.bodyRevision === current?.bodyRevision
        && equal(next.recordCheckpoints, current?.recordCheckpoints)
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
    const rollback = profileTransaction(database, STORE, 'readwrite', { durability: 'strict' })
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

  // Retain the pre-edit version in the same transaction as the local edit.
  // Reuse its immutable JSON body: no profile parsing/hashing on island saves.
  function retainSyncBase(store, previous, identity, replaceBody = false, onFailure = () => {}) {
    if (!previous || (!identity && !replaceBody)) return
    const request = store.get(SYNC_BASE)
    request.onsuccess = () => {
      try {
        let base = request.result
        let changed = false
        const bodyRevision = splitHead(previous) ? previous.bodyRevision : previous.revision
        if (identity && !equal(base?.identity, identity)) {
          base = { key: SYNC_BASE, identity, head: splitHead(previous) ? durableHead(previous) : null,
            bodyRevision, copied: false }
          changed = true
        }
        if (!base) return
        // Island writes share the existing immutable body. Copy it only when
        // a whole-profile write is about to replace that body.
        if (replaceBody && !base.copied && base.bodyRevision === bodyRevision) {
          store.put({ key: SYNC_BASE_BODY, revision: bodyRevision,
            raw: splitHead(previous) ? previous.bodyRaw : previous.raw })
          base = { ...base, copied: true }
          changed = true
        }
        if (changed) store.put(base)
      } catch (error) { onFailure(error); store.transaction.abort() }
    }
  }

  async function readSyncBase(identity, { beforeRead = () => true } = {}) {
    const transaction = profileTransaction(database, STORE, 'readonly')
    const finished = complete(transaction)
    const store = transaction.objectStore(STORE)
    const request = store.get(SYNC_BASE)
    let base = null, bodyRaw = null
    request.onsuccess = () => {
      base = request.result
      if (!equal(base?.identity, identity)) return
      const body = store.get(base.copied ? SYNC_BASE_BODY : BODY)
      body.onsuccess = () => { if (body.result?.revision === base.bodyRevision) bodyRaw = body.result.raw }
    }
    await finished
    if (!equal(base?.identity, identity)) return null
    if (bodyRaw === null) return null
    if (!await beforeRead()) return null
    return JSON.parse(base.head ? hydrate(base.head, bodyRaw).raw : bodyRaw)
  }

  async function readDirtyUnits(identity) {
    const transaction = profileTransaction(database, STORE, 'readonly')
    const finished = complete(transaction)
    const store = transaction.objectStore(STORE)
    const baseRequest = store.get(SYNC_BASE)
    const headRequest = store.get(HEAD)
    await finished
    const base = baseRequest.result
    const head = headRequest.result
    if (!equal(base?.identity, identity) || !splitHead(head) || !base.head
      || head.bodyRevision !== base.bodyRevision || head.revision !== current?.revision) return null
    validateRecordCheckpoints(head.recordCheckpoints)
    const changed = kind => [...new Set([
      ...Object.keys(base.head.recordCheckpoints?.[kind] || {}),
      ...Object.keys(head.recordCheckpoints?.[kind] || {})
    ])].filter(key => base.head.recordCheckpoints?.[kind]?.[key] !== head.recordCheckpoints?.[kind]?.[key])
    return { videos: changed('videos'), anki: changed('anki'), island: head.islandRaw !== base.head.islandRaw }
  }

  // Warm study checkpoints serialize only explicitly changed records. The
  // immutable body and its exact before-image use the island checkpoint seam.
  function saveRecords(state, units, { canPersist = () => true, syncBase = null, activityEntries = [] } = {}) {
    saveFailures.delete(state)
    const changes = {}
    try {
      if (!record(units) || Object.keys(units).some(kind => !['videos', 'anki'].includes(kind))) return Promise.resolve(null)
      for (const kind of ['videos', 'anki']) {
        if (units[kind] === undefined) continue
        if (!Array.isArray(units[kind]) || !units[kind].every(safeRecordKey)) return Promise.resolve(null)
        changes[kind] = Object.fromEntries(units[kind].map(key => [key,
          Object.hasOwn(state[kind], key) ? JSON.stringify(state[kind][key]) : null]))
      }
      if (activityEntries.length) changes.activity = Object.fromEntries(activityEntries.map(entry => [entry.id, JSON.stringify(entry)]))
      validateRecordCheckpoints(changes)
    } catch { return Promise.resolve(null) }
    const expectedRevision = revisions.get(state)
    const capturedAccess = storage.getItem(accessKey)
    const token = { head: null }
    const pendingUnits = pendingRecordsByState.get(state) || new Map()
    pendingRecordsByState.set(state, pendingUnits)
    for (const [kind, entries] of Object.entries(changes)) {
      for (const key of Object.keys(entries)) pendingUnits.set(`${kind}:${key}`, token)
    }
    const operation = writeQueue.catch(() => {}).then(async () => {
      if (expectedRevision === undefined || !canPersist()) return false
      let previous, next
      let overflow = false
      const transaction = profileTransaction(database, STORE, 'readwrite', { durability: 'strict' })
      const finished = complete(transaction)
      const store = transaction.objectStore(STORE)
      const request = store.get(HEAD)
      request.onsuccess = () => {
        try {
          const latest = request.result
          let owned = latest && latest.revision >= expectedRevision
          for (let revision = expectedRevision + 1; owned && revision <= latest.revision; revision++) {
            if (!localRevisions.has(revision)) owned = false
          }
          if (!owned || !canPersist() || storage.getItem(accessKey) !== capturedAccess) { transaction.abort(); return }
          previous = splitHead(latest) ? hydrate(latest, current.bodyRaw) : latest
          const initializeBody = !splitHead(previous)
          const bodyRaw = splitHead(previous) ? previous.bodyRaw : previous.raw
          // A legacy unsplit head needs one initial parse. Subsequent records
          // share this body without reading, rewriting or parsing it again.
          const fields = splitHead(previous) ? previous : checkpointFields(JSON.parse(bodyRaw))
          const checkpoints = { ...(fields.recordCheckpoints || {}) }
          for (const [kind, records] of Object.entries(changes)) checkpoints[kind] = { ...(checkpoints[kind] || {}), ...records }
          if (JSON.stringify(checkpoints).length * 2 > RECORD_CHECKPOINT_MAX_BYTES) { overflow = true; return }
          const baseline = splitHead(previous) ? previous : hydrate({ key: HEAD, schema: PREVIOUS_HEAD_SCHEMA,
            revision: latest.revision, bodyRevision: latest.revision, ...fields, ...replacementFields(latest) }, bodyRaw)
          retainSyncBase(store, baseline, syncBase, false, error => saveFailures.set(state, error))
          next = hydrate({ key: HEAD, schema: HEAD_SCHEMA, revision: latest.revision + 1,
            bodyRevision: baseline.bodyRevision, islandRaw: fields.islandRaw, cityProgress: fields.cityProgress,
            recordCheckpoints: checkpoints, ...replacementFields(latest) }, bodyRaw)
          if (initializeBody) {
            store.put({ key: BODY, revision: next.bodyRevision, raw: bodyRaw })
            // A committed conversion may still lose its ownership fence during
            // readback. Its rollback must keep the body referenced by the
            // durable before-image, rather than restoring an unsplit head and
            // deleting that body's only copy.
            previous = baseline
          }
          token.head = next
          unacknowledgedHeads.add(next)
          store.put(durableHead(next))
        } catch (error) { saveFailures.set(state, error); transaction.abort() }
      }
      await finished
      // The caller uses the existing full durable save when the bounded overlay
      // is full. No checkpoint or pending delivery information was removed.
      if (overflow) return null
      let verified
      try { verified = await read(database, HEAD, null, true) } catch (error) {
        saveFailures.set(state, error)
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
      // A preceding full save can restore its captured snapshot while this
      // record is in flight. The latest record acknowledgement reinstalls its
      // immutable units; an older acknowledgement never replaces a newer one.
      const acknowledged = {}
      for (const [kind, entries] of Object.entries(changes)) {
        acknowledged[kind] = Object.fromEntries(Object.entries(entries).filter(([key]) => pendingUnits.get(`${kind}:${key}`) === token))
      }
      applyRecordCheckpoints(state, acknowledged)
      revisions.set(state, current.revision)
      baselines.set(state, current)
      signal()
      return true
    }).catch(async error => {
      if (error?.name !== 'AbortError' && error?.message !== 'Profile transaction aborted') saveFailures.set(state, error)
      try { await refresh() } catch {}
      return false
    })
    void operation.finally(() => {
      unacknowledgedHeads.delete(token.head); token.head = null
      for (const [key, pending] of pendingUnits) if (pending === token) pendingUnits.delete(key)
      if (!pendingUnits.size) pendingRecordsByState.delete(state)
    })
    writeQueue = operation
    return operation
  }

  function save(state, { canPersist = () => true, replace = false, syncBase = null } = {}) {
    saveFailures.delete(state)
    const raw = JSON.stringify(state)
    if (!isValidState(JSON.parse(raw))) return Promise.resolve(false)
    const expectedRevision = revisions.get(state) ?? (replace || !current ? current?.revision || 0 : -1)
    const expectedBaseline = baselines.get(state)
    const capturedAccess = storage.getItem(accessKey)
    const previousOperation = pendingByState.get(state)
    const predecessor = previousOperation?.pending ? previousOperation : null
    const token = { pending: true, revision: null, raw, head: null }
    pendingByState.set(state, token)
    const operation = writeQueue.catch(() => {}).then(async () => {
      let next
      let previous
      const baseRevision = predecessor ? predecessor.revision : expectedRevision
      if (baseRevision === null || !canPersist()) return false
      const transaction = profileTransaction(database, STORE, 'readwrite', { durability: 'strict' })
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
          if (!replace) retainSyncBase(store, previous, syncBase, true, error => saveFailures.set(state, error))
          let nextRaw = raw
          if (baseline !== undefined && previous?.raw !== baseline) {
            if (!ownInterveningWrites) { transaction.abort(); return }
            const merged = rebaseProfileChanges(JSON.parse(baseline), JSON.parse(raw), JSON.parse(previous.raw))
            if (!merged || !isValidState(merged)) { transaction.abort(); return }
            nextRaw = JSON.stringify(merged)
          }
          if (splitHead(previous)) {
            next = hydrate({ key: HEAD, schema: PREVIOUS_HEAD_SCHEMA, revision: latestRevision + 1,
              bodyRevision: latestRevision + 1, ...checkpointFields(JSON.parse(nextRaw)),
              ...replacementFields(previous, latestRevision + 1, replace) }, nextRaw)
            store.put({ key: BODY, revision: next.bodyRevision, raw: nextRaw })
          } else next = { key: HEAD, raw: nextRaw, revision: latestRevision + 1,
            ...replacementFields(previous, latestRevision + 1, replace) }
          token.head = next
          unacknowledgedHeads.add(next)
          store.put(durableHead(next))
        } catch (error) { saveFailures.set(state, error); transaction.abort() }
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
      try { verified = await read(database) } catch (error) {
        saveFailures.set(state, error)
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
    }).catch(async error => {
      if (error?.name !== 'AbortError' && error?.message !== 'Profile transaction aborted') saveFailures.set(state, error)
      try { await refresh() } catch {}
      return false
    })
    void operation.finally(() => {
      token.pending = false
      unacknowledgedHeads.delete(token.head)
      token.head = null
    })
    writeQueue = operation
    return operation
  }
  function saveIsland(layout, expected, { canPersist = () => true, syncBase = null } = {}) {
    const failureKey = layout && typeof layout === 'object' ? layout : emptyIslandFailureKey
    islandSaveFailures.delete(failureKey)
    const islandRaw = JSON.stringify(layout)
    const expectedRevision = current?.revision
    const capturedAccess = storage.getItem(accessKey)
    const token = { head: null }
    const operation = writeQueue.catch(() => {}).then(async () => {
      if (expectedRevision === undefined || islandRaw === undefined || !canPersist()) return false
      let previous
      let next
      const transaction = profileTransaction(database, STORE, 'readwrite', { durability: 'strict' })
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
          retainSyncBase(store, previous, syncBase, false, error => islandSaveFailures.set(failureKey, error))
          const bodyRaw = splitHead(previous) ? previous.bodyRaw : previous.raw
          next = hydrate({ key: HEAD, schema: fields.recordCheckpoints ? HEAD_SCHEMA : PREVIOUS_HEAD_SCHEMA, revision: latest.revision + 1,
            bodyRevision: splitHead(latest) ? latest.bodyRevision : latest.revision,
            islandRaw, cityProgress: fields.cityProgress,
            ...(fields.recordCheckpoints ? { recordCheckpoints: fields.recordCheckpoints } : {}), ...replacementFields(latest) }, bodyRaw)
          if (!splitHead(previous)) store.put({ key: BODY, revision: next.bodyRevision, raw: bodyRaw })
          token.head = next
          unacknowledgedHeads.add(next)
          store.put(durableHead(next))
        } catch (error) { islandSaveFailures.set(failureKey, error); transaction.abort() }
      }
      await finished
      let verified
      try { verified = await read(database, HEAD, null, true) } catch (error) {
        islandSaveFailures.set(failureKey, error)
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
    }).catch(async error => {
      if (error?.name !== 'AbortError' && error?.message !== 'Profile transaction aborted') islandSaveFailures.set(failureKey, error)
      try { await refresh() } catch {}
      return false
    })
    void operation.finally(() => {
      unacknowledgedHeads.delete(token.head)
      token.head = null
    })
    writeQueue = operation
    return operation
  }
  return {
    snapshot,
    readIslandState,
    saveIsland,
    saveRecords,
    readDirtyUnits,
    readSyncBase,
    save,
    getSaveFailure: state => saveFailures.get(state) || null,
    getIslandSaveFailure: layout => islandSaveFailures.get(layout && typeof layout === 'object' ? layout : emptyIslandFailureKey) || null,
    getReplacementRevision: () => current?.replacementRevision || 0,
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
