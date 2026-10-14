import {
  isMeaningfullyEmptyLearnerProfile
} from '../domain/learner-profile-meaning.js'
import {
  LEARNER_PROFILE_RECOVERY_REASONS,
  LEARNER_PROFILE_RECOVERY_SOURCES,
  LEARNER_PROFILE_RESOLUTION_STATUSES
} from '../domain/learner-profile-resolution.js'
import { canonicalizeJson, sha256Base64UrlSync } from '../state/portable-state.js'
import { captureProfileChanges, restoreProfileBase, combinePortableProfiles, portableProfileChangeDigest, portableProfilesHaveSameProgress } from '../domain/portable-profile-combination.js'

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

function retainLocalFeedCache(cloudProfile, localProfile) {
  const profile = { ...cloudProfile }
  if (isRecord(localProfile?.videos)) profile.videos = localProfile.videos
  if (isRecord(localProfile?.channelRefreshes)) {
    profile.channelRefreshes = localProfile.channelRefreshes
  }
  return profile
}

function canonicalProfilesMatch(localProfile, cloudEnvelope, prepareEnvelope) {
  if (!isRecord(localProfile) || !isRecord(cloudEnvelope?.profile)) return false
  try {
    return JSON.stringify(prepareEnvelope(localProfile).profile)
      === JSON.stringify(cloudEnvelope.profile)
  } catch {
    return false
  }
}

