import {
  LEARNER_PROFILE_RESOLUTION_STATUSES
} from '../domain/learner-profile-resolution.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function readSingleRpcRow(data) {
  if (Array.isArray(data) && data.length !== 1) return null
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' && !Array.isArray(row) ? row : null
}

function normalizePositiveInteger(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function isTransientCloudStatus(status) {
  return status === 0
    || status === 408
    || status === 425
    || status === 429
    || status >= 500
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false
  const actualKeys = Object.keys(value).sort()
  const sortedExpected = [...expectedKeys].sort()
  return actualKeys.length === sortedExpected.length
    && actualKeys.every((key, index) => key === sortedExpected[index])
}

function isPreparedEnvelope(value) {
  return hasExactKeys(value, [
    'exportedAt',
    'integrity',
    'profile',
    'schema',
    'version'
  ])
    && typeof value.exportedAt === 'string'
    && isIntegrity(value.integrity)
    && isRecord(value.profile)
    && value.schema === 'edenia-portable-learner-profile'
    && value.version === 1
}

function isIntegrity(value) {
  return hasExactKeys(value, ['algorithm', 'byteLength', 'payloadSha256'])
    && value.algorithm === 'SHA-256'
    && Number.isSafeInteger(value.byteLength)
    && value.byteLength > 0
    && /^[A-Za-z0-9_-]{43}$/u.test(value.payloadSha256)
}

function isSyncOperation(value, identity) {
  if (
    !hasExactKeys(value, [
      'activationId',
      'baseRevision',
      'envelope',
      'generation',
      'integrity',
      'nextRetryAt',
      'operationId',
      'ownerId',
      'prepared',
      'profileId',
      'retryCount',
      'revision'
    ])
    || typeof value.activationId !== 'string'
    || !value.activationId
    || !UUID_PATTERN.test(value.operationId)
    || value.ownerId !== identity.ownerId
    || value.profileId !== identity.profileId
    || value.generation !== identity.generation
    || !normalizePositiveInteger(value.baseRevision)
    || value.revision !== value.baseRevision + 1
    || !Number.isSafeInteger(value.retryCount)
    || value.retryCount < 0
    || !Number.isFinite(value.nextRetryAt)
    || value.nextRetryAt < 0
  ) return false
  const isPrepared = isPreparedEnvelope(value.prepared)
    && value.envelope === null
    && isIntegrity(value.integrity)
    && value.prepared.integrity.algorithm === value.integrity.algorithm
    && value.prepared.integrity.byteLength === value.integrity.byteLength
    && value.prepared.integrity.payloadSha256
      === value.integrity.payloadSha256
  const isFinalized = value.prepared === null
    && isRecord(value.envelope)
    && isIntegrity(value.integrity)
    && value.envelope.integrity?.algorithm === value.integrity.algorithm
    && value.envelope.integrity?.byteLength === value.integrity.byteLength
    && value.envelope.integrity?.payloadSha256
      === value.integrity.payloadSha256
  return isPrepared || isFinalized
}

function isSyncRecord(value) {
  const requiredKeys = [
    'acceptedRevision',
    'generation',
    'ownerId',
    'pending',
    'profileId',
    'queued',
    'version'
  ]
  if (
    !hasExactKeys(value, requiredKeys)
      && !hasExactKeys(value, [...requiredKeys, 'protectedConflictIds'])
  ) return false
  const protectedConflictIds = 'protectedConflictIds' in value
    ? value.protectedConflictIds
    : []
  if (
    !Array.isArray(protectedConflictIds)
    || protectedConflictIds.some(
      conflictId => !UUID_PATTERN.test(String(conflictId || ''))
    )
    || new Set(protectedConflictIds).size !== protectedConflictIds.length
    || value.version !== 1
    || !UUID_PATTERN.test(value.ownerId)
    || !UUID_PATTERN.test(value.profileId)
    || !normalizePositiveInteger(value.generation)
    || !normalizePositiveInteger(value.acceptedRevision)
  ) return false
  if (value.pending === null) return value.queued === null
  const identity = {
    generation: value.generation,
    ownerId: value.ownerId,
    profileId: value.profileId
  }
  if (
    !isSyncOperation(value.pending, identity)
    || value.pending.baseRevision !== value.acceptedRevision
  ) return false
  return value.queued === null || (
    isSyncOperation(value.queued, identity)
    && value.queued.baseRevision === value.pending.revision
  )
}

function isAcceptedOperationReceipt(row, operation, envelope, statuses) {
  return statuses.includes(row?.status)
    && row.profile_id === operation.profileId
    && normalizePositiveInteger(row.generation) === operation.generation
    && normalizePositiveInteger(row.base_revision) === operation.baseRevision
    && normalizePositiveInteger(row.revision) === operation.revision
    && row.payload_sha256 === envelope?.integrity?.payloadSha256
}

export function createLearnerProfileCloudPersistenceAdapter({
  clearOnboardingDraft,
  createOnboardingEnvelope,
  createOperationId,
  eventTarget,
  finalizeEnvelope,
  getClient,
  importEnvelope,
  isOnline,
  now,
  prepareEnvelope,
  readOnboardingState,
  setTimer,
  storage,
  syncStorageKey,
  verifyEnvelope
}) {
  if (
    typeof clearOnboardingDraft !== 'function'
    || typeof createOnboardingEnvelope !== 'function'
    || typeof createOperationId !== 'function'
    || !eventTarget?.addEventListener
    || !eventTarget?.removeEventListener
    || typeof finalizeEnvelope !== 'function'
    || typeof getClient !== 'function'
    || typeof importEnvelope !== 'function'
    || typeof isOnline !== 'function'
    || typeof now !== 'function'
    || typeof prepareEnvelope !== 'function'
    || typeof readOnboardingState !== 'function'
    || typeof setTimer !== 'function'
    || !storage
    || typeof syncStorageKey !== 'string'
    || !syncStorageKey
    || typeof verifyEnvelope !== 'function'
  ) {
    throw new TypeError('Learner-profile cloud persistence requires adapters')
  }
  let activeBinding = null
  let inFlight = false
  let retryTimer = null
  let started = false
  let syncState = Object.freeze({ status: 'idle' })
  const listeners = new Set()
  const dirtyStorageKey = `${syncStorageKey}_dirty`

  function publish(status, details = {}) {
    syncState = Object.freeze({ ...details, status })
    for (const listener of listeners) listener(syncState)
    return syncState
  }

  function readSyncRecord() {
    try {
      const serialized = storage.getItem(syncStorageKey)
      if (serialized === null) return null
      const record = JSON.parse(serialized)
      return isSyncRecord(record) ? record : null
    } catch {
      return null
    }
  }

  function hasStoredSyncRecord() {
    try {
      return storage.getItem(syncStorageKey) !== null
    } catch {
      return true
    }
  }

  function writeSyncRecord(record) {
    try {
      storage.setItem(syncStorageKey, JSON.stringify(record))
      return true
    } catch {
      return false
    }
  }

  function readDirtyRecord() {
    try {
      const serialized = storage.getItem(dirtyStorageKey)
      if (serialized === null) return { present: false, record: null }
      const record = JSON.parse(serialized)
      if (
        !hasExactKeys(record, [
          'generation',
          'ownerId',
          'profileId',
          'version'
        ])
        || record.version !== 1
        || !UUID_PATTERN.test(record.ownerId)
        || !UUID_PATTERN.test(record.profileId)
        || !normalizePositiveInteger(record.generation)
      ) return { present: true, record: null }
      return { present: true, record }
    } catch {
      return { present: true, record: null }
    }
  }

  function dirtyRecordMatches(identity, dirty = readDirtyRecord()) {
    return !dirty.present || Boolean(
      dirty.record
      && dirty.record.ownerId === identity?.ownerId
      && dirty.record.profileId === identity?.profileId
      && dirty.record.generation === identity?.generation
    )
  }

  function clearDirtyRecord(identity) {
    const dirty = readDirtyRecord()
    if (!dirty.present) return true
    if (!dirtyRecordMatches(identity, dirty)) return false
    try {
      storage.removeItem(dirtyStorageKey)
      return storage.getItem(dirtyStorageKey) === null
    } catch {
      return false
    }
  }

  function removeDirtyRecord() {
    try {
      storage.removeItem(dirtyStorageKey)
      return storage.getItem(dirtyStorageKey) === null
    } catch {
      return false
    }
  }

  function ensureSyncRecord({ generation, ownerId, profileId, revision }) {
    const current = readSyncRecord()
    if (
      current?.version === 1
      && current.ownerId === ownerId
      && current.profileId === profileId
      && current.generation === generation
    ) return current
    const record = {
      acceptedRevision: revision,
      generation,
      ownerId,
      pending: null,
      profileId,
      queued: null,
      version: 1
    }
    return writeSyncRecord(record) ? record : null
  }

  function getReplacementProtection(localProfile) {
    const record = readSyncRecord()
    const dirty = readDirtyRecord()
    if (
      !record
      || localProfile?.status !== 'ready'
      || record.ownerId !== localProfile.ownerId
      || record.profileId !== localProfile.profileId
      || record.generation !== localProfile.generation
      || !dirtyRecordMatches(record, dirty)
    ) return 'blocked'
    return record.pending || dirty.present ? 'pending' : 'synchronized'
  }

  function commitReplacement(result, transition) {
    if (
      result?.status !== 'activate'
      || result.ownerId !== transition?.nextOwnerId
      || !UUID_PATTERN.test(result.ownerId)
      || !UUID_PATTERN.test(result.profileId)
      || !normalizePositiveInteger(result.generation)
      || !normalizePositiveInteger(result.revision)
      || typeof transition?.previousOwnerId !== 'string'
      || typeof transition?.previousProfileId !== 'string'
      || !['discarded', 'exported', 'synchronized'].includes(
        transition.protection
      )
    ) return false
    const current = readSyncRecord()
    const dirty = readDirtyRecord()
    const requiresSynchronizedCopy = transition.protection === 'synchronized'
    const dirtyBelongsToPrevious = !dirty.record || (
      dirty.record.ownerId === transition.previousOwnerId
      && dirty.record.profileId === transition.previousProfileId
    )
    if (!dirtyBelongsToPrevious) return false
    const previousIdentity = {
      generation: dirty.record?.generation ?? current?.generation,
      ownerId: transition.previousOwnerId,
      profileId: transition.previousProfileId
    }
    if (
      current?.ownerId === result.ownerId
      && current.profileId === result.profileId
      && current.generation === result.generation
      && current.acceptedRevision === result.revision
      && current.pending === null
    ) {
      const cleared = requiresSynchronizedCopy
        ? clearDirtyRecord(previousIdentity)
        : removeDirtyRecord()
      if (!cleared) return false
      activeBinding = null
      publish('idle')
      return true
    }
    if (
      current
      && (
        current.ownerId !== transition.previousOwnerId
        || current.profileId !== transition.previousProfileId
      )
    ) return false
    if (
      requiresSynchronizedCopy
      && (!current || current.pending !== null || dirty.present)
    ) return false
    const committed = writeSyncRecord({
      acceptedRevision: result.revision,
      generation: result.generation,
      ownerId: result.ownerId,
      pending: null,
      profileId: result.profileId,
      queued: null,
      version: 1
    })
    if (!committed) return false
    const cleared = requiresSynchronizedCopy
      ? clearDirtyRecord(previousIdentity)
      : removeDirtyRecord()
    if (!cleared) return false
    activeBinding = null
    publish('idle')
    return true
  }

  function createOperation(profile, record, activationId) {
    const prepared = prepareEnvelope(profile)
    const baseRevision = record.pending
      ? record.pending.baseRevision + 1
      : record.acceptedRevision
    return {
      activationId,
      baseRevision,
      envelope: null,
      generation: record.generation,
      integrity: prepared.integrity,
      nextRetryAt: 0,
      operationId: createOperationId(),
      ownerId: record.ownerId,
      prepared,
      profileId: record.profileId,
      retryCount: 0,
      revision: baseRevision + 1
    }
  }

  function queueProfile(profile, record, activationId) {
    let operation
    try {
      operation = createOperation(profile, record, activationId)
    } catch {
      return false
    }
    if (record.pending) record.queued = operation
    else record.pending = operation
    if (!writeSyncRecord(record)) return false
    return clearDirtyRecord(record)
  }

  function scheduleTransientRetry(operation) {
    const current = readSyncRecord()
    if (current?.pending?.operationId !== operation.operationId) return false
    const retryCount = Math.max(
      0,
      Number(current.pending.retryCount) || 0
    ) + 1
    const delay = Math.min(30_000, 1_000 * (2 ** (retryCount - 1)))
    current.pending.retryCount = retryCount
    current.pending.nextRetryAt = now() + delay
    if (!writeSyncRecord(current)) {
      publish('needs-attention')
      return false
    }
    publish('waiting')
    if (retryTimer === null) {
      retryTimer = setTimer(() => {
        retryTimer = null
        void pump()
      }, delay)
    }
    return true
  }

  function operationParameters(operation, envelope) {
    return {
      p_base_revision: operation.baseRevision,
      p_envelope: envelope,
      p_generation: operation.generation,
      p_operation_id: operation.operationId,
      p_profile_id: operation.profileId
    }
  }

  async function finalizeDurableOperation(operation) {
    if (operation.envelope) {
      const verified = await verifyEnvelope(operation.envelope)
      if (
        !verified
        || verified.integrity?.payloadSha256
          !== operation.integrity?.payloadSha256
      ) throw new TypeError('Durable learner-profile operation is invalid')
      return verified
    }
    const finalized = await finalizeEnvelope(operation.prepared)
    if (
      finalized?.envelope?.integrity?.algorithm
        !== operation.integrity.algorithm
      || finalized?.envelope?.integrity?.byteLength
        !== operation.integrity.byteLength
      || finalized?.envelope?.integrity?.payloadSha256
        !== operation.integrity.payloadSha256
    ) throw new TypeError('Durable learner-profile integrity changed')
    const current = readSyncRecord()
    if (current?.pending?.operationId !== operation.operationId) {
      throw new TypeError('Learner-profile operation lost its fence')
    }
    current.pending.envelope = finalized.envelope
    current.pending.integrity = finalized.envelope.integrity
    current.pending.prepared = null
    if (!writeSyncRecord(current)) {
      throw new TypeError('Learner-profile operation could not be finalized')
    }
    return finalized.envelope
  }

  async function readVerifiedConflict(conflictId, ownerId, activation = null) {
    if (
      !UUID_PATTERN.test(String(conflictId || ''))
      || !UUID_PATTERN.test(String(ownerId || ''))
      || (activation !== null && !isRecord(activation))
    ) return null
    let response
    try {
      response = await getClient().rpc(
        'read_my_learner_profile_conflict',
        { p_conflict_id: conflictId }
      )
    } catch {
      return null
    }
    if (response?.error) return null
    const row = readSingleRpcRow(response?.data)
    const deviceGeneration = normalizePositiveInteger(row?.device_generation)
    const deviceRevision = normalizePositiveInteger(row?.device_revision)
    const cloudGeneration = normalizePositiveInteger(row?.cloud_generation)
    const cloudRevision = normalizePositiveInteger(row?.cloud_revision)
    const status = row?.status
    const selectedSide = status === 'resolved'
      && ['device', 'cloud'].includes(row?.selected_side)
      ? row.selected_side
      : null
    const protectedUntil = status === 'resolved'
      ? Date.parse(String(row?.protected_until || ''))
      : null
    if (row?.conflict_id !== conflictId
      || !UUID_PATTERN.test(String(row.operation_id || ''))
      || !UUID_PATTERN.test(String(row.profile_id || ''))
    ) return null
    if (status === 'expired') {
      return Object.freeze({
        id: conflictId,
        operationId: row.operation_id,
        ownerId,
        profileId: row.profile_id,
        status
      })
    }
    if (
      !['open', 'resolved'].includes(status)
      || !deviceGeneration
      || !deviceRevision
      || !cloudGeneration
      || !cloudRevision
      || (
        status === 'open'
        && (row.selected_side !== null || row.protected_until !== null)
      )
      || (
        status === 'resolved'
        && (!selectedSide || !Number.isFinite(protectedUntil)
          || protectedUntil <= now())
      )
    ) return null
    let deviceEnvelope
    let cloudEnvelope
    try {
      [deviceEnvelope, cloudEnvelope] = await Promise.all([
        verifyEnvelope(row.device_envelope),
        verifyEnvelope(row.cloud_envelope)
      ])
    } catch {
      return null
    }
    if (
      !deviceEnvelope
      || !cloudEnvelope
    ) return null
    const deviceProfile = importEnvelope(deviceEnvelope)
    const cloudProfile = importEnvelope(cloudEnvelope)
    if (!isRecord(deviceProfile) || !isRecord(cloudProfile)) return null
    return Object.freeze({
      activation,
      cloud: Object.freeze({
        envelope: cloudEnvelope,
        generation: cloudGeneration,
        profile: cloudProfile,
        revision: cloudRevision
      }),
      device: Object.freeze({
        envelope: deviceEnvelope,
        generation: deviceGeneration,
        profile: deviceProfile,
        revision: deviceRevision
      }),
      id: conflictId,
      operationId: row.operation_id,
      ownerId,
      profileId: row.profile_id,
      protectedUntil,
      selectedSide,
      status
    })
  }

  async function readPreservedConflict(receipt, operation, activation) {
    if (
      !UUID_PATTERN.test(String(receipt?.conflict_id || ''))
      || !isRecord(operation)
    ) return null
    const conflict = await readVerifiedConflict(
      receipt.conflict_id,
      operation.ownerId,
      activation
    )
    if (
      !['open', 'resolved'].includes(conflict?.status)
      || conflict.operationId !== operation.operationId
      || conflict.profileId !== operation.profileId
      || conflict.device.generation !== operation.generation
      || conflict.device.revision !== operation.revision
      || conflict.cloud.generation
        !== normalizePositiveInteger(receipt.generation)
      || conflict.cloud.revision !== normalizePositiveInteger(receipt.revision)
      || conflict.device.envelope.integrity?.payloadSha256
        !== operation.integrity.payloadSha256
      || conflict.cloud.envelope.integrity?.payloadSha256
        !== receipt.payload_sha256
    ) return null
    return conflict
  }

  async function readResolvedConflict(conflict, selectedSide, protectedUntil) {
    const resolved = await readVerifiedConflict(
      conflict.id,
      conflict.ownerId
    )
    if (
      resolved?.status !== 'resolved'
      || resolved.operationId !== conflict.operationId
      || resolved.profileId !== conflict.profileId
      || resolved.selectedSide !== selectedSide
      || resolved.protectedUntil !== protectedUntil
      || resolved.device.envelope.integrity?.payloadSha256
        !== conflict.device.envelope.integrity?.payloadSha256
      || resolved.cloud.envelope.integrity?.payloadSha256
        !== conflict.cloud.envelope.integrity?.payloadSha256
    ) return null
    return resolved
  }

  async function readRefreshedOpenConflict(conflict) {
    const refreshed = await readVerifiedConflict(
      conflict.id,
      conflict.ownerId,
      conflict.activation || null
    )
    if (
      refreshed?.status !== 'open'
      || refreshed.operationId !== conflict.operationId
      || refreshed.profileId !== conflict.profileId
      || refreshed.device.generation !== conflict.device.generation
      || refreshed.device.revision !== conflict.device.revision
      || refreshed.device.envelope.integrity?.payloadSha256
        !== conflict.device.envelope.integrity?.payloadSha256
    ) return null
    return refreshed
  }

  async function readStoredProtectedConflicts(
    record,
    verifiedConflicts = new Map()
  ) {
    const conflictIds = record?.protectedConflictIds || []
    const conflicts = []
    const retainedIds = []
    for (const conflictId of conflictIds) {
      const conflict = verifiedConflicts.get(conflictId)
        || await readVerifiedConflict(conflictId, record.ownerId)
      if (conflict?.status === 'resolved') {
        conflicts.push(conflict)
        retainedIds.push(conflictId)
      } else if (conflict?.status !== 'expired') {
        return null
      }
    }
    if (retainedIds.length !== conflictIds.length) {
      const current = readSyncRecord()
      if (
        !current
        || JSON.stringify(current.protectedConflictIds || [])
          !== JSON.stringify(conflictIds)
      ) return null
      if (retainedIds.length) current.protectedConflictIds = retainedIds
      else delete current.protectedConflictIds
      if (!writeSyncRecord(current)) return null
    }
    return { conflicts: Object.freeze(conflicts) }
  }

  async function resolvePreservedConflict(receipt, operation) {
    const conflict = await readPreservedConflict(receipt, operation, null)
    if (!conflict) return { status: 'recovering' }
    if (conflict.status === 'open') {
      return { conflict, status: 'conflicting' }
    }
    const recovered = await chooseConflict({
      confirmed: true,
      conflict,
      selectedSide: conflict.selectedSide
    })
    return recovered.status === 'chosen'
      ? {
          created: false,
          generation: recovered.generation,
          ownerId: recovered.ownerId,
          profile: recovered.profile,
          profileId: recovered.profileId,
          protectedConflicts: recovered.protectedConflicts,
          revision: recovered.revision,
          status: 'activate'
        }
      : { status: 'recovering' }
  }

  async function chooseConflict({
    confirmed = false,
    conflict,
    selectedSide
  } = {}) {
    if (confirmed !== true) return { status: 'confirmation-required' }
    if (
      !['device', 'cloud'].includes(selectedSide)
      || !['open', 'resolved'].includes(conflict?.status)
      || (
        conflict.status === 'resolved'
        && conflict.selectedSide !== selectedSide
      )
      || !UUID_PATTERN.test(String(conflict.id || ''))
      || !UUID_PATTERN.test(String(conflict.ownerId || ''))
      || !UUID_PATTERN.test(String(conflict.profileId || ''))
      || !UUID_PATTERN.test(String(conflict.operationId || ''))
    ) return { status: 'recovering' }
    const record = readSyncRecord()
    if (
      !record?.pending
      || record.ownerId !== conflict.ownerId
      || record.profileId !== conflict.profileId
      || record.pending.operationId !== conflict.operationId
    ) return { status: 'recovering' }

    let response
    try {
      response = await getClient().rpc(
        'choose_my_learner_profile_conflict',
        {
          p_confirmed: true,
          p_conflict_id: conflict.id,
          p_selected_side: selectedSide
        }
      )
    } catch {
      return { status: 'recovering' }
    }
    if (response?.error) return { status: 'recovering' }
    const row = readSingleRpcRow(response?.data)
    if (
      row?.status === 'conflict_changed'
      && row.conflict_id === conflict.id
    ) {
      const refreshed = await readRefreshedOpenConflict(conflict)
      return refreshed
        ? { conflict: refreshed, status: 'conflict-changed' }
        : { status: 'recovering' }
    }
    const generation = normalizePositiveInteger(row?.generation)
    const revision = normalizePositiveInteger(row?.revision)
    const protectedUntil = Date.parse(String(row?.protected_until || ''))
    if (
      !['chosen', 'already_chosen'].includes(row?.status)
      || row.conflict_id !== conflict.id
      || row.selected_side !== selectedSide
      || !UUID_PATTERN.test(String(row.profile_id || ''))
      || !generation
      || !revision
      || !Number.isFinite(protectedUntil)
      || protectedUntil <= now()
    ) return { status: 'recovering' }
    let envelope
    try {
      envelope = await verifyEnvelope(row.envelope)
    } catch {
      return { status: 'recovering' }
    }
    const expectedDigest = conflict[selectedSide].envelope
      .integrity?.payloadSha256
    const profile = envelope ? importEnvelope(envelope) : null
    if (
      !envelope
      || envelope.integrity?.payloadSha256 !== expectedDigest
      || !isRecord(profile)
    ) return { status: 'recovering' }
    const protectedConflict = await readResolvedConflict(
      conflict,
      selectedSide,
      protectedUntil
    )
    if (!protectedConflict) return { status: 'recovering' }

    const current = readSyncRecord()
    if (current?.pending?.operationId !== conflict.operationId) {
      return { status: 'recovering' }
    }
    current.acceptedRevision = revision
    current.generation = generation
    current.profileId = row.profile_id
    current.pending = null
    current.protectedConflictIds = [
      ...(current.protectedConflictIds || []).filter(id => id !== conflict.id),
      conflict.id
    ]
    current.queued = null
    if (!writeSyncRecord(current)) return { status: 'recovering' }
    const protectedResult = await readStoredProtectedConflicts(
      current,
      new Map([[conflict.id, protectedConflict]])
    )
    if (!protectedResult) return { status: 'recovering' }
    activeBinding = null
    publish('up-to-date', { conflict: protectedConflict })
    return {
      conflict: protectedConflict,
      generation,
      ownerId: conflict.ownerId,
      profile,
      profileId: row.profile_id,
      protectedConflicts: protectedResult.conflicts,
      protectedUntil,
      revision,
      selectedSide,
      status: 'chosen'
    }
  }

  async function pump() {
    if (inFlight) return
    const binding = activeBinding
    const record = readSyncRecord()
    const operation = record?.pending
    if (
      !operation
      || !binding
      || !binding.isCurrent()
      || operation.activationId !== binding.activation.id
    ) return
    if (!isOnline()) {
      publish('waiting')
      return
    }
    const retryAt = Number(operation.nextRetryAt) || 0
    if (retryAt > now()) {
      publish('waiting')
      if (retryTimer === null) {
        retryTimer = setTimer(() => {
          retryTimer = null
          void pump()
        }, retryAt - now())
      }
      return
    }
    inFlight = true
    publish('syncing')
    let envelope
    try {
      envelope = await finalizeDurableOperation(operation)
    } catch {
      inFlight = false
      if (activeBinding === binding && binding.isCurrent()) {
        publish('needs-attention')
      }
      return
    }
    if (activeBinding !== binding || !binding.isCurrent()) {
      inFlight = false
      if (activeBinding?.isCurrent()) void pump()
      return
    }
    let response
    try {
      response = await getClient().rpc(
        'commit_my_learner_profile',
        operationParameters(operation, envelope)
      )
    } catch {
      inFlight = false
      if (activeBinding !== binding || !binding.isCurrent()) return
      if (isOnline()) scheduleTransientRetry(operation)
      else publish('waiting')
      return
    }
    if (activeBinding !== binding || !binding.isCurrent()) {
      inFlight = false
      if (activeBinding?.isCurrent()) void pump()
      return
    }
    try {
      const row = readSingleRpcRow(response?.data)
      if (response?.error && isTransientCloudStatus(response.status)) {
        scheduleTransientRetry(operation)
      } else if (
        !response?.error
        && isAcceptedOperationReceipt(
          row,
          operation,
          envelope,
          ['accepted', 'already_accepted']
        )
      ) {
        const current = readSyncRecord()
        if (current?.pending?.operationId === operation.operationId) {
          current.acceptedRevision = normalizePositiveInteger(row.revision)
          current.pending = current.queued
          current.queued = null
          if (!writeSyncRecord(current)) {
            publish('needs-attention')
          } else if (
            current.pending === null
            && !clearDirtyRecord(current)
          ) {
            publish('needs-attention')
          } else {
            publish(current.pending ? 'syncing' : 'up-to-date', {
              accepted: {
                activation: binding.activation,
                generation: operation.generation,
                ownerId: operation.ownerId,
                profileId: operation.profileId,
                revision: current.acceptedRevision
              }
            })
          }
        }
      } else if (!response?.error && row?.status === 'conflict') {
        const conflict = await readPreservedConflict(
          row,
          operation,
          binding.activation
        )
        if (activeBinding === binding && binding.isCurrent()) {
          if (conflict) publish('conflicting', { conflict })
          else publish('needs-attention')
        }
      } else {
        publish('needs-attention')
      }
    } catch {
      publish('needs-attention')
    }
    inFlight = false
    const next = readSyncRecord()
    if (next?.pending && next.pending.operationId !== operation.operationId) {
      void pump()
    }
  }

  async function resolve({ authentication, connectivity, localProfile, purpose }) {
    if (connectivity?.status !== 'online') {
      return { status: 'waiting-cloud' }
    }
    if (purpose === 'link-accountless-profile') {
      return { status: 'migrating' }
    }

    let onboardingEnvelope = null
    if (localProfile?.status === 'empty') {
      const onboardingState = readOnboardingState()
      if (onboardingState) {
        onboardingEnvelope = await createOnboardingEnvelope(onboardingState)
      }
    }

    let response
    try {
      response = await getClient().rpc(
        'resolve_my_learner_profile',
        { p_onboarding_profile: onboardingEnvelope }
      )
    } catch {
      return { status: 'waiting-cloud' }
    }
    const { data, error, status } = response || {}
    if (error) {
      return {
        status: isTransientCloudStatus(status)
          ? 'waiting-cloud'
          : 'recovering'
      }
    }

    const row = readSingleRpcRow(data)
    if (!row) return { status: 'recovering' }
    if (
      row.status === LEARNER_PROFILE_RESOLUTION_STATUSES.ACCESS_DISABLED
    ) return { status: 'locked' }
    if (
      row.status === LEARNER_PROFILE_RESOLUTION_STATUSES.ONBOARDING_REQUIRED
    ) {
      return { status: 'waiting-authentication' }
    }
    if (
      row.status === LEARNER_PROFILE_RESOLUTION_STATUSES.RECOVERY_REQUIRED
    ) return { status: 'recovering' }
    if (
      row.status
        === LEARNER_PROFILE_RESOLUTION_STATUSES.VERIFIED_ACCOUNT_REQUIRED
    ) {
      return { status: 'waiting-authentication' }
    }
    if (
      row.status !== LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
    ) return { status: 'recovering' }
    if (typeof row.created !== 'boolean') return { status: 'recovering' }

    const profileId = String(row.profile_id || '')
    const generation = normalizePositiveInteger(row.generation)
    const revision = normalizePositiveInteger(row.revision)
    if (!UUID_PATTERN.test(profileId) || !generation || !revision) {
      return { status: 'recovering' }
    }
    if (row.created && (generation !== 1 || revision !== 1)) {
      return { status: 'recovering' }
    }
    const envelope = await verifyEnvelope(row.envelope)
    const cloudProfile = envelope ? importEnvelope(envelope) : null
    if (!cloudProfile) return { status: 'recovering' }
    if (purpose === 'replace-owner-profile') {
      return {
        created: row.created === true,
        generation,
        ownerId: authentication.userId,
        profile: cloudProfile,
        profileId,
        revision,
        status: 'activate'
      }
    }
    let currentRecord = readSyncRecord()
    if (!currentRecord && hasStoredSyncRecord()) {
      return { status: 'recovering' }
    }
    let profile = cloudProfile
    if (currentRecord) {
      if (
        currentRecord.version !== 1
        || currentRecord.ownerId !== authentication.userId
        || currentRecord.profileId !== profileId
        || currentRecord.generation !== generation
      ) return { status: 'recovering' }
      const dirty = readDirtyRecord()
      if (dirty.present) {
        if (
          !dirtyRecordMatches(currentRecord, dirty)
          || localProfile?.status !== 'ready'
          || localProfile.ownerId !== authentication.userId
          || localProfile.profileId !== profileId
          || !queueProfile(
            localProfile.profile,
            currentRecord,
            `dirty-recovery-${createOperationId()}`
          )
        ) return { status: 'recovering' }
        currentRecord = readSyncRecord()
        if (!currentRecord) return { status: 'recovering' }
      }
      if (currentRecord.pending) {
        if (
          currentRecord.pending.baseRevision !== revision
          && localProfile?.status === 'ready'
          && localProfile.ownerId === authentication.userId
          && localProfile.profileId === profileId
        ) {
          let pendingEnvelope
          let receiptResponse
          try {
            pendingEnvelope = await finalizeDurableOperation(
              currentRecord.pending
            )
            receiptResponse = await getClient().rpc(
              'commit_my_learner_profile',
              operationParameters(
                currentRecord.pending,
                pendingEnvelope
              )
            )
          } catch {
            return { status: 'waiting-cloud' }
          }
          currentRecord = readSyncRecord()
          if (!currentRecord?.pending) return { status: 'recovering' }
          const receipt = readSingleRpcRow(receiptResponse?.data)
          if (!receiptResponse?.error && receipt?.status === 'conflict') {
            return resolvePreservedConflict(receipt, currentRecord.pending)
          }
          if (
            receiptResponse?.error
            || !isAcceptedOperationReceipt(
              receipt,
              currentRecord.pending,
              pendingEnvelope,
              ['already_accepted']
            )
          ) return { status: 'conflicting' }
          const acceptedRevision = normalizePositiveInteger(receipt.revision)
          if (acceptedRevision !== revision) {
            const acceptedOperation = currentRecord.pending
            const replayOperation = currentRecord.queued || {
              ...acceptedOperation,
              baseRevision: acceptedRevision,
              envelope: pendingEnvelope,
              integrity: pendingEnvelope.integrity,
              nextRetryAt: 0,
              operationId: createOperationId(),
              prepared: null,
              retryCount: 0,
              revision: acceptedRevision + 1
            }
            currentRecord.acceptedRevision = acceptedRevision
            currentRecord.pending = replayOperation
            currentRecord.queued = null
            if (!writeSyncRecord(currentRecord)) {
              return { status: 'recovering' }
            }
            let replayEnvelope
            let replayResponse
            try {
              replayEnvelope = await finalizeDurableOperation(replayOperation)
              replayResponse = await getClient().rpc(
                'commit_my_learner_profile',
                operationParameters(replayOperation, replayEnvelope)
              )
            } catch {
              return { status: 'waiting-cloud' }
            }
            const replayReceipt = readSingleRpcRow(replayResponse?.data)
            if (!replayResponse?.error
              && replayReceipt?.status === 'conflict') {
              return resolvePreservedConflict(
                replayReceipt,
                readSyncRecord()?.pending
              )
            }
            return {
              status: replayResponse?.error
                && isTransientCloudStatus(replayResponse.status)
                ? 'waiting-cloud'
                : 'recovering'
            }
          }
          currentRecord.acceptedRevision = acceptedRevision
          currentRecord.pending = currentRecord.queued
          currentRecord.queued = null
          if (!writeSyncRecord(currentRecord)) return { status: 'recovering' }
          profile = localProfile.profile
        } else if (
          localProfile?.status !== 'ready'
          || localProfile.ownerId !== authentication.userId
          || localProfile.profileId !== profileId
        ) return { status: 'conflicting' }
        else profile = localProfile.profile
      } else if (currentRecord.acceptedRevision > revision) {
        return { status: 'conflicting' }
      } else if (currentRecord.acceptedRevision !== revision) {
        currentRecord.acceptedRevision = revision
        if (!writeSyncRecord(currentRecord)) return { status: 'recovering' }
      }
    } else {
      currentRecord = ensureSyncRecord({
        generation,
        ownerId: authentication.userId,
        profileId,
        revision
      })
      if (!currentRecord) return { status: 'recovering' }
    }

    currentRecord = readSyncRecord()
    const protectedResult = await readStoredProtectedConflicts(currentRecord)
    if (!protectedResult) return { status: 'recovering' }

    return {
      created: row.created === true,
      finalize({ isCurrent } = {}) {
        if (typeof isCurrent !== 'function' || !isCurrent()) return false
        return clearOnboardingDraft()
      },
      generation,
      ownerId: authentication.userId,
      profile,
      profileId,
      protectedConflicts: protectedResult.conflicts,
      revision,
      status: 'activate'
    }
  }

  function activate({ activation, generation, isCurrent, revision }) {
    if (
      !isRecord(activation)
      || typeof isCurrent !== 'function'
      || !normalizePositiveInteger(generation)
      || !normalizePositiveInteger(revision)
    ) return false
    activeBinding = { activation, generation, isCurrent, revision }
    const record = readSyncRecord()
    if (
      record?.ownerId !== activation.ownerId
      || record?.profileId !== activation.profileId
      || record?.generation !== generation
    ) {
      publish('needs-attention')
      return false
    }
    const dirty = readDirtyRecord()
    if (!dirtyRecordMatches(record, dirty)) {
      publish('needs-attention')
      return false
    }
    if (record.pending) record.pending.activationId = activation.id
    if (record.queued) record.queued.activationId = activation.id
    if (!writeSyncRecord(record)) {
      publish('needs-attention')
      return false
    }
    publish(
      record.pending
        ? isOnline() ? 'syncing' : 'waiting'
        : dirty.present ? 'needs-attention' : 'up-to-date'
    )
    void pump()
    return true
  }

  function markDirty({ activation, isCurrent } = {}) {
    if (
      !activeBinding
      || activeBinding.activation !== activation
      || typeof isCurrent !== 'function'
      || !isCurrent()
      || !activeBinding.isCurrent()
    ) return false
    const record = readSyncRecord()
    if (
      !record
      || record.ownerId !== activation.ownerId
      || record.profileId !== activation.profileId
      || record.generation !== activeBinding.generation
    ) {
      publish('needs-attention')
      return false
    }
    const dirty = readDirtyRecord()
    if (!dirtyRecordMatches(record, dirty)) {
      publish('needs-attention')
      return false
    }
    try {
      storage.setItem(dirtyStorageKey, JSON.stringify({
        generation: record.generation,
        ownerId: record.ownerId,
        profileId: record.profileId,
        version: 1
      }))
      const written = readDirtyRecord()
      if (!written.present || !dirtyRecordMatches(record, written)) {
        publish('needs-attention')
        return false
      }
      return true
    } catch {
      publish('needs-attention')
      return false
    }
  }

  function save(profile, { activation, isCurrent } = {}) {
    if (
      !activeBinding
      || activeBinding.activation !== activation
      || typeof isCurrent !== 'function'
      || !isCurrent()
      || !activeBinding.isCurrent()
    ) return { status: 'fenced' }
    const record = readSyncRecord()
    if (
      !record
      || record.ownerId !== activation.ownerId
      || record.profileId !== activation.profileId
      || record.generation !== activeBinding.generation
    ) {
      publish('needs-attention')
      return { status: 'needs-attention' }
    }

    if (!queueProfile(profile, record, activation.id)) {
      publish('needs-attention')
      return { status: 'needs-attention' }
    }
    void pump()
    return { status: 'queued' }
  }

  function retry() {
    const record = readSyncRecord()
    if (!record?.pending) return false
    if (!isOnline()) {
      publish('waiting')
      return false
    }
    record.pending.nextRetryAt = 0
    if (!writeSyncRecord(record)) {
      publish('needs-attention')
      return false
    }
    void pump()
    return true
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Learner-profile sync listener must be a function')
    }
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function start() {
    if (started) return syncState
    started = true
    eventTarget.addEventListener('online', retry)
    eventTarget.addEventListener('focus', retry)
    return syncState
  }

  function destroy() {
    if (!started) return
    eventTarget.removeEventListener('online', retry)
    eventTarget.removeEventListener('focus', retry)
    activeBinding = null
    started = false
  }

  return Object.freeze({
    activate,
    chooseConflict,
    commitReplacement,
    destroy,
    getState: () => syncState,
    getReplacementProtection,
    markDirty,
    resolve,
    retry,
    save,
    start,
    subscribe
  })
}
