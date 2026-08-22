import {
  LEARNER_PROFILE_RECOVERY_REASONS,
  LEARNER_PROFILE_RECOVERY_SOURCES,
  LEARNER_PROFILE_RESOLUTION_STATUSES
} from '../domain/learner-profile-resolution.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const MAX_AUTOMATIC_RETRIES = 5
const RECOVERY_REJECTION_STATUSES = new Set([
  'access_disabled',
  'confirmation_required',
  'recovery_required',
  'verified_account_required'
])

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

function prepareLocalRecoveryCandidate(localProfile, ownerId, prepareEnvelope) {
  if (
    localProfile?.status !== 'ready'
    || localProfile.ownerId !== ownerId
    || !UUID_PATTERN.test(String(localProfile.profileId || ''))
    || !normalizePositiveInteger(localProfile.generation)
    || !normalizePositiveInteger(localProfile.revision)
    || !isRecord(localProfile.profile)
  ) return null
  try {
    const envelope = prepareEnvelope(localProfile.profile)
    return isPreparedEnvelope(envelope) ? {
      envelope,
      generation: localProfile.generation,
      profileId: localProfile.profileId,
      revision: localProfile.revision
    } : null
  } catch {
    return null
  }
}

function readProtectedRecoveryCandidates(data, currentTime) {
  if (!Array.isArray(data)) return null
  const candidates = []
  const seen = new Set()
  for (const row of data) {
    const id = String(row?.candidate_id || '')
    const protectedUntil = Date.parse(String(row?.protected_until || ''))
    if (
      row?.source !== LEARNER_PROFILE_RECOVERY_SOURCES.PROTECTED
      || !UUID_PATTERN.test(id)
      || !Number.isFinite(protectedUntil)
      || protectedUntil <= currentTime
      || seen.has(id)
    ) return null
    seen.add(id)
    candidates.push(Object.freeze({
      id,
      protectedUntil,
      source: LEARNER_PROFILE_RECOVERY_SOURCES.PROTECTED
    }))
  }
  return candidates
}

function isRecoveryOperation(value) {
  if (!hasExactKeys(value, [
    'candidateId',
    'envelope',
    'generation',
    'operationId',
    'ownerId',
    'profileId',
    'revision',
    'source',
    'version'
  ])
    || value.version !== 1
    || !UUID_PATTERN.test(String(value.operationId || ''))
    || !UUID_PATTERN.test(String(value.ownerId || ''))
    || !Object.values(LEARNER_PROFILE_RECOVERY_SOURCES).includes(value.source)
  ) return false
  if (value.source === LEARNER_PROFILE_RECOVERY_SOURCES.PROTECTED) {
    return UUID_PATTERN.test(String(value.candidateId || ''))
      && value.envelope === null
      && value.generation === null
      && value.profileId === null
      && value.revision === null
  }
  return value.candidateId === LEARNER_PROFILE_RECOVERY_SOURCES.LOCAL
    && isPreparedEnvelope(value.envelope)
    && normalizePositiveInteger(value.generation) !== null
    && UUID_PATTERN.test(String(value.profileId || ''))
    && normalizePositiveInteger(value.revision) !== null
}

