import {
  LEARNER_PROFILE_RESOLUTION_STATUSES
} from '../domain/learner-profile-resolution.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function readResolutionRow(data) {
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
      return isRecord(record) ? record : null
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
    let finalized
    try {
      finalized = await finalizeEnvelope(operation.prepared)
    } catch {
      inFlight = false
      publish('needs-attention')
      return
    }
    let response
    try {
      response = await getClient().rpc(
        'commit_my_learner_profile',
        operationParameters(operation, finalized.envelope)
      )
    } catch {
      inFlight = false
      if (isOnline()) scheduleTransientRetry(operation)
      else publish('waiting')
      return
    }
    try {
      const row = readResolutionRow(response?.data)
      if (response?.error && isTransientCloudStatus(response.status)) {
        scheduleTransientRetry(operation)
      } else if (
        !response?.error
        && ['accepted', 'already_accepted'].includes(row?.status)
        && row.profile_id === operation.profileId
        && normalizePositiveInteger(row.generation) === operation.generation
        && normalizePositiveInteger(row.base_revision) === operation.baseRevision
        && normalizePositiveInteger(row.revision) === operation.baseRevision + 1
        && row.payload_sha256
          === finalized.envelope?.integrity?.payloadSha256
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

    const row = readResolutionRow(data)
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
      if (currentRecord.pending) {
        if (
          currentRecord.pending.baseRevision + 1 === revision
          && localProfile?.status === 'ready'
          && localProfile.ownerId === authentication.userId
          && localProfile.profileId === profileId
        ) {
          let finalized
          let receiptResponse
          try {
            finalized = await finalizeEnvelope(currentRecord.pending.prepared)
            receiptResponse = await getClient().rpc(
              'commit_my_learner_profile',
              operationParameters(
                currentRecord.pending,
                finalized.envelope
              )
            )
          } catch {
            return { status: 'waiting-cloud' }
          }
          const receipt = readResolutionRow(receiptResponse?.data)
          if (
            receiptResponse?.error
            || receipt?.status !== 'already_accepted'
            || receipt.profile_id !== profileId
            || normalizePositiveInteger(receipt.generation) !== generation
            || normalizePositiveInteger(receipt.base_revision)
              !== currentRecord.pending.baseRevision
            || normalizePositiveInteger(receipt.revision) !== revision
            || receipt.payload_sha256
              !== finalized.envelope?.integrity?.payloadSha256
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
    ) return false
    if (record.pending) record.pending.activationId = activation.id
    if (record.queued) record.queued.activationId = activation.id
    if (!writeSyncRecord(record)) {
      publish('needs-attention')
      return false
    }
    publish(
      record.pending
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
    ) return { status: 'needs-attention' }

    let prepared
    try {
      prepared = prepareEnvelope(profile)
    } catch {
      return { status: 'needs-attention' }
    }
    const baseRevision = record.pending
      ? record.pending.baseRevision + 1
      : record.acceptedRevision
    const operation = {
      activationId: activation.id,
      baseRevision,
      generation: record.generation,
      operationId: createOperationId(),
      ownerId: record.ownerId,
      prepared,
      profileId: record.profileId,
      retryCount: 0,
      nextRetryAt: 0
    }
    if (record.pending) record.queued = operation
    else record.pending = operation
    if (!writeSyncRecord(record)) return { status: 'needs-attention' }
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
    destroy,
    getState: () => syncState,
    resolve,
    retry,
    save,
    start,
    subscribe
  })
}
