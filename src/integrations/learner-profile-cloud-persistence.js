import {
  LEARNER_PROFILE_RESOLUTION_STATUSES
} from '../domain/learner-profile-resolution.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const MAX_AUTOMATIC_RETRIES = 5

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
  if (
    !hasExactKeys(value, [
      'acceptedRevision',
      'generation',
      'ownerId',
      'pending',
      'profileId',
      'queued',
      'version'
    ])
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
  let cloudHeadKnown = false
  let inFlight = false
  let retryTimer = null
  let started = false
  let syncState = Object.freeze({ status: 'idle' })
  const listeners = new Set()

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

  async function pump() {
    if (inFlight) return
    const record = readSyncRecord()
    const operation = record?.pending
    if (
      !operation
      || !activeBinding
      || !activeBinding.isCurrent()
      || operation.activationId !== activeBinding.activation.id
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
      stopAutomaticRetry(operation)
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
      if (isOnline()) scheduleTransientRetry(operation)
      else publish('waiting')
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
          } else {
            publish(current.pending ? 'syncing' : 'up-to-date', {
              accepted: {
                activation: activeBinding.activation,
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
        publish('conflicting', {
          conflict: {
            activation: activeBinding.activation,
            cloudGeneration: normalizePositiveInteger(row.generation),
            cloudRevision: normalizePositiveInteger(row.revision),
            generation: operation.generation,
            ownerId: operation.ownerId,
            profileId: operation.profileId
          }
        })
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

  async function resolve({ authentication, connectivity, localProfile, purpose }) {
    if (connectivity?.status !== 'online') {
      return waitForCloudHead()
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
    const backupRequired = localProfile?.status === 'ready'
      && localProfile.ownerId === authentication.userId
      && isRecord(localProfile.profile)
      && localProfile.generation === undefined
      && localProfile.revision === undefined
    let currentRecord = readSyncRecord()
    if (!currentRecord && hasStoredSyncRecord()) {
      return { status: 'recovering' }
    }
    let profile = backupRequired ? localProfile.profile : cloudProfile
    if (currentRecord) {
      if (
        currentRecord.version !== 1
        || currentRecord.ownerId !== authentication.userId
        || currentRecord.profileId !== profileId
        || currentRecord.generation !== generation
      ) return { status: 'recovering' }
      if (currentRecord.pending) {
        if (
          currentRecord.pending.baseRevision + 1 === revision
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
          if (
            receiptResponse?.error
            || !isAcceptedOperationReceipt(
              receipt,
              currentRecord.pending,
              pendingEnvelope,
              ['already_accepted']
            )
          ) return { status: 'conflicting' }
          currentRecord.acceptedRevision = revision
          currentRecord.pending = currentRecord.queued
          currentRecord.queued = null
          if (!writeSyncRecord(currentRecord)) return { status: 'recovering' }
          profile = localProfile.profile
        } else if (
          currentRecord.pending.baseRevision !== revision
          || localProfile?.status !== 'ready'
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
    } else if (!ensureSyncRecord({
      generation,
      ownerId: authentication.userId,
      profileId,
      revision
    })) return { status: 'recovering' }

    cloudHeadKnown = true
    return {
      backupRequired,
      created: row.created === true,
      finalize({ isCurrent } = {}) {
        if (typeof isCurrent !== 'function' || !isCurrent()) return false
        return clearOnboardingDraft()
      },
      generation,
      ownerId: authentication.userId,
      profile,
      profileId,
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
          : 'up-to-date'
    )
    void pump()
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

    let prepared
    try {
      prepared = prepareEnvelope(profile)
    } catch {
      publish('not-backed-up')
      return { status: 'not-backed-up' }
    }
    const baseRevision = record.pending
      ? record.pending.baseRevision + 1
      : record.acceptedRevision
    const operation = {
      activationId: activation.id,
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
    if (record.pending) record.queued = operation
    else record.pending = operation
    if (!writeSyncRecord(record)) {
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
    destroy,
    getState: () => syncState,
    requiresCloudHeadResolution,
    resolve,
    retry,
    save,
    start,
    subscribe
  })
}