function isDurableImport(value) {
  return hasExactKeys(value, [
    'baseRevision',
    'generation',
    'operationId',
    'ownerId',
    'profileId',
    'revision',
    'version'
  ])
    && value.version === 1
    && UUID_PATTERN.test(String(value.operationId || ''))
    && UUID_PATTERN.test(String(value.ownerId || ''))
    && UUID_PATTERN.test(String(value.profileId || ''))
    && Boolean(normalizePositiveInteger(value.generation))
    && Boolean(normalizePositiveInteger(value.baseRevision))
    && value.revision === value.baseRevision + 1
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
  let cloudHeadKnown = false
  let inFlight = false
  let retryTimer = null
  let started = false
  let syncState = Object.freeze({ status: 'idle' })
  const listeners = new Set()
  const protectedImports = new WeakMap()
  const dirtyStorageKey = `${syncStorageKey}_dirty`
  const importStorageKey = `${syncStorageKey}_import_v1`
  const recoveryStorageKey = `${syncStorageKey}_recovery`

  function publish(status, details = {}) {
    syncState = Object.freeze({ ...details, status })
    for (const listener of listeners) listener(syncState)
    return syncState
  }

  function waitForCloudHead() {
    cloudHeadKnown = false
    publish('not-yet-backed-up')
    return { status: 'waiting-cloud' }
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

  function readDurableImport() {
    try {
      const serialized = storage.getItem(importStorageKey)
      if (serialized === null) return { present: false, record: null }
      const record = JSON.parse(serialized)
      return {
        present: true,
        record: isDurableImport(record) ? record : null
      }
    } catch {
      return { present: true, record: null }
    }
  }

  function writeDurableImport(record) {
    if (!isDurableImport(record)) return false
    try {
      storage.setItem(importStorageKey, JSON.stringify(record))
      return readDurableImport().record?.operationId === record.operationId
    } catch {
      return false
    }
  }

  function clearDurableImport(operationId) {
    const stored = readDurableImport()
    if (!stored.present) return true
    if (!stored.record || stored.record.operationId !== operationId) {
      return false
    }
    try {
      storage.removeItem(importStorageKey)
      return storage.getItem(importStorageKey) === null
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

  function readRecoveryOperation() {
    try {
      const serialized = storage.getItem(recoveryStorageKey)
      if (serialized === null) return { operation: null, present: false }
      const operation = JSON.parse(serialized)
      return {
        operation: isRecoveryOperation(operation) ? operation : null,
        present: true
      }
    } catch {
      return { operation: null, present: true }
    }
  }

  function writeRecoveryOperation(operation) {
    try {
      storage.setItem(recoveryStorageKey, JSON.stringify(operation))
      return JSON.stringify(readRecoveryOperation().operation)
        === JSON.stringify(operation)
    } catch {
      return false
    }
  }

  function clearRecoveryOperation(operation) {
    const stored = readRecoveryOperation()
    if (
      !stored.present
      || stored.operation?.operationId !== operation.operationId
    ) return !stored.present
    try {
      storage.removeItem(recoveryStorageKey)
      return storage.getItem(recoveryStorageKey) === null
    } catch {
      return false
    }
  }

  async function prepareRecoveryOperation({
    authentication,
    candidate,
    confirmed,
    localProfile
  }) {
    if (
      confirmed !== true
      || !UUID_PATTERN.test(String(authentication?.userId || ''))
      || !Object.values(LEARNER_PROFILE_RECOVERY_SOURCES).includes(
        candidate?.source
      )
      || typeof candidate.id !== 'string'
      || !candidate.id
    ) return null
    const localCandidate = candidate.source === LEARNER_PROFILE_RECOVERY_SOURCES.LOCAL
      ? prepareLocalRecoveryCandidate(
          localProfile,
          authentication.userId,
          prepareEnvelope
        )
      : null
    const stored = readRecoveryOperation()
    if (stored.present) {
      const operation = stored.operation
      if (
        !operation
        || operation.ownerId !== authentication.userId
        || operation.source !== candidate.source
        || operation.candidateId !== candidate.id
      ) return null
      if (candidate.source === LEARNER_PROFILE_RECOVERY_SOURCES.LOCAL) {
        if (
          !localCandidate
          || localCandidate.profileId !== operation.profileId
          || localCandidate.generation !== operation.generation
          || localCandidate.revision !== operation.revision
          || JSON.stringify(localCandidate.envelope.profile)
            !== JSON.stringify(operation.envelope.profile)
        ) return null
      }
      return operation
    }
    let operation
    if (candidate.source === LEARNER_PROFILE_RECOVERY_SOURCES.LOCAL) {
      if (!localCandidate) return null
      let finalized
      try {
        finalized = await finalizeEnvelope(localCandidate.envelope)
      } catch {
        return null
      }
      if (!isPreparedEnvelope(finalized?.envelope)) return null
      operation = {
        candidateId: LEARNER_PROFILE_RECOVERY_SOURCES.LOCAL,
        envelope: finalized.envelope,
        generation: localCandidate.generation,
        operationId: createOperationId(),
        ownerId: authentication.userId,
        profileId: localCandidate.profileId,
        revision: localCandidate.revision,
        source: LEARNER_PROFILE_RECOVERY_SOURCES.LOCAL,
        version: 1
      }
    } else {
      if (!UUID_PATTERN.test(candidate.id)) return null
      operation = {
        candidateId: candidate.id,
        envelope: null,
        generation: null,
        operationId: createOperationId(),
        ownerId: authentication.userId,
        profileId: null,
        revision: null,
        source: LEARNER_PROFILE_RECOVERY_SOURCES.PROTECTED,
        version: 1
      }
    }
    return writeRecoveryOperation(operation) ? operation : null
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
    current.pending.nextRetryAt = retryCount >= MAX_AUTOMATIC_RETRIES
      ? 0
      : now() + delay
    if (!writeSyncRecord(current)) {
      publish('needs-attention')
      return false
    }
    if (retryCount >= MAX_AUTOMATIC_RETRIES) {
      publish('not-backed-up')
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

  function stopAutomaticRetry(operation) {
    const current = readSyncRecord()
    if (current?.pending?.operationId !== operation.operationId) return false
    current.pending.retryCount = MAX_AUTOMATIC_RETRIES
    current.pending.nextRetryAt = 0
    if (!writeSyncRecord(current)) {
      publish('needs-attention')
      return false
    }
    publish('not-backed-up')
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

  function queueLatestActiveProfileIfChanged(acceptedEnvelope) {
    if (
      !activeBinding?.profile
      || !activeBinding.isCurrent()
      || readSyncRecord()?.pending
    ) return false
    let prepared
    try {
      prepared = prepareEnvelope(activeBinding.profile)
    } catch {
      publish('not-backed-up')
      return false
    }
    if (
      JSON.stringify(prepared.profile)
      === JSON.stringify(acceptedEnvelope.profile)
    ) return false
    return save(activeBinding.profile, {
      activation: activeBinding.activation,
      isCurrent: activeBinding.isCurrent
    }).status === 'queued'
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

  async function readRecoveryCandidate({ candidate } = {}) {
    if (
      candidate?.source !== LEARNER_PROFILE_RECOVERY_SOURCES.PROTECTED
      || !UUID_PATTERN.test(String(candidate.id || ''))
      || !Number.isFinite(candidate.protectedUntil)
      || candidate.protectedUntil <= now()
    ) return { status: 'recovering' }
    let response
    try {
      response = await getClient().rpc(
        'read_my_learner_profile_recovery_candidate',
        { p_candidate_id: candidate.id }
      )
    } catch {
      return { status: 'waiting-cloud' }
    }
    if (response?.error) {
      return isTransientCloudStatus(response.status)
        ? { status: 'waiting-cloud' }
        : { status: 'recovering' }
    }
    const row = readSingleRpcRow(response?.data)
    const protectedUntil = Date.parse(String(row?.protected_until || ''))
    if (
      row?.status !== 'available'
      || row.candidate_id !== candidate.id
      || protectedUntil !== candidate.protectedUntil
      || protectedUntil <= now()
    ) return { status: 'recovering' }
    const envelope = await verifyEnvelope(row.envelope)
    const profile = envelope ? importEnvelope(envelope) : null
    return profile && typeof profile === 'object'
      ? { profile, status: 'ready' }
      : { status: 'recovering' }
  }

  async function resolveRecoveryCandidates({
    authentication,
    localProfile,
    reason
  }) {
    let candidatesResponse
    try {
      candidatesResponse = await getClient().rpc(
        'list_my_learner_profile_recovery_candidates',
        {}
      )
    } catch {
      return waitForCloudHead()
    }
    if (candidatesResponse?.error) {
      return isTransientCloudStatus(candidatesResponse.status)
        ? waitForCloudHead()
        : { status: 'recovering' }
    }
    const protectedCandidates = readProtectedRecoveryCandidates(
      candidatesResponse?.data,
      now()
    )
    if (!protectedCandidates) return { status: 'recovering' }
    const candidates = prepareLocalRecoveryCandidate(
      localProfile,
      authentication.userId,
      prepareEnvelope
    )
      ? [Object.freeze({
          id: LEARNER_PROFILE_RECOVERY_SOURCES.LOCAL,
          source: LEARNER_PROFILE_RECOVERY_SOURCES.LOCAL
        })]
      : []
    candidates.push(...protectedCandidates)
    return {
      recovery: Object.freeze({
        candidates: Object.freeze(candidates),
        reason
      }),
      status: 'recovering'
    }
  }

  async function requestRecoveryOperation(operation) {
    let response
    try {
      response = await getClient().rpc('restore_my_learner_profile', {
        p_candidate_id: operation.source === LEARNER_PROFILE_RECOVERY_SOURCES.PROTECTED
          ? operation.candidateId
          : null,
        p_confirmed: true,
        p_envelope: operation.envelope,
        p_generation: operation.generation,
        p_operation_id: operation.operationId,
        p_profile_id: operation.profileId,
        p_revision: operation.revision,
        p_source: operation.source
      })
    } catch {
      return { status: 'waiting-cloud' }
    }
    if (response?.error) {
      return isTransientCloudStatus(response.status)
        ? { status: 'waiting-cloud' }
        : { status: 'rejected' }
    }
    const row = readSingleRpcRow(response?.data)
    if (
      RECOVERY_REJECTION_STATUSES.has(row?.status)
      && row.profile_id === null
      && row.generation === null
      && row.revision === null
      && row.envelope === null
      && row.protected_until === null
    ) return { status: 'rejected' }
    const generation = normalizePositiveInteger(row?.generation)
    const profileId = String(row?.profile_id || '')
    const protectedUntil = Date.parse(String(row?.protected_until || ''))
    const revision = normalizePositiveInteger(row?.revision)
    if (
      !['already_restored', 'restored'].includes(row?.status)
      || !generation
      || !UUID_PATTERN.test(profileId)
      || !Number.isFinite(protectedUntil)
      || protectedUntil <= now()
      || !revision
      || (operation.source === LEARNER_PROFILE_RECOVERY_SOURCES.LOCAL && (
        profileId !== operation.profileId
        || generation !== operation.generation
        || revision <= operation.revision
      ))
    ) return { status: 'recovering' }
    const envelope = await verifyEnvelope(row.envelope)
    const profile = envelope ? importEnvelope(envelope) : null
    if (!profile || typeof profile !== 'object') {
      return { status: 'recovering' }
    }
    return {
      generation,
      profile,
      profileId,
      protectedUntil,
      receiptStatus: row.status,
      revision,
      status: 'restored'
    }
  }

  function recoveryReceiptResult(result) {
    return {
      generation: result.generation,
      profile: result.profile,
      profileId: result.profileId,
      protectedUntil: result.protectedUntil,
      revision: result.revision,
      status: 'restored'
    }
  }

  function commitRecoveryReceipt(operation, result) {
    const current = readSyncRecord()
    const dirty = readDirtyRecord()
    if (
      (hasStoredSyncRecord() && (
        !current
        || current.ownerId !== operation.ownerId
      ))
      || (dirty.present && (
        !dirty.record
        || dirty.record.ownerId !== operation.ownerId
      ))
    ) return false
    const record = {
      acceptedRevision: result.revision,
      generation: result.generation,
      ownerId: operation.ownerId,
      pending: null,
      profileId: result.profileId,
      queued: null,
      version: 1
    }
    if (current?.protectedConflictIds?.length) {
      record.protectedConflictIds = [...current.protectedConflictIds]
    }
    if (
      !writeSyncRecord(record)
      || !removeDirtyRecord()
    ) return false
    activeBinding = null
    cloudHeadKnown = true
    publish('up-to-date')
    return true
  }

  async function resumeRecoveryOperation(ownerId, currentHead) {
    const stored = readRecoveryOperation()
    if (!stored.present) return null
    if (!stored.operation || stored.operation.ownerId !== ownerId) {
      return { status: 'recovering' }
    }
    const result = await requestRecoveryOperation(stored.operation)
    if (result.status === 'rejected') {
      return clearRecoveryOperation(stored.operation)
        ? { status: 'discarded' }
        : { status: 'recovering' }
    }
    if (result.status !== 'restored') return result
    const acceptedHead = result.receiptStatus === 'already_restored'
      ? currentHead
      : result
    if (!commitRecoveryReceipt(stored.operation, acceptedHead)) {
      return { status: 'recovering' }
    }
    return result.receiptStatus === 'already_restored'
      ? { operation: stored.operation, status: 'current' }
      : { ...recoveryReceiptResult(result), operation: stored.operation }
  }

  async function restoreRecoveryCandidate(context = {}) {
    const operation = await prepareRecoveryOperation(context)
    if (!operation) return { status: 'recovering' }
    const result = await requestRecoveryOperation(operation)
    if (result.status === 'rejected') {
      clearRecoveryOperation(operation)
      return { status: 'recovering' }
    }
    if (result.status !== 'restored') return result
    return commitRecoveryReceipt(operation, result)
      ? recoveryReceiptResult(result)
      : { status: 'recovering' }
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
    if (operation.retryCount >= MAX_AUTOMATIC_RETRIES) {
      publish('not-backed-up')
      return
    }
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
        stopAutomaticRetry(operation)
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
            if (!current.pending) {
              queueLatestActiveProfileIfChanged(envelope)
            }
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
        stopAutomaticRetry(operation)
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

  async function recoverDurableImport(authentication, localProfile) {
    const stored = readDurableImport()
    if (!stored.present) return { localProfile, status: 'ready' }
    const durableImport = stored.record
    if (
      !durableImport
      || authentication?.userId !== durableImport.ownerId
    ) return { status: 'recovering' }
    const syncRecord = readSyncRecord()
    if (
      !syncRecord
      || syncRecord.ownerId !== durableImport.ownerId
      || syncRecord.profileId !== durableImport.profileId
      || syncRecord.generation !== durableImport.generation
      || syncRecord.acceptedRevision < durableImport.baseRevision
    ) return { status: 'recovering' }

    const protection = await readProtectedImport(durableImport)
    if (protection.status === 'unavailable') {
      return { status: 'waiting-cloud' }
    }
    if (protection.status === 'not-found') {
      if (!clearDurableImport(durableImport.operationId)) {
        return { status: 'recovering' }
      }
      return localProfile?.revision === durableImport.revision
        ? { status: 'recovering' }
        : { localProfile, status: 'ready' }
    }
    if (!['protected', 'rolled-back'].includes(protection.status)) {
      return { status: 'recovering' }
    }
    const rollback = await rollbackImport(protection.protectedImport)
    if (!['rolled-back', 'already-rolled-back'].includes(rollback.status)) {
      return rollback.status === 'unavailable'
        ? { status: 'waiting-cloud' }
        : { status: 'recovering' }
    }
    const previousProfile = importEnvelope(protection.previousEnvelope)
    if (!isRecord(previousProfile)) return { status: 'recovering' }
    const localAlreadyAdvanced = localProfile?.status === 'ready'
      && localProfile.ownerId === durableImport.ownerId
      && localProfile.profileId === durableImport.profileId
      && localProfile.generation === durableImport.generation
      && Number.isSafeInteger(localProfile.revision)
      && localProfile.revision > rollback.revision
    return {
      localProfile: localAlreadyAdvanced
        ? localProfile
        : {
            generation: durableImport.generation,
            ownerId: durableImport.ownerId,
            profile: previousProfile,
            profileId: durableImport.profileId,
            revision: rollback.revision,
            status: 'ready'
          },
      status: 'restored'
    }
  }

  async function resolve({ authentication, connectivity, localProfile, purpose }) {
    if (connectivity?.status !== 'online') {
      return waitForCloudHead()
    }
    const durableRecovery = await recoverDurableImport(
      authentication,
      localProfile
    )
    if (durableRecovery.status === 'waiting-cloud') {
      return waitForCloudHead()
    }
    if (durableRecovery.status === 'recovering') {
      return { status: 'recovering' }
    }
    localProfile = durableRecovery.localProfile
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
      return waitForCloudHead()
    }
    const { data, error, status } = response || {}
    if (error) {
      return isTransientCloudStatus(status)
        ? waitForCloudHead()
        : { status: 'recovering' }
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
    if (row.status === LEARNER_PROFILE_RESOLUTION_STATUSES.CURRENT_HEAD_MISSING) {
      return resolveRecoveryCandidates({
        authentication,
        localProfile,
        reason: LEARNER_PROFILE_RECOVERY_REASONS.CURRENT_HEAD_MISSING
      })
    }
    if (row.status === LEARNER_PROFILE_RESOLUTION_STATUSES.CURRENT_HEAD_UNUSABLE) {
      return resolveRecoveryCandidates({
        authentication,
        localProfile,
        reason: LEARNER_PROFILE_RECOVERY_REASONS.CURRENT_HEAD_UNUSABLE
      })
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

    let profileId = String(row.profile_id || '')
    let generation = normalizePositiveInteger(row.generation)
    let revision = normalizePositiveInteger(row.revision)
    if (!UUID_PATTERN.test(profileId) || !generation || !revision) {
      return { status: 'recovering' }
    }
    if (row.created && (generation !== 1 || revision !== 1)) {
      return { status: 'recovering' }
    }
    let envelope = await verifyEnvelope(row.envelope)
    let cloudProfile = envelope ? importEnvelope(envelope) : null
    if (!cloudProfile) return { status: 'recovering' }
    let recoveryFinalizationOperation = null
    const resumedRecovery = await resumeRecoveryOperation(
      authentication.userId,
      { generation, profile: cloudProfile, profileId, revision }
    )
    if (resumedRecovery?.status === 'waiting-cloud') {
      return waitForCloudHead()
    }
    if (resumedRecovery?.status === 'recovering') {
      return { status: 'recovering' }
    }
    if (resumedRecovery?.status === 'current') {
      recoveryFinalizationOperation = resumedRecovery.operation
    }
    if (resumedRecovery?.status === 'restored') {
      recoveryFinalizationOperation = resumedRecovery.operation
      generation = resumedRecovery.generation
      profileId = resumedRecovery.profileId
      revision = resumedRecovery.revision
      cloudProfile = resumedRecovery.profile
      envelope = prepareEnvelope(cloudProfile)
    }
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
    let backupRequired = localProfile?.status === 'ready'
      && localProfile.ownerId === authentication.userId
      && isRecord(localProfile.profile)
      && localProfile.generation === undefined
      && localProfile.revision === undefined
    let currentRecord = readSyncRecord()
    if (!currentRecord && hasStoredSyncRecord()) {
      return { status: 'recovering' }
    }
    const acceptedRevisionAtStart = currentRecord?.acceptedRevision
    const hadPendingOperation = Boolean(currentRecord?.pending)
    let profile = backupRequired ? localProfile.profile : cloudProfile
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
            return waitForCloudHead()
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

    if (
      !backupRequired
      && !recoveryFinalizationOperation
      && currentRecord
      && !hadPendingOperation
      && acceptedRevisionAtStart === revision
      && localProfile?.status === 'ready'
      && localProfile.ownerId === authentication.userId
      && localProfile.profileId === profileId
      && localProfile.generation === generation
      && isRecord(localProfile.profile)
    ) {
      let localCanonicalProfile = null
      try {
        localCanonicalProfile = prepareEnvelope(localProfile.profile).profile
      } catch {}
      if (
        !localCanonicalProfile
        || JSON.stringify(localCanonicalProfile)
          !== JSON.stringify(envelope.profile)
      ) {
        backupRequired = true
        profile = localProfile.profile
      }
    }

    cloudHeadKnown = true
    return {
      backupRequired,
      created: row.created === true,
      finalize({ isCurrent } = {}) {
        if (typeof isCurrent !== 'function' || !isCurrent()) return false
        if (!clearOnboardingDraft()) return false
        return recoveryFinalizationOperation
          ? clearRecoveryOperation(recoveryFinalizationOperation)
          : true
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

  function activate({ activation, generation, isCurrent, profile, revision }) {
    if (
      !isRecord(activation)
      || typeof isCurrent !== 'function'
    ) return false
    if (
      !normalizePositiveInteger(generation)
      || !normalizePositiveInteger(revision)
    ) {
      if (activation.ownerId && isCurrent() && !cloudHeadKnown) {
        publish('not-yet-backed-up')
      }
      return false
    }
    activeBinding = {
      activation,
      generation,
      isCurrent,
      profile: isRecord(profile) ? profile : null,
      revision
    }
    const record = readSyncRecord()
    if (
      record?.ownerId !== activation.ownerId
      || record?.profileId !== activation.profileId
      || record?.generation !== generation
    ) {
      publish(cloudHeadKnown ? 'needs-attention' : 'not-yet-backed-up')
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
      !cloudHeadKnown
        ? 'not-yet-backed-up'
        : record.pending
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

  async function readProtectedImport(durableImport, expectedEnvelope = null) {
    let response
    try {
      response = await getClient().rpc(
        'read_my_learner_profile_import_backup',
        { p_operation_id: durableImport.operationId }
      )
    } catch {
      return { status: 'unavailable' }
    }
    if (response?.error) {
      return isTransientCloudStatus(response.status)
        ? { status: 'unavailable' }
        : { status: 'failed' }
    }
    const backup = readSingleRpcRow(response?.data)
    if (backup?.status === 'recovery_required') {
      return { status: 'not-found' }
    }
    let previousEnvelope = null
    let importedEnvelope = null
    try {
      previousEnvelope = await verifyEnvelope(backup?.previous_envelope)
      importedEnvelope = await verifyEnvelope(backup?.imported_envelope)
    } catch {}
    const protectedUntil = Date.parse(String(backup?.protected_until || ''))
    const valid = ['protected', 'rolled-back'].includes(backup?.status)
      && backup.operation_id === durableImport.operationId
      && backup.profile_id === durableImport.profileId
      && normalizePositiveInteger(backup.generation)
        === durableImport.generation
      && normalizePositiveInteger(backup.base_revision)
        === durableImport.baseRevision
      && normalizePositiveInteger(backup.imported_revision)
        === durableImport.revision
      && Number.isFinite(protectedUntil)
      && protectedUntil > now()
      && isRecord(previousEnvelope)
      && isRecord(importedEnvelope)
      && (
        !expectedEnvelope
        || importedEnvelope.integrity?.payloadSha256
          === expectedEnvelope.integrity?.payloadSha256
      )
      && isRecord(importEnvelope(previousEnvelope))
      && isRecord(importEnvelope(importedEnvelope))
    if (!valid) return { status: 'failed' }
    return {
      importedEnvelope,
      previousEnvelope,
      protectedImport: {
        baseRevision: durableImport.baseRevision,
        generation: durableImport.generation,
        operationId: durableImport.operationId,
        ownerId: durableImport.ownerId,
        profileId: durableImport.profileId,
        protectedUntil,
        revision: durableImport.revision,
        status: 'protected'
      },
      status: backup.status === 'protected' ? 'protected' : 'rolled-back'
    }
  }

  async function rollbackImport(protectedImport) {
    if (
      !isRecord(protectedImport)
      || !UUID_PATTERN.test(String(protectedImport.operationId || ''))
      || !UUID_PATTERN.test(String(protectedImport.ownerId || ''))
      || !UUID_PATTERN.test(String(protectedImport.profileId || ''))
      || !normalizePositiveInteger(protectedImport.generation)
      || !normalizePositiveInteger(protectedImport.baseRevision)
      || protectedImport.revision !== protectedImport.baseRevision + 1
    ) return { status: 'failed' }
    let response
    try {
      response = await getClient().rpc(
        'rollback_my_learner_profile_import',
        { p_operation_id: protectedImport.operationId }
      )
    } catch {
      return { status: 'unavailable' }
    }
    if (response?.error) {
      return isTransientCloudStatus(response.status)
        ? { status: 'unavailable' }
        : { status: 'failed' }
    }
    const row = readSingleRpcRow(response?.data)
    const revision = normalizePositiveInteger(row?.revision)
    const status = row?.status === 'rolled_back'
      ? 'rolled-back'
      : row?.status === 'already_rolled_back'
        ? 'already-rolled-back'
        : row?.status === 'recovery_required'
          ? 'not-found'
          : row?.status === 'stale_revision'
            ? 'stale-revision'
            : null
    if (
      !status
      || (
        status !== 'not-found'
        && (
          row.profile_id !== protectedImport.profileId
          || normalizePositiveInteger(row.generation)
            !== protectedImport.generation
          || normalizePositiveInteger(row.base_revision)
            !== protectedImport.baseRevision
          || !revision
          || (
            ['rolled-back', 'already-rolled-back'].includes(status)
            && revision !== protectedImport.revision + 1
          )
        )
      )
    ) return { status: 'failed' }
    if (['rolled-back', 'already-rolled-back'].includes(status)) {
      let syncRecordPending = false
      const current = readSyncRecord()
      const matchingSyncRecord = (
        current?.ownerId === protectedImport.ownerId
        && current.profileId === protectedImport.profileId
        && current.generation === protectedImport.generation
        && current.acceptedRevision >= protectedImport.baseRevision
      )
      if (
        matchingSyncRecord
        && current.pending === null
        && current.acceptedRevision <= revision
      ) {
        current.acceptedRevision = revision
        current.queued = null
        syncRecordPending = !writeSyncRecord(current)
      } else if (
        !matchingSyncRecord
        || current.acceptedRevision < revision
        || (
          status === 'rolled-back'
          && current.acceptedRevision > revision
        )
      ) {
        syncRecordPending = true
      }
      const cleanupPending = !clearDurableImport(
        protectedImport.operationId
      )
      protectedImports.delete(protectedImport)
      cloudHeadKnown = true
      publish(
        cleanupPending || syncRecordPending
          ? 'needs-attention'
          : 'up-to-date'
      )
      return {
        ...(cleanupPending ? { cleanupPending: true } : {}),
        revision,
        ...(syncRecordPending ? { syncRecordPending: true } : {}),
        status
      }
    }
    if (status === 'not-found') {
      return clearDurableImport(protectedImport.operationId)
        ? { status }
        : { cleanupPending: true, status }
    }
    return { revision, status }
  }

  async function importProfile(profile, {
    activation,
    confirmed = false,
    isCurrent
  } = {}) {
    const binding = activeBinding
    if (confirmed !== true) return { status: 'confirmation-required' }
    if (
      !isRecord(profile)
      || !binding
      || binding.activation !== activation
      || typeof isCurrent !== 'function'
      || !isCurrent()
      || !binding.isCurrent()
      || !activation?.ownerId
    ) return { status: 'fenced' }
    if (!isOnline()) return { status: 'unavailable' }
    const record = readSyncRecord()
    const dirty = readDirtyRecord()
    if (
      !cloudHeadKnown
      || !record
      || record.ownerId !== activation.ownerId
      || record.profileId !== activation.profileId
      || record.generation !== binding.generation
      || record.acceptedRevision < binding.revision
      || record.pending !== null
      || record.queued !== null
      || dirty.present
    ) return { status: 'protection-required' }
    const priorDurableImport = readDurableImport()
    if (priorDurableImport.present) {
      if (
        !priorDurableImport.record
        || priorDurableImport.record.ownerId !== activation.ownerId
        || priorDurableImport.record.profileId !== activation.profileId
        || priorDurableImport.record.generation !== binding.generation
      ) return { status: 'recovery-required' }
      const rollback = await rollbackImport(priorDurableImport.record)
      if (![
        'rolled-back',
        'already-rolled-back',
        'not-found'
      ].includes(rollback.status)) return { status: 'recovery-required' }
    }

    let envelope
    try {
      const prepared = prepareEnvelope(profile)
      const finalized = await finalizeEnvelope(prepared)
      envelope = finalized?.envelope
      if (!isRecord(envelope)) return { status: 'invalid' }
    } catch {
      return { status: 'invalid' }
    }
    if (
      !isCurrent()
      || activeBinding !== binding
      || !binding.isCurrent()
    ) {
      return { status: 'fenced' }
    }
    const operationId = createOperationId()
    if (!UUID_PATTERN.test(String(operationId || ''))) {
      return { status: 'failed' }
    }
    const baseRevision = record.acceptedRevision
    const durableImport = {
      baseRevision,
      generation: binding.generation,
      operationId,
      ownerId: activation.ownerId,
      profileId: activation.profileId,
      revision: baseRevision + 1,
      version: 1
    }
    if (!writeDurableImport(durableImport)) {
      return { status: 'protection-required' }
    }
    let response = null
    let transportStatus = 'unavailable'
    try {
      response = await getClient().rpc('import_my_learner_profile', {
        p_base_revision: baseRevision,
        p_confirmed: true,
        p_envelope: envelope,
        p_generation: binding.generation,
        p_operation_id: operationId,
        p_profile_id: activation.profileId
      })
    } catch {}
    if (response?.error) {
      if (!isTransientCloudStatus(response.status)) {
        return clearDurableImport(operationId)
          ? { status: 'failed' }
          : { status: 'recovery-required' }
      }
      transportStatus = 'unavailable'
    }
    const row = readSingleRpcRow(response?.data)
    if (row?.status === 'stale_revision') {
      return clearDurableImport(operationId)
        ? { status: 'stale-revision' }
        : { status: 'recovery-required' }
    }
    const protection = await readProtectedImport(durableImport, envelope)
    const protectedImport = protection.protectedImport
    const responseVerified = !row || (
      ['replaced', 'already_replaced'].includes(row.status)
      && row.profile_id === durableImport.profileId
      && normalizePositiveInteger(row.generation)
        === durableImport.generation
      && normalizePositiveInteger(row.base_revision)
        === durableImport.baseRevision
      && normalizePositiveInteger(row.revision) === durableImport.revision
      && row.payload_sha256 === envelope.integrity?.payloadSha256
      && Date.parse(String(row.protected_until || ''))
        === protectedImport?.protectedUntil
    )
    if (protection.status === 'not-found') {
      return clearDurableImport(operationId)
        ? { status: transportStatus }
        : { status: 'recovery-required' }
    }
    if (
      protection.status !== 'protected'
      || !responseVerified
      || !isCurrent()
      || activeBinding !== binding
      || !binding.isCurrent()
    ) {
      const rollback = await rollbackImport(
        protectedImport || durableImport
      )
      return ['rolled-back', 'already-rolled-back'].includes(rollback.status)
        ? {
            status: protection.status === 'protected' && responseVerified
              ? 'fenced'
              : 'backup-failed'
          }
        : { status: 'recovery-required' }
    }
    protectedImports.set(protectedImport, binding)
    return protectedImport
  }

  function confirmImport(protectedImport, { isCurrent } = {}) {
    const binding = isRecord(protectedImport)
      ? protectedImports.get(protectedImport)
      : null
    if (
      !isRecord(protectedImport)
      || protectedImport.status !== 'protected'
      || !binding
      || activeBinding !== binding
      || binding.generation !== protectedImport.generation
      || binding.revision > protectedImport.baseRevision
      || binding.activation.ownerId !== protectedImport.ownerId
      || binding.activation.profileId !== protectedImport.profileId
      || typeof isCurrent !== 'function'
      || !isCurrent()
    ) return false
    const record = readSyncRecord()
    const dirty = readDirtyRecord()
    if (
      !record
      || record.ownerId !== protectedImport.ownerId
      || record.profileId !== protectedImport.profileId
      || record.generation !== protectedImport.generation
      || record.acceptedRevision !== protectedImport.baseRevision
      || record.pending !== null
      || record.queued !== null
      || dirty.present
    ) return false
    record.acceptedRevision = protectedImport.revision
    if (!writeSyncRecord(record)) return false
    if (!clearDurableImport(protectedImport.operationId)) return false
    protectedImports.delete(protectedImport)
    activeBinding = null
    cloudHeadKnown = true
    publish('up-to-date')
    return true
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
      publish('not-backed-up')
      return { status: 'not-backed-up' }
    }
    void pump()
    return { status: 'queued' }
  }

  function resumePendingOperation({ restartBackoff }) {
    const record = readSyncRecord()
    if (!record?.pending) return false
    if (!isOnline()) {
      publish('waiting')
      return false
    }
    record.pending.nextRetryAt = 0
    if (restartBackoff) record.pending.retryCount = 0
    if (!writeSyncRecord(record)) {
      publish('needs-attention')
      return false
    }
    void pump()
    return true
  }

  function retry() {
    return resumePendingOperation({ restartBackoff: true })
  }

  function retryWhenAvailable() {
    const record = readSyncRecord()
    if (record?.pending?.retryCount >= MAX_AUTOMATIC_RETRIES) {
      publish('not-backed-up')
      return false
    }
    return resumePendingOperation({ restartBackoff: false })
  }

  function requiresCloudHeadResolution() {
    return cloudHeadKnown === false
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
    eventTarget.addEventListener('online', retryWhenAvailable)
    eventTarget.addEventListener('focus', retryWhenAvailable)
    return syncState
  }

  function destroy() {
    if (!started) return
    eventTarget.removeEventListener('online', retryWhenAvailable)
    eventTarget.removeEventListener('focus', retryWhenAvailable)
    activeBinding = null
    cloudHeadKnown = false
    started = false
  }

  return Object.freeze({
    activate,
    chooseConflict,
    commitReplacement,
    confirmImport,
    destroy,
    getState: () => syncState,
    requiresCloudHeadResolution,
    getReplacementProtection,
    importProfile,
    markDirty,
    readRecoveryCandidate,
    resolve,
    restoreRecoveryCandidate,
    retry,
    rollbackImport,
    save,
    start,
    subscribe
  })
}