function isVerifiedCurrentLocalCopy(
  localProfile,
  identity,
  cloudEnvelope,
  prepareEnvelope
) {
  return localProfile?.status === 'ready'
    && localProfile.ownerId === identity.ownerId
    && localProfile.profileId === identity.profileId
    && localProfile.generation === identity.generation
    && localProfile.revision === identity.revision
    && canonicalProfilesMatch(
      localProfile.profile,
      cloudEnvelope,
      prepareEnvelope
    )
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
    ].concat(['changes', 'budgetRetryAt'].filter(key => Object.hasOwn(value || {}, key))))
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
    || (Object.hasOwn(value, 'budgetRetryAt') && (!Number.isFinite(value.budgetRetryAt) || value.budgetRetryAt < 0))
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
  handoffEnabled = false,
  finalizeEnvelope,
  getClient,
  getSyncOpportunity = null,
  hasOnboardingProfileDraft = () => false,
  importEnvelope,
  isOnline,
  now,
  minimumWriteIntervalMs = 30_000,
  prepareEnvelope,
  normalizeProfile = profile => prepareEnvelope(profile).profile,
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
    || typeof normalizeProfile !== 'function'
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
  let nextAutomaticWriteAt = 0
  let inFlight = false
  let retryTimer = null
  let started = false
  let sessionBoundaryPending = false
  let deferredSave = null
  let opportunityTimer = null
  let preparationWaitAt = null
  let deliveryWaitAt = null
  let forceOpportunity = false
  // A quiet moment is preferred, but continuously active play gets a turn
  // after ten seconds. The server's ordinary write cadence remains unchanged.
  const MAX_OPPORTUNITY_WAIT_MS = 10_000
  let syncState = Object.freeze({ status: 'idle' })
  const listeners = new Set()
  const headRequests = new Set()
  const pumpTasks = new Set()
  const protectedImports = new WeakMap()
  const handoffRepairStorageKey = `${syncStorageKey}_handoff_repair`
  const dirtyStorageKey = `${syncStorageKey}_dirty`
  const accountlessMigrationStorageKey = `${syncStorageKey}_accountless_migration`
  const importStorageKey = `${syncStorageKey}_import_v1`
  const recoveryStorageKey = `${syncStorageKey}_recovery`
  const localIslandCheckpointStorageKey = `${syncStorageKey}_local_island_checkpoint`

  function profileDigest(profile) {
    // Envelope integrity also covers export time. A local checkpoint must
    // identify just the canonical content across separate preparations.
    return sha256Base64UrlSync(canonicalizeJson(normalizeProfile(profile)))
  }

  function syncProfileDigest(profile) {
    return handoffEnabled
      ? portableProfileChangeDigest(normalizeProfile(profile))
      : profileDigest(profile)
  }

  function normalizedStudyDigest(profile) {
    const { tinySwordsIsland, ...study } = profile
    return sha256Base64UrlSync(canonicalizeJson(study))
  }

  function studyProfileDigest(profile) {
    try { return normalizedStudyDigest(normalizeProfile(profile)) }
    catch { return null }
  }

  function matchesLocalIslandCheckpoint(localProfile, identity) {
    try {
      const checkpoint = JSON.parse(storage.getItem(localIslandCheckpointStorageKey))
      return hasExactKeys(checkpoint, ['version', 'ownerId', 'profileId', 'generation', 'revision', 'payloadSha256'])
        && checkpoint.version === 1
        && checkpoint.ownerId === identity.ownerId
        && checkpoint.profileId === identity.profileId
        && checkpoint.generation === identity.generation
        && checkpoint.revision === identity.revision
        && checkpoint.payloadSha256 === profileDigest(localProfile.profile)
    } catch { return false }
  }

  function markLocalIslandCheckpoint(profile, { activation, isCurrent } = {}) {
    const binding = activeBinding
    if (!binding || binding.activation !== activation || typeof isCurrent !== 'function'
      || !isCurrent() || !binding.isCurrent()) return false
    const record = readSyncRecord()
    if (!record || record.ownerId !== activation.ownerId || record.profileId !== activation.profileId
      || record.generation !== binding.generation || record.pending || record.queued
      || readDirtyRecord().present) return false
    try {
      // The native cause cannot suppress unsaved study/config changes. Only an
      // island difference from this activation's clean profile can be marked.
      const normalized = normalizeProfile(profile)
      if (!binding.checkpointStudyDigest
        || normalizedStudyDigest(normalized) !== binding.checkpointStudyDigest) return false
      const serialized = JSON.stringify({ version: 1, ownerId: record.ownerId,
        profileId: record.profileId, generation: record.generation,
        revision: record.acceptedRevision,
        payloadSha256: sha256Base64UrlSync(canonicalizeJson(normalized)) })
      if (!isCurrent() || !binding.isCurrent()) return false
      storage.setItem(localIslandCheckpointStorageKey, serialized)
      return storage.getItem(localIslandCheckpointStorageKey) === serialized
    } catch { return false }
  }

  function hasExplicitOnboardingProfileDraft() {
    try {
      return hasOnboardingProfileDraft() === true
    } catch {
      return false
    }
  }

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

  function readStoredSyncRecord() {
    let serialized
    try {
      serialized = storage.getItem(syncStorageKey)
    } catch {
      return {
        present: true,
        readable: false,
        record: null,
        serialized: null
      }
    }
    if (serialized === null) {
      return {
        present: false,
        readable: true,
        record: null,
        serialized
      }
    }
    try {
      const record = JSON.parse(serialized)
      return {
        present: true,
        readable: true,
        record: isSyncRecord(record) ? record : null,
        serialized
      }
    } catch {
      return {
        present: true,
        readable: true,
        record: null,
        serialized
      }
    }
  }

  function readSyncRecord() {
    return readStoredSyncRecord().record
  }

  function hasStoredSyncRecord() {
    const stored = readStoredSyncRecord()
    return !stored.readable || stored.present
  }

  function readAccountlessMigrationRecord() {
    try {
      const serialized = storage.getItem(accountlessMigrationStorageKey)
      if (serialized === null) return null
      const record = JSON.parse(serialized)
      const hasCurrentShape = hasExactKeys(record, [
        'catchUp',
        'envelope',
        'operationId',
        'version'
      ])
      const hasPreviousShape = hasExactKeys(record, [
        'envelope',
        'operationId',
        'version'
      ])
      const catchUp = hasCurrentShape ? record.catchUp : null
      const validCatchUp = catchUp === null || (
        hasExactKeys(catchUp, [
          'baseRevision',
          'envelope',
          'operationId'
        ])
        && normalizePositiveInteger(catchUp.baseRevision)
        && UUID_PATTERN.test(catchUp.operationId)
        && isPreparedEnvelope(catchUp.envelope)
      )
      return (hasCurrentShape || hasPreviousShape)
        && record.version === 1
        && UUID_PATTERN.test(record.operationId)
        && isPreparedEnvelope(record.envelope)
        && validCatchUp
        ? { ...record, catchUp }
        : null
    } catch {
      return null
    }
  }

  function hasStoredAccountlessMigrationRecord() {
    try {
      return storage.getItem(accountlessMigrationStorageKey) !== null
    } catch {
      return true
    }
  }

  function writeAccountlessMigrationRecord(record) {
    try {
      storage.setItem(accountlessMigrationStorageKey, JSON.stringify(record))
      const written = readAccountlessMigrationRecord()
      return written?.operationId === record.operationId
        && written.envelope.integrity.payloadSha256
          === record.envelope.integrity.payloadSha256
        && written.catchUp?.operationId === record.catchUp?.operationId
        && written.catchUp?.envelope?.integrity?.payloadSha256
          === record.catchUp?.envelope?.integrity?.payloadSha256
    } catch {
      return false
    }
  }

  function clearAccountlessMigrationRecord(operationId) {
    const record = readAccountlessMigrationRecord()
    if (!record || record.operationId !== operationId) return false
    try {
      storage.removeItem(accountlessMigrationStorageKey)
      return storage.getItem(accountlessMigrationStorageKey) === null
    } catch {
      return false
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
    let serialized
    try {
      serialized = storage.getItem(importStorageKey)
    } catch {
      return {
        present: true,
        readable: false,
        record: null,
        serialized: null
      }
    }
    if (serialized === null) {
      return {
        present: false,
        readable: true,
        record: null,
        serialized
      }
    }
    try {
      const record = JSON.parse(serialized)
      return {
        present: true,
        readable: true,
        record: isDurableImport(record) ? record : null,
        serialized
      }
    } catch {
      return {
        present: true,
        readable: true,
        record: null,
        serialized
      }
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

  function commitStoredRepair({ expectedSerialized, key, nextSerialized }, {
    isCurrent
  } = {}) {
    if (typeof isCurrent !== 'function' || !isCurrent()) return false
    try {
      if (storage.getItem(key) !== expectedSerialized) return false
      if (!isCurrent()) return false
      if (nextSerialized === null) storage.removeItem(key)
      else storage.setItem(key, nextSerialized)
      if (storage.getItem(key) !== nextSerialized) return false
      return isCurrent()
    } catch {
      return false
    }
  }

  function storedRepairMatches({ expectedSerialized, key }) {
    try {
      return storage.getItem(key) === expectedSerialized
    } catch {
      return false
    }
  }

  function readDirtyRecord() {
    try {
      const serialized = storage.getItem(dirtyStorageKey)
      if (serialized === null) return { present: false, record: null, serialized }
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
      return { present: true, record, serialized }
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
    const record = createSyncRecord({
      generation,
      ownerId,
      profileId,
      revision
    })
    return writeSyncRecord(record) ? record : null
  }

  function createSyncRecord({ generation, ownerId, profileId, revision }) {
    return {
      acceptedRevision: revision,
      generation,
      ownerId,
      pending: null,
      profileId,
      queued: null,
      version: 1
    }
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

  function commitCloudHead(identity, currentRecord) {
    const nextRecord = {
      acceptedRevision: identity.revision,
      generation: identity.generation,
      ownerId: identity.ownerId,
      pending: null,
      profileId: identity.profileId,
      queued: null,
      version: 1
    }
    if (currentRecord.protectedConflictIds?.length) {
      nextRecord.protectedConflictIds = [
        ...currentRecord.protectedConflictIds
      ]
    }
    if (!writeSyncRecord(nextRecord)) return false
    const committed = readSyncRecord()
    if (
      !committed
      || committed.ownerId !== identity.ownerId
      || committed.profileId !== identity.profileId
      || committed.generation !== identity.generation
      || committed.acceptedRevision !== identity.revision
      || committed.pending !== null
      || committed.queued !== null
    ) return false
    activeBinding = null
    cloudHeadKnown = true
    publish('up-to-date')
    return true
  }

  async function finalizeProfileEnvelope(profile) {
    const prepared = prepareEnvelope(profile)
    const finalized = await finalizeEnvelope(prepared)
    if (
      !isRecord(finalized?.envelope)
      || finalized.envelope.integrity?.algorithm
        !== prepared.integrity?.algorithm
      || finalized.envelope.integrity?.byteLength
        !== prepared.integrity?.byteLength
      || finalized.envelope.integrity?.payloadSha256
        !== prepared.integrity?.payloadSha256
    ) throw new TypeError('Learner-profile operation integrity changed')
    return finalized.envelope
  }

  function canReplaceSynchronizedHead({ activation, isCurrent }) {
    if (
      !activeBinding
      || activeBinding.activation !== activation
      || typeof isCurrent !== 'function'
      || !isCurrent()
      || !activeBinding.isCurrent()
      || cloudHeadKnown !== true
    ) return null
    const record = readSyncRecord()
    const dirty = readDirtyRecord()
    if (
      !record
      || record.ownerId !== activation.ownerId
      || record.profileId !== activation.profileId
      || record.generation !== activeBinding.generation
      || record.acceptedRevision !== activeBinding.revision
      || record.pending !== null
      || record.queued !== null
      || dirty.present
    ) return null
    return record
  }

  async function startOver(profile, {
    activation,
    confirmed = false,
    isCurrent
  } = {}) {
    if (confirmed !== true) return { status: 'confirmation-required' }
    const record = canReplaceSynchronizedHead({ activation, isCurrent })
    if (!record) return { status: 'not-synchronized' }
    if (!isOnline()) return { status: 'waiting-cloud' }
    let envelope
    try {
      envelope = await finalizeProfileEnvelope(profile)
    } catch {
      return { status: 'recovering' }
    }
    if (!isCurrent() || !activeBinding?.isCurrent()) {
      return { status: 'fenced' }
    }
    let response
    try {
      response = await getClient().rpc(
        'start_over_my_learner_profile',
        {
          p_base_revision: record.acceptedRevision,
          p_confirmed: true,
          p_envelope: envelope,
          p_generation: record.generation,
          p_operation_id: createOperationId(),
          p_profile_id: record.profileId
        }
      )
    } catch {
      return { status: 'waiting-cloud' }
    }
    if (response?.error) {
      return {
        status: isTransientCloudStatus(response.status)
          ? 'waiting-cloud'
          : 'recovering'
      }
    }
    const row = readSingleRpcRow(response?.data)
    const generation = normalizePositiveInteger(row?.generation)
    const revision = normalizePositiveInteger(row?.revision)
    const protectedUntil = Date.parse(String(row?.protected_until || ''))
    if (
      !['started_over', 'already_started_over'].includes(row?.status)
      || !UUID_PATTERN.test(String(row.reset_id || ''))
      || row.profile_id !== record.profileId
      || generation !== record.generation + 1
      || revision !== 1
      || !Number.isFinite(protectedUntil)
      || protectedUntil <= now()
    ) return { status: 'recovering' }
    let verifiedEnvelope
    let importedProfile
    try {
      verifiedEnvelope = await verifyEnvelope(row.envelope)
      importedProfile = verifiedEnvelope
        ? importEnvelope(verifiedEnvelope)
        : null
    } catch {
      return { status: 'recovering' }
    }
    if (
      !isRecord(importedProfile)
      || verifiedEnvelope.integrity?.payloadSha256
        !== envelope.integrity?.payloadSha256
      || !isCurrent()
      || !activeBinding?.isCurrent()
    ) return { status: 'recovering' }
    const identity = {
      generation,
      ownerId: record.ownerId,
      profileId: record.profileId,
      revision
    }
    if (!commitCloudHead(identity, record)) return { status: 'recovering' }
    return {
      ...identity,
      profile: importedProfile,
      protectedReset: Object.freeze({
        id: row.reset_id,
        ownerId: record.ownerId,
        priorGeneration: record.generation,
        priorRevision: record.acceptedRevision,
        profileId: record.profileId,
        protectedUntil,
        resetGeneration: generation,
        status: 'available'
      }),
      status: 'started-over'
    }
  }

  async function undoStartOver({
    activation,
    confirmed = false,
    isCurrent,
    protectedReset
  } = {}) {
    if (confirmed !== true) return { status: 'confirmation-required' }
    const record = canReplaceSynchronizedHead({ activation, isCurrent })
    if (!record) return { status: 'not-synchronized' }
    if (
      !UUID_PATTERN.test(String(protectedReset?.id || ''))
      || protectedReset.status !== 'available'
      || protectedReset.ownerId !== record.ownerId
      || protectedReset.profileId !== record.profileId
      || protectedReset.resetGeneration !== record.generation
      || !Number.isFinite(protectedReset.protectedUntil)
      || protectedReset.protectedUntil <= now()
    ) return { status: 'recovering' }
    if (!isOnline()) return { status: 'waiting-cloud' }
    let response
    try {
      response = await getClient().rpc(
        'undo_my_learner_profile_start_over',
        {
          p_confirmed: true,
          p_operation_id: createOperationId(),
          p_reset_id: protectedReset.id
        }
      )
    } catch {
      return { status: 'waiting-cloud' }
    }
    if (response?.error) {
      return {
        status: isTransientCloudStatus(response.status)
          ? 'waiting-cloud'
          : 'recovering'
      }
    }
    const row = readSingleRpcRow(response?.data)
    const generation = normalizePositiveInteger(row?.generation)
    const revision = normalizePositiveInteger(row?.revision)
    if (
      !['undone', 'already_undone'].includes(row?.status)
      || row.reset_id !== protectedReset.id
      || row.profile_id !== record.profileId
      || generation !== record.generation
      || !revision
      || revision <= record.acceptedRevision
    ) return { status: 'recovering' }
    let verifiedEnvelope
    let importedProfile
    try {
      verifiedEnvelope = await verifyEnvelope(row.envelope)
      importedProfile = verifiedEnvelope
        ? importEnvelope(verifiedEnvelope)
        : null
    } catch {
      return { status: 'recovering' }
    }
    if (
      !isRecord(importedProfile)
      || !isCurrent()
      || !activeBinding?.isCurrent()
    ) return { status: 'recovering' }
    const identity = {
      generation,
      ownerId: record.ownerId,
      profileId: record.profileId,
      revision
    }
    if (!commitCloudHead(identity, record)) return { status: 'recovering' }
    return {
      ...identity,
      profile: importedProfile,
      status: 'undone'
    }
  }

  async function readResetState({ generation, ownerId, profileId } = {}) {
    if (
      !UUID_PATTERN.test(String(ownerId || ''))
      || !UUID_PATTERN.test(String(profileId || ''))
      || !normalizePositiveInteger(generation)
    ) return { status: 'invalid' }
    let response
    try {
      response = await getClient().rpc(
        'read_my_latest_learner_profile_reset'
      )
    } catch {
      return { status: 'unavailable' }
    }
    if (response?.error) {
      return { status: isTransientCloudStatus(response.status) ? 'unavailable' : 'invalid' }
    }
    const row = readSingleRpcRow(response?.data)
    if (row?.status === 'none') return { status: 'none' }
    const priorGeneration = normalizePositiveInteger(row?.prior_generation)
    const priorRevision = normalizePositiveInteger(row?.prior_revision)
    const resetGeneration = normalizePositiveInteger(row?.reset_generation)
    const protectedUntil = Date.parse(String(row?.protected_until || ''))
    if (
      !['available', 'expired', 'undone'].includes(row?.status)
      || !UUID_PATTERN.test(String(row.reset_id || ''))
      || row.profile_id !== profileId
      || resetGeneration !== generation
      || priorGeneration !== generation - 1
      || !priorRevision
      || !Number.isFinite(protectedUntil)
    ) return { status: 'invalid' }
    let protectedReset = null
    if (row.status === 'available') {
      try {
        const envelope = await verifyEnvelope(row.prior_envelope)
        if (!envelope || !isRecord(importEnvelope(envelope))) return { status: 'invalid' }
      } catch {
        return { status: 'invalid' }
      }
      if (protectedUntil > now()) {
        protectedReset = Object.freeze({
          id: row.reset_id,
          ownerId,
          priorGeneration,
          priorRevision,
          profileId,
          protectedUntil,
          resetGeneration,
          status: 'available'
        })
      }
    }
    return Object.freeze({
      id: row.reset_id,
      ownerId,
      priorGeneration,
      priorRevision,
      profileId,
      protectedReset,
      protectedUntil,
      resetGeneration,
      status: row.status === 'available' && !protectedReset ? 'expired' : row.status
    })
  }

  async function readResetReceipt(identity) {
    const receipt = await readResetState(identity)
    return ['available', 'expired', 'undone'].includes(receipt.status)
      ? receipt
      : null
  }

  async function readProtectedReset(identity = {}) {
    const receipt = await readResetReceipt(identity)
    return receipt?.protectedReset || null
  }

  function createOperation(profile, record, activationId, baseProfile = activeBinding?.baseProfile) {
    const prepared = prepareEnvelope(profile)
    const changes = handoffEnabled && baseProfile
      ? captureProfileChanges(baseProfile, prepared.profile) : null
    const baseRevision = record.pending
      ? record.pending.baseRevision + 1
      : record.acceptedRevision
    return {
      activationId,
      ...(changes ? { changes: { ...changes, baseRevision: record.acceptedRevision } } : {}),
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

  async function queueDirtyProfile(profile, record, dirty, isCurrent) {
    const latest = record.queued || record.pending
    const represented = latest?.envelope || latest?.prepared
    if (!canonicalProfilesMatch(profile, represented, prepareEnvelope)) {
      // Later local saves can outlive their preparation timer. Recover the
      // exact accepted base from the durable candidate's bounded before-values
      // before replacing it; opening has no active in-memory binding yet.
      let baseProfile
      if (handoffEnabled && latest?.changes) {
        if (latest.changes.baseRevision !== record.acceptedRevision) return false
        baseProfile = restoreProfileBase(represented?.profile, latest.changes)
        if (!baseProfile) return false
      }
      return isCurrent() && queueProfile(profile, record, `dirty-recovery-${createOperationId()}`, baseProfile)
    }
    // The latest complete candidate is already durable. Storing it twice can
    // exhaust origin quota before replaying a lost acknowledgment.
    const stored = readStoredSyncRecord()
    if (JSON.stringify(stored.record) !== JSON.stringify(record)) return false
    let candidate
    try {
      candidate = latest.envelope
        ? await verifyEnvelope(latest.envelope)
        : (await finalizeEnvelope(latest.prepared))?.envelope
    } catch { return false }
    if (
      !isCurrent()
      || candidate?.integrity?.algorithm !== latest.integrity.algorithm
      || candidate?.integrity?.byteLength !== latest.integrity.byteLength
      || candidate?.integrity?.payloadSha256 !== latest.integrity.payloadSha256
      || !canonicalProfilesMatch(profile, candidate, prepareEnvelope)
      || readStoredSyncRecord().serialized !== stored.serialized
      || readDirtyRecord().serialized !== dirty.serialized
    ) return false
    return clearDirtyRecord(record)
  }

  function queueProfile(profile, record, activationId, baseProfile) {
    const latest = record.queued || record.pending
    if (minimumWriteIntervalMs > 0 && latest
      && canonicalProfilesMatch(profile, latest.envelope || latest.prepared, prepareEnvelope)) {
      return clearDirtyRecord(record)
    }
    let operation
    try {
      operation = createOperation(profile, record, activationId, baseProfile)
    } catch {
      return false
    }
    operation.nextRetryAt = Math.max(0, nextAutomaticWriteAt)
    if (minimumWriteIntervalMs > 0 && record.pending && !inFlight
      && record.pending.envelope === null && record.pending.retryCount === 0
      && record.queued === null) {
      operation.baseRevision = record.pending.baseRevision
      operation.revision = record.pending.revision
      record.pending = operation
    } else if (record.pending) record.queued = operation
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

  async function readVerifiedConflict(conflictId, ownerId, activation = null, { metadataOnly = false } = {}) {
    if (
      !UUID_PATTERN.test(String(conflictId || ''))
      || !UUID_PATTERN.test(String(ownerId || ''))
      || (activation !== null && !isRecord(activation))
    ) return null
    let response
    try {
      const request = getClient().rpc(
        'read_my_learner_profile_conflict',
        { p_conflict_id: conflictId }
      )
      // Recovery-download buttons need identity and expiry, not two full
      // historical profiles. PostgREST projects these columns before transfer.
      response = await (metadataOnly ? request.select(
        'status,conflict_id,operation_id,profile_id,device_generation,device_revision,cloud_generation,cloud_revision,selected_side,protected_until'
      ) : request)
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
    if (metadataOnly) {
      if (status !== 'resolved') return null
      return Object.freeze({
        id: conflictId,
        operationId: row.operation_id,
        ownerId,
        profileId: row.profile_id,
        protectedUntil,
        selectedSide,
        status
      })
    }
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

  async function readProtectedConflict({ conflict, isCurrent } = {}) {
    if (conflict?.status !== 'resolved' || typeof isCurrent !== 'function'
      || !isCurrent() || conflict.protectedUntil <= now()) return null
    const verified = await readVerifiedConflict(conflict.id, conflict.ownerId)
    if (!isCurrent() || verified?.status !== 'resolved'
      || verified.operationId !== conflict.operationId
      || verified.profileId !== conflict.profileId
      || verified.selectedSide !== conflict.selectedSide
      || verified.protectedUntil !== conflict.protectedUntil
      || verified.protectedUntil <= now()) return null
    return verified
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
    if (candidates.length === 0) return { status: 'onboarding-required' }
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

  async function readPreservedConflict(
    receipt, operation, activation, { includeExpired = false } = {}
  ) {
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
      !['open', 'resolved', 'expired'].includes(conflict?.status)
      || conflict.operationId !== operation.operationId
      || conflict.profileId !== operation.profileId
    ) return null
    // Expired protection hides the old envelopes, but the owner-scoped record
    // still identifies this exact request. Never infer a selected profile from
    // it; the retained local candidate must be preserved for a new comparison.
    if (conflict.status === 'expired') return includeExpired ? conflict : null
    if (
      conflict.device.generation !== operation.generation
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
    verifiedConflicts = new Map(),
    { deferPruning = false } = {}
  ) {
    const conflictIds = record?.protectedConflictIds || []
    const conflicts = []
    const retainedIds = []
    // Bound concurrency while overlapping these small owner-scoped reads.
    for (let start = 0; start < conflictIds.length; start += 3) {
      const batch = conflictIds.slice(start, start + 3)
      const records = await Promise.all(batch.map(conflictId =>
        verifiedConflicts.get(conflictId)
          || readVerifiedConflict(conflictId, record.ownerId, null, { metadataOnly: true })
      ))
      for (const [index, conflict] of records.entries()) {
        if (conflict?.status === 'resolved') {
          conflicts.push(conflict)
          retainedIds.push(batch[index])
        } else if (conflict?.status !== 'expired') {
          return null
        }
      }
    }
    if (!deferPruning && retainedIds.length !== conflictIds.length) {
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
    return { conflicts: Object.freeze(conflicts), retainedIds }
  }

  async function resolvePreservedConflict(
    receipt,
    operation,
    { activation = null, chooseWhenEmpty = false, isCurrent = () => true,
      retryComparison = true } = {}
  ) {
    const conflict = await readPreservedConflict(
      receipt, operation, activation, { includeExpired: true }
    )
    if (!conflict || !isCurrent()) return { status: 'recovering' }
    if (conflict.status === 'expired' || readSyncRecord()?.queued) {
      if (!retryComparison) return { status: 'recovering' }
      let candidate
      try {
        candidate = await finalizeDurableOperation(operation)
      } catch {
        return { status: 'recovering' }
      }
      const stored = readStoredSyncRecord()
      const record = stored.record
      if (
        !isCurrent()
        || record?.ownerId !== operation.ownerId
        || record.profileId !== operation.profileId
        || record.generation !== operation.generation
        || record.pending?.operationId !== operation.operationId
        || record.pending.integrity.payloadSha256 !== operation.integrity.payloadSha256
      ) return { status: 'recovering' }
      const latest = record.queued || record.pending
      if (record.queued) {
        // A queued operation is a complete newer snapshot. Rebase it onto the
        // original stale revision so it too requires an explicit comparison.
        try {
          candidate = latest.envelope
            ? await verifyEnvelope(latest.envelope)
            : (await finalizeEnvelope(latest.prepared))?.envelope
        } catch {
          return { status: 'recovering' }
        }
        if (
          !isCurrent()
          || candidate?.integrity?.algorithm !== latest.integrity.algorithm
          || candidate?.integrity?.byteLength !== latest.integrity.byteLength
          || candidate?.integrity?.payloadSha256 !== latest.integrity.payloadSha256
          || readStoredSyncRecord().serialized !== stored.serialized
        ) return { status: 'recovering' }
      }
      const operationId = createOperationId()
      if (!UUID_PATTERN.test(String(operationId || ''))
        || operationId === operation.operationId) return { status: 'recovering' }
      const fresh = {
        ...latest,
        baseRevision: operation.baseRevision,
        envelope: candidate,
        nextRetryAt: 0,
        operationId,
        prepared: null,
        retryCount: 0,
        revision: operation.revision
      }
      record.pending = fresh
      record.queued = null
      if (!writeSyncRecord(record)) return { status: 'recovering' }
      let response
      try {
        response = await getClient().rpc(
          'commit_my_learner_profile', operationParameters(fresh, candidate)
        )
      } catch {
        return { status: 'waiting-cloud' }
      }
      const freshReceipt = readSingleRpcRow(response?.data)
      if (!response?.error && freshReceipt?.status === 'conflict') {
        return resolvePreservedConflict(freshReceipt, fresh, {
          activation, chooseWhenEmpty: false, isCurrent, retryComparison: false
        })
      }
      return { status: response?.error && isTransientCloudStatus(response.status)
        ? 'waiting-cloud' : 'recovering' }
    }
    if (conflict.status === 'open') {
      const sameProgress = handoffEnabled
        && conflict.device.generation === conflict.cloud.generation
        && !readDirtyRecord().present
        && portableProfilesHaveSameProgress(conflict.device.profile, conflict.cloud.profile)
      if (!chooseWhenEmpty && !sameProgress) return { conflict, status: 'conflicting' }
      const deviceIsEmpty = isMeaningfullyEmptyLearnerProfile(
        conflict.device.profile
      )
      const cloudIsEmpty = isMeaningfullyEmptyLearnerProfile(
        conflict.cloud.profile
      )
      const profilesMatch = JSON.stringify(conflict.device.profile)
        === JSON.stringify(conflict.cloud.profile)
      if (!sameProgress && !deviceIsEmpty && !cloudIsEmpty && !profilesMatch) {
        return { conflict, status: 'conflicting' }
      }
      const selectedSide = sameProgress || deviceIsEmpty || profilesMatch ? 'cloud' : 'device'
      const automaticallyChosen = await chooseConflict({
        confirmed: true,
        conflict,
        selectedSide,
        ...(sameProgress ? { automatic: true, isCurrent } : {})
      })
      if (automaticallyChosen.status === 'conflict-changed') {
        return {
          conflict: automaticallyChosen.conflict,
          status: 'conflicting'
        }
      }
      return automaticallyChosen.status === 'chosen'
        ? {
            created: false,
            generation: automaticallyChosen.generation,
            ownerId: automaticallyChosen.ownerId,
            profile: automaticallyChosen.profile,
            profileId: automaticallyChosen.profileId,
            protectedConflicts: automaticallyChosen.protectedConflicts,
            revision: automaticallyChosen.revision,
            status: 'activate'
          }
        : { status: 'recovering' }
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
    selectedSide,
    automatic = false,
    isCurrent = () => true
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

    const automaticSync = automatic ? readStoredSyncRecord().serialized : null
    if (automatic && (!isCurrent() || record.queued || readDirtyRecord().present)) return { status: 'recovering' }
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

    if (automatic && (!isCurrent() || readDirtyRecord().present
      || readStoredSyncRecord().serialized !== automaticSync)) return { status: 'recovering' }
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
    if (!clearDirtyRecord(record)) return { status: 'recovering' }
    if (!writeSyncRecord(current)) return { status: 'recovering' }
    const protectedResult = await readStoredProtectedConflicts(
      current,
      new Map([[conflict.id, protectedConflict]])
    )
    if (!protectedResult) return { status: 'recovering' }
    activeBinding = null
    cloudHeadKnown = true
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

  function pump() {
    const task = performPump()
    pumpTasks.add(task)
    void task.finally(() => pumpTasks.delete(task)).catch(() => {})
    return task
  }

  function scheduleOpportunity() {
    if (opportunityTimer !== null) return
    opportunityTimer = setTimer(() => {
      opportunityTimer = null
      void pump()
    }, 500)
  }

  function waitForOpportunity(forDelivery = false) {
    if (!handoffEnabled || typeof getSyncOpportunity !== 'function' || forceOpportunity || sessionBoundaryPending) return false
    let quiet = true
    try { quiet = getSyncOpportunity() !== false } catch { /* Fall back to normal syncing. */ }
    if (quiet) { preparationWaitAt = null; deliveryWaitAt = null; return false }
    if (forDelivery) deliveryWaitAt ??= now()
    else preparationWaitAt ??= now()
    if (now() - (forDelivery ? deliveryWaitAt : preparationWaitAt) >= MAX_OPPORTUNITY_WAIT_MS) return false
    publish('waiting')
    scheduleOpportunity()
    return true
  }

  function drainDeferredSave() {
    const deferred = deferredSave
    if (!deferred) return true
    if (activeBinding !== deferred.binding || !deferred.isCurrent() || !deferred.binding.isCurrent()) {
      deferredSave = null
      return true
    }
    if (deferred.blocked && !forceOpportunity) return false
    // Preparation cannot add another wait after the delivery deadline.
    const deliveryDue = deliveryWaitAt !== null && now() - deliveryWaitAt >= MAX_OPPORTUNITY_WAIT_MS
    if (!deliveryDue && waitForOpportunity()) return false
    let profile
    try { profile = deferred.readPersistedProfile() }
    catch {
      deferred.blocked = true
      publish('needs-attention')
      return false
    }
    // A local transaction still in progress is never an upload snapshot.
    if (!profile) { scheduleOpportunity(); return false }
    deferredSave = null
    const result = save(profile, { activation: deferred.binding.activation, isCurrent: deferred.isCurrent, skipDeferral: true, skipPump: true })
    if (result.status !== 'queued') {
      deferred.blocked = true
      deferredSave = deferred
      return false
    }
    return true
  }

  async function performPump() {
    if (inFlight) return
    // Start the delivery allowance when the existing cadence permits work,
    // even if preparation is still batching. Retry/server budgets are checked
    // against the fresh durable operation below; this clock grants no authority.
    if (deferredSave && !deferredSave.blocked && activeBinding?.isCurrent() && isOnline() && now() >= nextAutomaticWriteAt) {
      waitForOpportunity(true)
    }
    if (!drainDeferredSave() || inFlight) return
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
    const retryAt = Math.max(Number(operation.nextRetryAt) || 0, handoffEnabled ? Number(operation.budgetRetryAt) || 0 : 0)
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
    if (waitForOpportunity(true)) return
    deliveryWaitAt = null
    inFlight = true
    let comparisonPending = false
    let budgetDeferred = false
    publish('syncing')
    if (handoffEnabled) {
      const head = await checkActiveHead({ activation: binding.activation, isCurrent: binding.isCurrent, preflight: true })
      if (activeBinding !== binding || !binding.isCurrent()) {
        inFlight = false
        if (activeBinding?.isCurrent()) void pump()
        return
      }
      if (head.status !== 'unchanged') {
        inFlight = false
        if (head.status === 'waiting') scheduleTransientRetry(operation)
        else publish('head-changed', { activation: binding.activation })
        return
      }
    }
    nextAutomaticWriteAt = now() + Math.max(0, minimumWriteIntervalMs)
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
        handoffEnabled ? 'commit_my_learner_profile_handoff' : 'commit_my_learner_profile',
        { ...operationParameters(operation, envelope), ...(handoffEnabled ? { p_session_boundary: sessionBoundaryPending } : {}) }
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
      if (handoffEnabled && !response?.error && row?.status === 'head_changed'
        && UUID_PATTERN.test(String(row.profile_id || '')) && normalizePositiveInteger(row.generation)
        && normalizePositiveInteger(row.revision) && normalizePositiveInteger(row.base_revision) === operation.baseRevision) {
        comparisonPending = true
        cloudHeadKnown = false
        publish('head-changed', { activation: binding.activation })
      } else if (handoffEnabled && !response?.error && row?.status === 'deferred'
        && row.profile_id === operation.profileId && normalizePositiveInteger(row.generation) === operation.generation
        && normalizePositiveInteger(row.base_revision) === operation.baseRevision
        && Number.isSafeInteger(row.retry_after_ms) && row.retry_after_ms > 0 && row.retry_after_ms <= 30_000) {
        budgetDeferred = true
        const current = readSyncRecord()
        if (current?.pending?.operationId === operation.operationId) {
          current.pending.budgetRetryAt = now() + row.retry_after_ms
          current.pending.nextRetryAt = current.pending.budgetRetryAt
          nextAutomaticWriteAt = current.pending.nextRetryAt
          sessionBoundaryPending = false
          if (writeSyncRecord(current)) publish('waiting')
          else publish('needs-attention')
        }
      } else if (response?.error && isTransientCloudStatus(response.status)) {
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
          if (handoffEnabled) {
            binding.baseProfile = envelope.profile
            // Count the coalescing interval from acknowledgement so a slow
            // request cannot immediately send another large envelope.
            nextAutomaticWriteAt = Math.max(nextAutomaticWriteAt, now() + Math.max(0, minimumWriteIntervalMs))
            const queuedCandidate = current.pending?.envelope || current.pending?.prepared
            if (queuedCandidate && syncProfileDigest(queuedCandidate.profile) === syncProfileDigest(envelope.profile)) {
              current.pending = null
            }
            sessionBoundaryPending = false
            if (current.pending) {
              current.pending.nextRetryAt = Math.max(current.pending.nextRetryAt, nextAutomaticWriteAt)
              const candidate = current.pending.envelope || current.pending.prepared
              const changes = captureProfileChanges(envelope.profile, candidate.profile)
              if (changes) current.pending.changes = { ...changes, baseRevision: current.acceptedRevision }
              else delete current.pending.changes
            }
          }
          if (!writeSyncRecord(current)) {
            publish('needs-attention')
          } else {
            binding.revision = current.acceptedRevision
            binding.checkpointStudyDigest = studyProfileDigest(envelope.profile)
            if (minimumWriteIntervalMs > 0) {
              binding.acceptedProfileDigest = syncProfileDigest(envelope.profile)
            }
            if (
              current.pending === null
              && !handoffEnabled
              && !clearDirtyRecord(current)
            ) {
              publish('needs-attention')
            } else {
              // Durable enqueue already clears the trial's dirty marker. Any
              // marker still present belongs to an unfinished/newer local save;
              // this older receipt must neither erase it nor claim completion.
              publish(current.pending || (handoffEnabled && readDirtyRecord().present) ? 'syncing' : 'up-to-date', {
                accepted: {
                  activation: binding.activation,
                  generation: operation.generation,
                  ownerId: operation.ownerId,
                  profileId: operation.profileId,
                  revision: current.acceptedRevision
                }
              })
              // Trial saves enter the outbox only after local persistence
              // completes. A receipt must not capture a still-mutating object.
              if (!handoffEnabled && !current.pending) {
                queueLatestActiveProfileIfChanged(envelope)
              }
            }
          }
        }
      } else if (!response?.error && row?.status === 'conflict') {
        comparisonPending = true
        let conflict = await readPreservedConflict(
          row,
          operation,
          binding.activation,
          { includeExpired: true }
        )
        const recheckHarmlessConflict = handoffEnabled && conflict?.status === 'open'
          && conflict.device.generation === conflict.cloud.generation
          && portableProfilesHaveSameProgress(conflict.device.profile, conflict.cloud.profile)
        if (recheckHarmlessConflict && activeBinding === binding && binding.isCurrent()) {
          // Reopen through the fenced handoff resolver instead of asking the
          // learner to choose between identical progress.
          cloudHeadKnown = false
          publish('head-changed', { activation: binding.activation })
        } else if (conflict?.status === 'expired' || (conflict && readSyncRecord()?.queued)) {
          const refreshed = await resolvePreservedConflict(row, operation, {
            activation: binding.activation,
            isCurrent: () => activeBinding === binding && binding.isCurrent()
          })
          conflict = refreshed.status === 'conflicting' ? refreshed.conflict : null
        }
        if (!recheckHarmlessConflict && activeBinding === binding && binding.isCurrent()) {
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
    if (budgetDeferred || (!comparisonPending && next?.pending && next.pending.operationId !== operation.operationId)) {
      void pump()
    }
  }

  async function resolveAccountlessMigration({
    authentication,
    connectivity,
    accountlessAttachment,
    localProfile
  }) {
    const operationId = String(accountlessAttachment?.operationId || '')
    if (
      connectivity?.status !== 'online'
      || !UUID_PATTERN.test(String(authentication?.userId || ''))
      || !UUID_PATTERN.test(operationId)
      || localProfile?.status !== 'ready'
      || localProfile.ownerId !== null
      || !isRecord(localProfile.profile)
    ) return { status: 'migration-backup-failed' }

    let migrationRecord = readAccountlessMigrationRecord()
    if (
      hasStoredAccountlessMigrationRecord()
      && (
        !migrationRecord
        || migrationRecord.operationId !== operationId
      )
    ) return { status: 'migration-backup-failed' }
    if (!migrationRecord) {
      let finalized
      try {
        finalized = await finalizeEnvelope(prepareEnvelope(localProfile.profile))
      } catch {
        return { status: 'migration-backup-failed' }
      }
      const envelope = await verifyEnvelope(finalized?.envelope)
      if (!envelope || !writeAccountlessMigrationRecord({
        catchUp: null,
        envelope,
        operationId,
        version: 1
      })) return { status: 'migration-backup-failed' }
      migrationRecord = readAccountlessMigrationRecord()
    }

    const envelope = await verifyEnvelope(migrationRecord?.envelope)
    if (!envelope) return { status: 'migration-backup-failed' }
    let response
    try {
      response = await getClient().rpc(
        'migrate_my_accountless_profile',
        {
          p_envelope: envelope,
          p_operation_id: operationId
        }
      )
    } catch {
      return { status: 'migration-backup-failed' }
    }
    if (response?.error) return { status: 'migration-backup-failed' }
    const row = readSingleRpcRow(response?.data)
    if (row?.status === 'profile_present') {
      const provisionalProfileId = operationId
      let syncRecord = readSyncRecord()
      if (!syncRecord && hasStoredSyncRecord()) {
        return { status: 'migration-backup-failed' }
      }
      if (!syncRecord) {
        const operation = {
          activationId: `accountless-migration:${operationId}`,
          baseRevision: 1,
          envelope,
          generation: 1,
          integrity: envelope.integrity,
          nextRetryAt: 0,
          operationId,
          ownerId: authentication.userId,
          prepared: null,
          profileId: provisionalProfileId,
          retryCount: 0,
          revision: 2
        }
        if (!writeSyncRecord({
          acceptedRevision: 1,
          generation: 1,
          ownerId: authentication.userId,
          pending: operation,
          profileId: provisionalProfileId,
          queued: null,
          version: 1
        })) return { status: 'migration-backup-failed' }
        syncRecord = readSyncRecord()
      }
      const operation = syncRecord?.pending
      if (
        syncRecord?.ownerId !== authentication.userId
        || syncRecord.profileId !== provisionalProfileId
        || syncRecord.generation !== 1
        || syncRecord.acceptedRevision !== 1
        || syncRecord.queued !== null
        || operation?.operationId !== operationId
        || operation.profileId !== provisionalProfileId
        || operation.integrity?.payloadSha256
          !== envelope.integrity.payloadSha256
      ) return { status: 'migration-backup-failed' }
      let conflictResponse
      try {
        conflictResponse = await getClient().rpc(
          'commit_my_learner_profile',
          operationParameters(operation, envelope)
        )
      } catch {
        return { status: 'migration-backup-failed' }
      }
      if (conflictResponse?.error) {
        return { status: 'migration-backup-failed' }
      }
      const conflictReceipt = readSingleRpcRow(conflictResponse?.data)
      if (conflictReceipt?.status !== 'conflict') {
        return { status: 'migration-backup-failed' }
      }
      return resolvePreservedConflict(conflictReceipt, operation, {
        chooseWhenEmpty: true
      })
    }
    if (row?.status !== 'migrated') {
      return { status: 'migration-backup-failed' }
    }

    const profileId = String(row.profile_id || '')
    const generation = normalizePositiveInteger(row.generation)
    const revision = normalizePositiveInteger(row.revision)
    const acceptedEnvelope = await verifyEnvelope(row.envelope)
    if (
      !UUID_PATTERN.test(profileId)
      || generation !== 1
      || revision !== 1
      || !acceptedEnvelope
      || row.payload_sha256 !== envelope.integrity.payloadSha256
      || acceptedEnvelope.integrity.payloadSha256
        !== envelope.integrity.payloadSha256
      || JSON.stringify(acceptedEnvelope.profile)
        !== JSON.stringify(envelope.profile)
      || !importEnvelope(acceptedEnvelope)
    ) return { status: 'migration-backup-failed' }

    let acceptedRevision = revision
    let latestAcceptedEnvelope = acceptedEnvelope
    let currentCanonicalEnvelope
    try {
      currentCanonicalEnvelope = prepareEnvelope(localProfile.profile)
    } catch {
      return { status: 'migration-backup-failed' }
    }
    for (let step = 0; step < 4; step += 1) {
      if (
        JSON.stringify(currentCanonicalEnvelope.profile)
        === JSON.stringify(latestAcceptedEnvelope.profile)
      ) break

      let catchUp = migrationRecord.catchUp
      if (!catchUp) {
        const catchUpOperationId = createOperationId()
        if (!UUID_PATTERN.test(String(catchUpOperationId || ''))) {
          return { status: 'migration-backup-failed' }
        }
        let finalized
        try {
          finalized = await finalizeEnvelope(currentCanonicalEnvelope)
        } catch {
          return { status: 'migration-backup-failed' }
        }
        const catchUpEnvelope = await verifyEnvelope(finalized?.envelope)
        if (!catchUpEnvelope) return { status: 'migration-backup-failed' }
        catchUp = {
          baseRevision: acceptedRevision,
          envelope: catchUpEnvelope,
          operationId: catchUpOperationId
        }
        if (!writeAccountlessMigrationRecord({
          ...migrationRecord,
          catchUp
        })) return { status: 'migration-backup-failed' }
        migrationRecord = readAccountlessMigrationRecord()
        catchUp = migrationRecord?.catchUp
      }

      const catchUpEnvelope = await verifyEnvelope(catchUp?.envelope)
      const catchUpBaseRevision = normalizePositiveInteger(
        catchUp?.baseRevision
      )
      if (!catchUpEnvelope || !catchUpBaseRevision) {
        return { status: 'migration-backup-failed' }
      }
      const catchUpOperation = {
        baseRevision: catchUpBaseRevision,
        generation,
        operationId: catchUp.operationId,
        profileId,
        revision: catchUpBaseRevision + 1
      }
      let catchUpResponse
      try {
        catchUpResponse = await getClient().rpc(
          'commit_my_learner_profile',
          operationParameters(catchUpOperation, catchUpEnvelope)
        )
      } catch {
        return { status: 'migration-backup-failed' }
      }
      if (catchUpResponse?.error) {
        return { status: 'migration-backup-failed' }
      }
      const catchUpReceipt = readSingleRpcRow(catchUpResponse?.data)
      if (!isAcceptedOperationReceipt(
        catchUpReceipt,
        catchUpOperation,
        catchUpEnvelope,
        ['accepted', 'already_accepted']
      )) return { status: 'migration-backup-failed' }

      acceptedRevision = catchUpOperation.revision
      latestAcceptedEnvelope = catchUpEnvelope
      if (
        JSON.stringify(currentCanonicalEnvelope.profile)
        === JSON.stringify(latestAcceptedEnvelope.profile)
      ) break
      migrationRecord = {
        ...migrationRecord,
        catchUp: null
      }
      if (!writeAccountlessMigrationRecord(migrationRecord)) {
        return { status: 'migration-backup-failed' }
      }
    }
    if (
      JSON.stringify(currentCanonicalEnvelope.profile)
      !== JSON.stringify(latestAcceptedEnvelope.profile)
    ) return { status: 'migration-backup-failed' }

    const currentRecord = readSyncRecord()
    if (
      hasStoredSyncRecord()
      && (
        !currentRecord
        || currentRecord.ownerId !== authentication.userId
        || currentRecord.profileId !== profileId
        || currentRecord.generation !== generation
        || currentRecord.acceptedRevision !== acceptedRevision
        || currentRecord.pending !== null
        || currentRecord.queued !== null
      )
    ) return { status: 'migration-backup-failed' }
    if (!currentRecord && !ensureSyncRecord({
      generation,
      ownerId: authentication.userId,
      profileId,
      revision: acceptedRevision
    })) return { status: 'migration-backup-failed' }

    cloudHeadKnown = true
    return {
      backupRequired: false,
      finalize({ isCurrent } = {}) {
        return typeof isCurrent === 'function'
          && isCurrent()
          && clearAccountlessMigrationRecord(operationId)
      },
      generation,
      ownerId: authentication.userId,
      profile: localProfile.profile,
      profileId,
      revision: acceptedRevision,
      status: 'activate'
    }
  }

  async function recoverDurableImport(authentication, localProfile) {
    const stored = readDurableImport()
    if (!stored.present) return { localProfile, status: 'ready' }
    const durableImport = stored.record
    if (!durableImport) {
      return stored.readable && localProfile?.status === 'empty'
        ? {
            localProfile,
            malformedImportRepair: {
              expectedSerialized: stored.serialized,
              key: importStorageKey,
              nextSerialized: null
            },
            status: 'ready'
          }
        : { status: 'recovering' }
    }
    if (authentication?.userId !== durableImport.ownerId) {
      return { status: 'recovering' }
    }
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

  // IndexedDB profile installation and the localStorage outbox cannot share a
  // transaction. A bounded before-value journal bridges that crash window;
  // the original outbox stays intact until installation has been verified.
  function recoverHandoffInstallation(localProfile, ownerId, isCurrent) {
    try {
      const serialized = storage.getItem(handoffRepairStorageKey)
      if (!serialized) return true
      const repair = JSON.parse(serialized)
      if (!hasExactKeys(repair, ['version', 'identity', 'sourceDigest', 'operationId', 'changes'])
        || repair.version !== 1 || !UUID_PATTERN.test(repair.operationId)
        || !hasExactKeys(repair.identity, ['ownerId', 'profileId', 'generation', 'revision'])
        || !UUID_PATTERN.test(repair.identity.ownerId) || !UUID_PATTERN.test(repair.identity.profileId)
        || !normalizePositiveInteger(repair.identity.generation) || !normalizePositiveInteger(repair.identity.revision)) return false
      if (repair.identity.ownerId !== ownerId) return true
      const stored = readStoredSyncRecord()
      if (!stored.record || !isCurrent() || readDirtyRecord().present) return false
      const installed = localProfile?.status === 'ready'
        && ['ownerId', 'profileId', 'generation', 'revision'].every(key => localProfile[key] === repair.identity[key])
        && portableProfileChangeDigest(prepareEnvelope(localProfile.profile).profile) === repair.changes?.targetDigest
      const original = sha256Base64UrlSync(stored.serialized) === repair.sourceDigest
      if (!installed) {
        // Installation never finished: retain the old candidate and resolve it
        // again. A changed outbox cannot be silently discarded here.
        if (!original) return false
      } else if (original) {
        const prepared = prepareEnvelope(localProfile.profile)
        if (!restoreProfileBase(prepared.profile, repair.changes)) return false
        const next = createSyncRecord(repair.identity)
        if (stored.record.protectedConflictIds?.length) next.protectedConflictIds = [...stored.record.protectedConflictIds]
        if (repair.changes.baseDigest !== repair.changes.targetDigest) next.pending = {
          activationId: stored.record.pending.activationId, baseRevision: repair.identity.revision,
          changes: { ...repair.changes, baseRevision: repair.identity.revision },
          envelope: null, generation: repair.identity.generation, integrity: prepared.integrity,
          nextRetryAt: 0, operationId: repair.operationId, ownerId, prepared,
          profileId: repair.identity.profileId, retryCount: 0, revision: repair.identity.revision + 1
        }
        if (!isCurrent() || !writeSyncRecord(next)) return false
      } else if (stored.record.ownerId !== ownerId || stored.record.profileId !== repair.identity.profileId
        || stored.record.generation !== repair.identity.generation || stored.record.acceptedRevision !== repair.identity.revision
        || (stored.record.pending && stored.record.pending.operationId !== repair.operationId)) return false
      if (!isCurrent()) return false
      storage.removeItem(handoffRepairStorageKey)
      return storage.getItem(handoffRepairStorageKey) === null
    } catch { return false }
  }

  async function prepareHandoffResolution({ authentication, localProfile, cloudIdentity, cloudEnvelope, record, isCurrent }) {
    const pending = record.pending
    const latest = record.queued || pending
    let acceptedEnvelope
    let latestEnvelope
    try {
      acceptedEnvelope = await finalizeDurableOperation(pending)
      latestEnvelope = latest === pending ? acceptedEnvelope : latest.envelope
        ? await verifyEnvelope(latest.envelope) : (await finalizeEnvelope(latest.prepared))?.envelope
      if (!latestEnvelope || latestEnvelope.integrity?.payloadSha256 !== latest.integrity.payloadSha256
        || latestEnvelope.integrity?.byteLength !== latest.integrity.byteLength) return null
    } catch { return null }
    const captured = readStoredSyncRecord()
    if (!isCurrent() || captured.record?.pending?.operationId !== pending.operationId
      || (captured.record.queued || captured.record.pending)?.operationId !== latest.operationId
      || !canonicalProfilesMatch(localProfile.profile, latestEnvelope, prepareEnvelope)) return null
    let response
    try { response = await getClient().rpc('read_my_learner_profile_write_receipt', { p_operation_id: pending.operationId }) }
    catch { return waitForCloudHead() }
    if (response?.error) return isTransientCloudStatus(response.status) ? waitForCloudHead() : { status: 'recovering' }
    const receipt = readSingleRpcRow(response?.data)
    const accepted = isAcceptedOperationReceipt(receipt, pending, acceptedEnvelope, ['already_accepted'])
      && receipt.request_sha256 === sha256Base64UrlSync(canonicalizeJson({
        baseRevision: pending.baseRevision, envelope: acceptedEnvelope, generation: pending.generation,
        operationId: pending.operationId, ownerId: pending.ownerId, profileId: pending.profileId
      }))
    if (!accepted && receipt?.status !== 'not_accepted') return { status: 'recovering' }
    if (!isCurrent() || readStoredSyncRecord().serialized !== captured.serialized || readDirtyRecord().present) return { status: 'recovering' }
    let combined
    if (accepted && latest === pending) {
      // The whole local candidate is already in the verified lineage. There is
      // no later edit to protect, even if another device has since continued.
      combined = cloudEnvelope.profile
    } else {
      const baseRevision = accepted ? pending.revision : record.acceptedRevision
      if (!Number.isSafeInteger(receipt.last_replacement_revision) || receipt.last_replacement_revision < 0
        || receipt.last_replacement_revision > baseRevision) return null
      // Missing/pruned before-values need no whole-profile choice when every
      // meaningful field already equals Cloud. The replacement fence above
      // still prevents inferring away an import, restore or explicit choice.
      if (portableProfilesHaveSameProgress(latestEnvelope.profile, cloudEnvelope.profile)) {
        combined = cloudEnvelope.profile
      } else {
        const base = accepted ? acceptedEnvelope.profile
          : latest.changes && latest.changes.baseRevision === record.acceptedRevision
            ? restoreProfileBase(latestEnvelope.profile, latest.changes) : null
        if (!base) return null
        combined = combinePortableProfiles(base, latestEnvelope.profile, cloudEnvelope.profile)
        if (!combined) return null
      }
    }
    let prepared
    let profile
    try {
      prepared = prepareEnvelope(importEnvelope({ ...cloudEnvelope, profile: combined }))
      profile = importEnvelope(prepared)
    } catch { return { status: 'recovering' } }
    if (!isRecord(profile)) return { status: 'recovering' }
    const repairChanges = captureProfileChanges(cloudEnvelope.profile, prepared.profile)
    if (!repairChanges) return null
    const next = createSyncRecord(cloudIdentity)
    const repairOperationId = createOperationId()
    if (record.protectedConflictIds?.length) next.protectedConflictIds = [...record.protectedConflictIds]
    if (portableProfileChangeDigest(prepared.profile) !== portableProfileChangeDigest(cloudEnvelope.profile)) {
      const changes = captureProfileChanges(cloudEnvelope.profile, prepared.profile)
      next.pending = {
        activationId: pending.activationId, baseRevision: cloudIdentity.revision,
        ...(changes ? { changes: { ...changes, baseRevision: cloudIdentity.revision } } : {}),
        envelope: null, generation: cloudIdentity.generation, integrity: prepared.integrity,
        nextRetryAt: Math.max(nextAutomaticWriteAt, pending.nextRetryAt), operationId: repairOperationId,
        ownerId: cloudIdentity.ownerId, prepared, profileId: cloudIdentity.profileId,
        retryCount: 0, revision: cloudIdentity.revision + 1
      }
    }
    const protectedResult = await readStoredProtectedConflicts(record, new Map(), { deferPruning: true })
    if (!protectedResult || !isCurrent() || readStoredSyncRecord().serialized !== captured.serialized) return { status: 'recovering' }
    const repairSerialized = JSON.stringify({ version: 1, identity: cloudIdentity,
      sourceDigest: sha256Base64UrlSync(captured.serialized), operationId: repairOperationId, changes: repairChanges })
    try {
      storage.setItem(handoffRepairStorageKey, repairSerialized)
      if (storage.getItem(handoffRepairStorageKey) !== repairSerialized) return { status: 'recovering' }
    } catch { return { status: 'recovering' } }
    cloudHeadKnown = true
    return {
      status: 'activate', backupRequired: false, created: false, ...cloudIdentity, profile,
      syncBaseProfile: cloudEnvelope.profile, protectedConflicts: protectedResult.conflicts,
      commitSyncRepair({ isCurrent: current } = {}) {
        if (!current?.() || readStoredSyncRecord().serialized !== captured.serialized || readDirtyRecord().present) return false
        // Install the merged profile locally before replacing the old outbox.
        // Failed installation leaves the complete original candidate intact.
        if (!writeSyncRecord(next) || !current()) return false
        try { storage.removeItem(handoffRepairStorageKey) } catch { return false }
        return current()
      },
      finalize({ isCurrent: current } = {}) { return Boolean(current?.()) && clearOnboardingDraft() }
    }
  }

  async function resolve({
    authentication,
    connectivity,
    accountlessAttachment,
    localProfile,
    purpose,
    isCurrent = () => true
  }) {
    if (purpose === 'migrate-accountless-profile') {
      return resolveAccountlessMigration({
        authentication,
        connectivity,
        accountlessAttachment,
        localProfile
      })
    }
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
    const malformedImportRepair = durableRecovery.malformedImportRepair || null
    localProfile = durableRecovery.localProfile
    if (handoffEnabled && !recoverHandoffInstallation(localProfile, authentication.userId, isCurrent)) return { status: 'recovering' }
    if (purpose === 'link-accountless-profile') {
      return { status: 'migrating' }
    }

    const localWasEmptyBeforeRequest = localProfile?.status === 'empty'
    const storedSyncBeforeRequest = readStoredSyncRecord()
    const dirtyBeforeRequest = readDirtyRecord()

    let onboardingEnvelope = null
    if (
      localProfile?.status === 'empty'
      || purpose === 'replace-owner-profile'
      || hasExplicitOnboardingProfileDraft()
    ) {
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
      return { status: 'onboarding-required' }
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
    ) {
      return resolveRecoveryCandidates({
        authentication,
        localProfile,
        reason: LEARNER_PROFILE_RECOVERY_REASONS.CURRENT_HEAD_UNUSABLE
      })
    }
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
    const freshSignedInProfile = row.created === true
      && hasExplicitOnboardingProfileDraft()
      && localProfile?.status === 'ready'
      && localProfile.ownerId === authentication.userId
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
    let backupRequired = !freshSignedInProfile
      && localProfile?.status === 'ready'
      && localProfile.ownerId === authentication.userId
      && isRecord(localProfile.profile)
      && localProfile.generation === undefined
      && localProfile.revision === undefined
    const cloudIdentity = {
      generation,
      ownerId: authentication.userId,
      profileId,
      revision
    }
    const storedSync = readStoredSyncRecord()
    let currentRecord = storedSync.record
    let syncRecordRepair = null
    let dirtyRecordRepair = null
    const staleEmptyBinding = localWasEmptyBeforeRequest
      && localProfile?.status === 'empty'
      && currentRecord
      && currentRecord.ownerId === cloudIdentity.ownerId
      && currentRecord.profileId === cloudIdentity.profileId
      && currentRecord.generation === cloudIdentity.generation
      && currentRecord.acceptedRevision < revision
      && currentRecord.pending === null
      && currentRecord.queued === null
    const mustDeferSyncRecord = staleEmptyBinding || (!currentRecord
      && (storedSync.present || malformedImportRepair))
    if (mustDeferSyncRecord) {
      if (
        !localWasEmptyBeforeRequest
        || localProfile?.status !== 'empty'
        || !storedSyncBeforeRequest.readable
        || !storedSync.readable
        || (!staleEmptyBinding && storedSyncBeforeRequest.record)
        || readDirtyRecord().present
        || storedSyncBeforeRequest.serialized !== storedSync.serialized
      ) return { status: 'recovering' }
      currentRecord = createSyncRecord(cloudIdentity)
      syncRecordRepair = {
        expectedSerialized: storedSync.serialized,
        key: syncStorageKey,
        nextSerialized: JSON.stringify(currentRecord)
      }
    }
    if (freshSignedInProfile) {
      if (!removeDirtyRecord()) return { status: 'recovering' }
      currentRecord = ensureSyncRecord(cloudIdentity)
      if (!currentRecord) return { status: 'recovering' }
    }
    if (
      currentRecord
      && currentRecord.ownerId === cloudIdentity.ownerId
      && currentRecord.profileId !== cloudIdentity.profileId
      && currentRecord.pending === null
      && currentRecord.queued === null
      && localProfile?.status === 'ready'
      && localProfile.ownerId === cloudIdentity.ownerId
      && canonicalProfilesMatch(
        localProfile.profile,
        envelope,
        prepareEnvelope
      )
    ) {
      if (!clearDirtyRecord(currentRecord)) return { status: 'recovering' }
      if (!commitCloudHead(cloudIdentity, currentRecord)) {
        return { status: 'recovering' }
      }
      currentRecord = readSyncRecord()
      if (!currentRecord) return { status: 'recovering' }
    }
    const acceptedRevisionAtStart = currentRecord?.acceptedRevision
    const hadPendingOperation = Boolean(currentRecord?.pending)
    let profile = backupRequired ? localProfile.profile : cloudProfile
    let protectedReset = null
    if (currentRecord) {
      if (
        currentRecord.version !== 1
        || currentRecord.ownerId !== authentication.userId
        || currentRecord.profileId !== profileId
      ) return { status: 'recovering' }
      if (currentRecord.generation !== generation) {
        // A valid current head is authoritative even after several resets or
        // reset-receipt retention expiry. Older unsynced work needs an explicit
        // whole-profile choice; it must never disappear during this handoff.
        const dirty = readDirtyRecord()
        const localIsCurrent = isVerifiedCurrentLocalCopy(
          localProfile, cloudIdentity, envelope, prepareEnvelope
        )
        const localIsStale = localProfile?.status === 'ready'
          && localProfile.ownerId === authentication.userId
          && localProfile.profileId === profileId
          && localProfile.generation === currentRecord.generation
          && normalizePositiveInteger(localProfile.revision)
          && localProfile.revision <= currentRecord.acceptedRevision
        if (
          !storedSyncBeforeRequest.readable
          || storedSyncBeforeRequest.serialized !== storedSync.serialized
          || dirtyBeforeRequest.serialized !== dirty.serialized
          || (localIsCurrent && (currentRecord.pending || currentRecord.queued))
          || (!localIsCurrent && !localIsStale && localProfile?.status !== 'empty')
        ) return { status: 'recovering' }

        const hasUnsyncedWork = dirty.present || currentRecord.pending || currentRecord.queued
        if (hasUnsyncedWork && !localIsCurrent) {
          if (!localIsStale || !dirtyRecordMatches(currentRecord, dirty)) {
            return { status: 'recovering' }
          }
          if (dirty.present && !queueProfile(
            localProfile.profile, currentRecord, `dirty-recovery-${createOperationId()}`
          )) return { status: 'recovering' }
          if (currentRecord.queued) {
            // Only the latest complete local snapshot goes to cross-generation
            // choice. The older request cannot advance this newer cloud head.
            currentRecord.pending = currentRecord.queued
            currentRecord.pending.baseRevision = currentRecord.acceptedRevision
            currentRecord.pending.revision = currentRecord.acceptedRevision + 1
            currentRecord.queued = null
            if (!writeSyncRecord(currentRecord)) return { status: 'recovering' }
          }
          const operation = currentRecord.pending
          if (!operation) return { status: 'recovering' }
          let preserved
          let candidate
          let candidateSync
          try {
            candidate = await finalizeDurableOperation(operation)
            candidateSync = readStoredSyncRecord()
            if (candidateSync.record?.pending?.operationId !== operation.operationId) {
              return { status: 'recovering' }
            }
            preserved = await getClient().rpc(
              'commit_my_learner_profile', operationParameters(operation, candidate)
            )
          } catch {
            return waitForCloudHead()
          }
          const receipt = readSingleRpcRow(preserved?.data)
          if (!preserved?.error && receipt?.status === 'conflict') {
            return resolvePreservedConflict(receipt, operation, { isCurrent })
          }
          if (preserved?.error && isTransientCloudStatus(preserved.status)) {
            return waitForCloudHead()
          }
          // A lost acknowledgment can leave work pending although that exact
          // local snapshot was already accepted before the reset. That receipt
          // proves it is a clean stale copy; opening the current head is safe.
          if (
            preserved?.error
            || !isAcceptedOperationReceipt(receipt, operation, candidate, ['already_accepted'])
            || !canonicalProfilesMatch(localProfile.profile, candidate, prepareEnvelope)
            || readStoredSyncRecord().serialized !== candidateSync.serialized
          ) return { status: 'recovering' }
          storedSync.serialized = candidateSync.serialized
        }
        if (dirty.present) {
          if (!dirtyRecordMatches(cloudIdentity, dirty)) return { status: 'recovering' }
          // Exact current-head equality makes this stale marker redundant.
          dirtyRecordRepair = {
            expectedSerialized: dirty.serialized,
            key: dirtyStorageKey,
            nextSerialized: null
          }
        }
        const nextRecord = createSyncRecord(cloudIdentity)
        if (currentRecord.protectedConflictIds?.length) {
          nextRecord.protectedConflictIds = [...currentRecord.protectedConflictIds]
        }
        syncRecordRepair = {
          expectedSerialized: storedSync.serialized,
          key: syncStorageKey,
          nextSerialized: JSON.stringify(nextRecord)
        }
        currentRecord = nextRecord
        if (generation === storedSync.record.generation + 1) {
          const resetReceipt = await readResetReceipt(cloudIdentity)
          protectedReset = resetReceipt?.protectedReset || null
        }
      }
      const dirty = readDirtyRecord()
      if (dirty.present && !dirtyRecordRepair) {
        if (
          !dirtyRecordMatches(currentRecord, dirty)
          || localProfile?.status !== 'ready'
          || localProfile.ownerId !== authentication.userId
          || localProfile.profileId !== profileId
          || !await queueDirtyProfile(
            localProfile.profile, currentRecord, dirty, isCurrent
          )
        ) return { status: 'recovering' }
        currentRecord = readSyncRecord()
        if (!currentRecord) return { status: 'recovering' }
      }
      if (handoffEnabled && currentRecord.pending && currentRecord.generation === generation
        && currentRecord.pending.baseRevision < revision && localProfile?.status === 'ready'
        && localProfile.ownerId === authentication.userId && localProfile.profileId === profileId) {
        const handoff = await prepareHandoffResolution({ authentication, localProfile, cloudIdentity,
          cloudEnvelope: envelope, record: currentRecord, isCurrent })
        if (handoff) return handoff
        currentRecord = readSyncRecord()
        if (!currentRecord?.pending) return { status: 'recovering' }
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
            return resolvePreservedConflict(receipt, currentRecord.pending, { isCurrent })
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
                readSyncRecord()?.pending,
                { isCurrent }
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
    } else if (!syncRecordRepair) {
      currentRecord = ensureSyncRecord({
        generation,
        ownerId: authentication.userId,
        profileId,
        revision
      })
      if (!currentRecord) return { status: 'recovering' }
    }

    if (!syncRecordRepair) currentRecord = readSyncRecord()
    const protectedResult = await readStoredProtectedConflicts(
      currentRecord, new Map(), { deferPruning: Boolean(syncRecordRepair) }
    )
    if (!protectedResult) return { status: 'recovering' }
    if (syncRecordRepair) {
      if (protectedResult.retainedIds.length) {
        currentRecord.protectedConflictIds = protectedResult.retainedIds
      } else delete currentRecord.protectedConflictIds
      syncRecordRepair.nextSerialized = JSON.stringify(currentRecord)
    }

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
      if (
        !canonicalProfilesMatch(
          localProfile.profile,
          envelope,
          prepareEnvelope
        )
      ) {
        const currentCheckpoint = matchesLocalIslandCheckpoint(localProfile, {
          ownerId: authentication.userId, profileId, generation, revision
        })
        if (currentCheckpoint) {
          // A receipt can advance the sync revision before local identity
          // metadata is updated. The exact clean checkpoint still proves its
          // content belongs to this accepted head.
          profile = localProfile.profile
        }
        // An earlier opening may advance the sync marker without activating
        // its result. Only the local profile's own revision proves this is an
        // unqueued change to the current cloud head rather than an older copy.
        else if (localProfile.revision === revision) {
          profile = localProfile.profile
          backupRequired = true
        }
      } else {
        profile = retainLocalFeedCache(cloudProfile, localProfile.profile)
      }
    }

    const syncRepairs = [
      ...(malformedImportRepair ? [malformedImportRepair] : []),
      ...(dirtyRecordRepair ? [dirtyRecordRepair] : []),
      ...(syncRecordRepair ? [syncRecordRepair] : [])
    ]
    cloudHeadKnown = true
    return {
      backupRequired,
      ...(handoffEnabled ? { syncBaseProfile: envelope.profile } : {}),
      ...(syncRepairs.length ? {
        commitSyncRepair({ isCurrent } = {}) {
          if (
            typeof isCurrent !== 'function'
            || !isCurrent()
            || (readDirtyRecord().present && !dirtyRecordRepair)
            || !syncRepairs.every(storedRepairMatches)
            || !isCurrent()
          ) return false
          for (const repair of syncRepairs) {
            if (!commitStoredRepair(repair, { isCurrent })) return false
          }
          return true
        }
      } : {}),
      created: row.created === true,
      finalize({ isCurrent } = {}) {
        if (typeof isCurrent !== 'function' || !isCurrent()) return false
        if (!clearOnboardingDraft()) return false
        if (
          recoveryFinalizationOperation
          && !clearRecoveryOperation(recoveryFinalizationOperation)
        ) return false
        return true
      },
      ...(freshSignedInProfile ? { freshProfile: true } : {}),
      generation,
      ownerId: authentication.userId,
      profile,
      profileId,
      protectedConflicts: protectedResult.conflicts,
      protectedReset,
      revision,
      status: 'activate'
    }
  }

  // Unlike resolve(), this read never opens, repairs or installs a profile.
  // Compare with live bookkeeping after the request: the save pump keeps running.
  async function checkActiveHead({ activation, isCurrent, preflight = false } = {}) {
    const binding = activeBinding
    const current = () => binding && activeBinding === binding
      && binding.activation === activation && isCurrent?.() && binding.isCurrent()
    if (!current()) return { status: 'stale' }
    if (!isOnline()) return { status: 'waiting' }
    let response
    const cancellation = new AbortController()
    headRequests.add(cancellation)
    try {
      const request = getClient().from('learner_profile_heads')
        .select('user_id,profile_id,generation,revision')
        .eq('user_id', activation.ownerId).maybeSingle()
      response = await (typeof request?.abortSignal === 'function' ? request.abortSignal(cancellation.signal) : request)
    } catch { return { status: current() ? 'waiting' : 'stale' } }
    finally { headRequests.delete(cancellation) }
    if (!current()) return { status: 'stale' }
    if (response?.error) {
      return { status: isTransientCloudStatus(response.status) ? 'waiting'
        : response.status === 401 ? 'waiting-authentication' : 'reopen' }
    }
    const head = response?.data
    const record = readSyncRecord()
    const dirty = readDirtyRecord()
    if (!record || record.ownerId !== activation.ownerId
      || record.profileId !== activation.profileId
      || record.generation !== binding.generation
      || !dirtyRecordMatches(record, dirty)) return { status: 'reopen' }
    if (!head || head.user_id !== activation.ownerId
      || !UUID_PATTERN.test(String(head.profile_id || ''))
      || !normalizePositiveInteger(head.generation)
      || !normalizePositiveInteger(head.revision)) return { status: 'reopen' }
    if (head.profile_id === record.profileId && head.generation === record.generation
      && head.revision <= record.acceptedRevision) {
      // A read captured before an acknowledged local save is also harmless.
      cloudHeadKnown = true
      if (record.pending && !preflight) retryWhenAvailable()
      return { status: 'unchanged' }
    }
    if (record.pending || record.queued || dirty.present) {
      if (handoffEnabled) return { status: 'changed' }
      // Let local persistence finish before its existing save enqueues work.
      // Reuse the durable pending/queued candidates; never capture an unpersisted
      // live snapshot here or start another save pipeline.
      if (record.pending) void pump()
      return { status: 'reconciling' }
    }
    return { status: 'changed' }
  }

  function activate({ activation, baseProfile, generation, isCurrent, profile, revision, readPersistedProfile }) {
    deferredSave = null
    preparationWaitAt = null
    deliveryWaitAt = null
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
      checkpointStudyDigest: isRecord(profile) ? studyProfileDigest(profile) : null,
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
    if (handoffEnabled && isRecord(profile)) {
      const candidate = record.queued || record.pending
      activeBinding.baseProfile = baseProfile || (candidate?.changes
        ? restoreProfileBase((candidate.envelope || candidate.prepared)?.profile, candidate.changes) : null)
      if (!activeBinding.baseProfile && !record.pending && !dirty.present) {
        activeBinding.baseProfile = prepareEnvelope(profile).profile
      }
    }
    // Cached offline opening can bypass resolve(). Recreate the deferred work
    // from durable local state before an old candidate is allowed to advance.
    if (handoffEnabled && typeof getSyncOpportunity === 'function'
      && dirty.present && typeof readPersistedProfile === 'function') {
      const candidate = record.queued || record.pending
      deferredSave = { binding: activeBinding, isCurrent, readPersistedProfile,
        blocked: !activeBinding.baseProfile || candidate?.changes?.baseRevision !== record.acceptedRevision }
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

  function save(profile, { activation, isCurrent, readPersistedProfile, skipDeferral = false, skipPump = false } = {}) {
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

    const latest = record.queued || record.pending
    if (!skipDeferral && !inFlight && handoffEnabled
      && typeof getSyncOpportunity === 'function' && typeof readPersistedProfile === 'function'
      && activeBinding.baseProfile && latest?.changes
      && latest.changes.baseRevision === record.acceptedRevision
      && readDirtyRecord().present
      && waitForOpportunity()) {
      deferredSave = { binding: activeBinding, isCurrent, readPersistedProfile }
      return { status: 'queued' }
    }

    if (minimumWriteIntervalMs > 0 && !record.pending && !record.queued
      && activeBinding.acceptedProfileDigest) {
      try {
        if (syncProfileDigest(profile) === activeBinding.acceptedProfileDigest
          && clearDirtyRecord(record)) {
          publish('up-to-date')
          return { status: 'queued' }
        }
      } catch { /* Preparation errors use the normal durable-save failure path. */ }
    }
    if (!queueProfile(profile, record, activation.id)) {
      publish('not-backed-up')
      return { status: 'not-backed-up' }
    }
    if (deferredSave?.binding === activeBinding) deferredSave = null
    preparationWaitAt = null
    if (!skipPump) void pump()
    return { status: 'queued' }
  }

  function resumePendingOperation({ restartBackoff }) {
    const record = readSyncRecord()
    if (!record?.pending) return false
    if (!isOnline()) {
      publish('waiting')
      return false
    }
    record.pending.nextRetryAt = restartBackoff || !handoffEnabled ? 0 : Math.max(record.pending.nextRetryAt, nextAutomaticWriteAt)
    if (restartBackoff) {
      record.pending.retryCount = 0
      if (record.queued) record.queued.nextRetryAt = 0
    }
    if (!writeSyncRecord(record)) {
      publish('needs-attention')
      return false
    }
    void pump()
    return true
  }

  function retry() {
    forceOpportunity = true
    try { return drainDeferredSave() && resumePendingOperation({ restartBackoff: true }) }
    finally { forceOpportunity = false }
  }

  function flushSessionBoundary({ allowNewUpload = true } = {}) {
    // Even a terminal pagehide preserves the latest journal. It does not start
    // a new request when the lifecycle has already retired upload authority.
    forceOpportunity = true
    try { if (!drainDeferredSave()) return false } finally { forceOpportunity = false }
    const record = readSyncRecord()
    if (!handoffEnabled || !activeBinding?.isCurrent() || !record?.pending
      || record.pending.retryCount >= MAX_AUTOMATIC_RETRIES) return false
    if (!allowNewUpload) return inFlight ? Promise.allSettled([...pumpTasks]).then(() => true) : false
    if (record.pending.budgetRetryAt > now()) return true
    sessionBoundaryPending = true
    // The server enforces one early flush per profile per five minutes. In-flight
    // work stays immutable and later input remains in the existing outbox.
    if (inFlight) {
      const binding = activeBinding
      const operationId = record.pending.operationId
      return Promise.allSettled([...pumpTasks]).then(() => {
        // An ordinary upload already in progress may acknowledge an older
        // locally saved snapshot. Give its promoted candidate one final attempt,
        // while preserving server deferrals and avoiding a second retry of the
        // same failed request or parallel delivery from repeated hide events.
        if (activeBinding !== binding || !binding.isCurrent() || inFlight
          || readSyncRecord()?.pending?.operationId === operationId) return true
        return flushSessionBoundary() || true
      })
    }
    record.pending.nextRetryAt = 0
    if (!writeSyncRecord(record)) return false
    return pump().then(() => true)
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

  function cancelHeadChecks({ activation } = {}) {
    if (activeBinding?.activation !== activation) return false
    // Keep the captured binding for protected import confirmation/rollback.
    // Its local activation fence retires writes; only head reads are cancelled.
    for (const request of headRequests) request.abort()
    headRequests.clear()
    return true
  }

  function destroy() {
    for (const request of headRequests) request.abort()
    headRequests.clear()
    if (!started) return
    eventTarget.removeEventListener('online', retryWhenAvailable)
    eventTarget.removeEventListener('focus', retryWhenAvailable)
    activeBinding = null
    deferredSave = null
    cloudHeadKnown = false
    started = false
  }

  return Object.freeze({
    activate,
    checkActiveHead,
    chooseConflict,
    commitReplacement,
    confirmImport,
    destroy,
    flushSessionBoundary,
    getState: () => syncState,
    requiresCloudHeadResolution,
    getReplacementProtection,
    importProfile,
    markDirty,
    markLocalIslandCheckpoint,
    readProtectedConflict,
    readProtectedReset,
    readResetState,
    readRecoveryCandidate,
    cancelHeadChecks,
    resolve,
    restoreRecoveryCandidate,
    retry,
    rollbackImport,
    save,
    start,
    startOver,
    subscribe,
    undoStartOver
  })
}
