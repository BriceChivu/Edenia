import {
  canonicalizeJson,
  sha256Base64Url
} from './portable-state.js'

export const LEGACY_PROGRESS_MIGRATION_SCHEMA =
  'edenia-legacy-progress-migration-v1'

const MARKER_STATUSES = new Set([
  'checked_none',
  'completed',
  'deferred',
  'destination_present',
  'local_saved_pending_ack'
])
const AUTOMATIC_STOP_STATUSES = new Set([
  'checked_none',
  'completed',
  'deferred',
  'destination_present'
])
const DIGEST_PATTERN = /^[A-Za-z0-9_-]{43}$/

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function canonicalIsoDate(value) {
  if (typeof value !== 'string' || !value) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}

function readMarker(storage, markerKey) {
  try {
    const value = JSON.parse(storage.getItem(markerKey))
    if (
      !value
      || typeof value !== 'object'
      || Array.isArray(value)
      || value.schema !== LEGACY_PROGRESS_MIGRATION_SCHEMA
      || !MARKER_STATUSES.has(value.status)
      || !canonicalIsoDate(value.updatedAt)
    ) return null
    const expectedKeys = value.status === 'local_saved_pending_ack'
      ? ['capabilityDigest', 'schema', 'status', 'updatedAt']
      : ['schema', 'status', 'updatedAt']
    const actualKeys = Object.keys(value).sort()
    if (
      actualKeys.length !== expectedKeys.length
      || !actualKeys.every((key, index) => (
        key === [...expectedKeys].sort()[index]
      ))
      || (
        value.status === 'local_saved_pending_ack'
        && !DIGEST_PATTERN.test(value.capabilityDigest || '')
      )
    ) return null
    return value
  } catch {
    return null
  }
}

function writeMarker(storage, markerKey, status, now, capabilityDigest = null) {
  const marker = {
    schema: LEGACY_PROGRESS_MIGRATION_SCHEMA,
    status,
    updatedAt: now().toISOString()
  }
  if (status === 'local_saved_pending_ack') {
    if (!DIGEST_PATTERN.test(capabilityDigest || '')) return false
    marker.capabilityDigest = capabilityDigest
  }
  try {
    storage.setItem(markerKey, JSON.stringify(marker))
    return JSON.stringify(readMarker(storage, markerKey)) === JSON.stringify(marker)
  } catch {
    return false
  }
}

export function createLegacyProgressMigrationController({
  automaticEnabled,
  createVerifiedBackupFromState,
  decorateMigratedState,
  decryptTransfer,
  destinationEligible,
  deriveCapabilityDigest,
  getBackupEntries,
  helperUrl,
  markerKey,
  navigate,
  normalizeImportedState,
  now = () => new Date(),
  onManualImport,
  onResume,
  prepareStateForHash,
  primaryKey,
  relayClient,
  runtimeValid,
  saveImportedState,
  storage,
  takeFragment,
  view
}) {
  const requiredFunctions = {
    createVerifiedBackupFromState,
    decorateMigratedState,
    decryptTransfer,
    deriveCapabilityDigest,
    getBackupEntries,
    navigate,
    normalizeImportedState,
    onManualImport,
    onResume,
    prepareStateForHash,
    saveImportedState,
    takeFragment
  }
  if (
    typeof automaticEnabled !== 'boolean'
    || typeof destinationEligible !== 'boolean'
    || typeof runtimeValid !== 'boolean'
    || !storage
    || typeof storage.getItem !== 'function'
    || typeof storage.setItem !== 'function'
    || !markerKey
    || !primaryKey
    || !relayClient
    || !view
    || Object.values(requiredFunctions).some(value => typeof value !== 'function')
  ) throw new TypeError('Legacy progress migration dependencies are incomplete')

  let retainedCapability = null
  let retainedCapabilityDigest = null
  let retainedTransaction = null

  async function stateHash(state) {
    const prepared = prepareStateForHash(cloneJson(state))
    if (!prepared) throw new Error('Legacy progress state is invalid')
    return sha256Base64Url(canonicalizeJson(prepared))
  }

  function destinationPresent() {
    try {
      if (storage.getItem(primaryKey) !== null) return true
    } catch {
      return true
    }
    try {
      return getBackupEntries().length > 0
    } catch {
      return true
    }
  }

  function readNormalizedPrimary() {
    let raw
    try {
      raw = storage.getItem(primaryKey)
    } catch {
      return { raw: null, state: null, unreadable: true }
    }
    if (raw === null) return { raw: null, state: null }
    try {
      return { raw, state: normalizeImportedState(JSON.parse(raw)) }
    } catch {
      return { raw, state: null, unreadable: true }
    }
  }

  async function findVerifiedBackup(entry, reason, expectedHash) {
    if (!entry?.id) return null
    const stored = getBackupEntries().find(candidate => candidate.id === entry.id)
    if (!stored || stored.reason !== reason) return null
    return await stateHash(stored.state) === expectedHash ? stored : null
  }

  async function ensureIncomingBackup(reason, state, expectedHash) {
    const entry = await createVerifiedBackupFromState(reason, state)
    return findVerifiedBackup(entry, reason, expectedHash)
  }

  function remember(status, capabilityDigest = null) {
    return writeMarker(
      storage,
      markerKey,
      status,
      now,
      capabilityDigest
    )
  }

  async function completeOrRememberPending(capabilityDigest) {
    try {
      await relayClient.complete(capabilityDigest)
      remember('completed')
      return true
    } catch {
      remember('local_saved_pending_ack', capabilityDigest)
      view.showPendingCleanup?.()
      return false
    }
  }

  function showRecoverableFailure(retry) {
    view.showFailure({
      onContinue() {
        remember('deferred')
        view.hide?.()
        onResume()
      },
      onManualImport() {
        onManualImport(() => {
          remember('deferred')
          view.hide?.()
          onResume()
        })
      },
      onRetry() {
        void retry().then(disposition => {
          if (disposition === 'continue') onResume()
        })
      }
    })
  }

  async function prepareRetainedTransaction() {
    if (retainedTransaction) return retainedTransaction
    try {
      const capabilityDigest = retainedCapabilityDigest
        || await deriveCapabilityDigest(retainedCapability)
      retainedCapabilityDigest = capabilityDigest
      const claimed = await relayClient.claim(capabilityDigest)
      const envelope = await decryptTransfer({
        capability: retainedCapability,
        ciphertext: claimed.ciphertext,
        ciphertextDigest: claimed.ciphertextDigest,
        iv: claimed.iv
      })
      const incomingState = normalizeImportedState(envelope?.state)
      if (!incomingState) throw new Error('Legacy progress state is invalid')
      const incomingHash = await stateHash(incomingState)
      const existing = readNormalizedPrimary()
      const hadDestination = destinationPresent()
      const existingHash = existing.state
        ? await stateHash(existing.state)
        : null
      retainedTransaction = {
        activityContext: {
          createdAt: envelope.createdAt,
          stateSha256: envelope.stateSha256
        },
        capabilityDigest,
        existingRaw: existing.raw,
        incomingHash,
        incomingState,
        intendedHash: null,
        intendedState: null,
        mode: !hadDestination
          ? 'empty'
          : existingHash === incomingHash
            ? 'same'
            : 'conflict'
      }
      return retainedTransaction
    } catch {
      showRecoverableFailure(async () => {
        navigate(helperUrl)
        return 'redirected'
      })
      return null
    }
  }

  async function applyRetainedTransaction(transaction) {
    const {
      capabilityDigest,
      existingRaw,
      incomingHash,
      incomingState,
      mode
    } = transaction
    try {
      if (mode === 'same') {
          const recoveryBackup = await ensureIncomingBackup(
            'legacy origin recovery',
            incomingState,
            incomingHash
          )
          if (!recoveryBackup) throw new Error('Recovery backup failed')
          if (storage.getItem(primaryKey) !== existingRaw) {
            throw new Error('Destination changed during recovery')
          }
          const completed = await completeOrRememberPending(capabilityDigest)
          if (completed) view.showRecovered?.({ alreadyPresent: true })
          return 'continue'
      }

      if (mode === 'conflict') {
        const conflictBackup = await ensureIncomingBackup(
          'legacy origin conflict',
          incomingState,
          incomingHash
        )
        if (!conflictBackup) throw new Error('Conflict backup failed')
        if (storage.getItem(primaryKey) !== existingRaw) {
          throw new Error('Destination changed during recovery')
        }
        const completed = await completeOrRememberPending(capabilityDigest)
        if (completed) view.showConflict?.()
        return 'continue'
      }

      const recoveryBackup = await ensureIncomingBackup(
        'legacy origin recovery',
        incomingState,
        incomingHash
      )
      if (!recoveryBackup) throw new Error('Recovery backup failed')

      if (!transaction.intendedState) {
        transaction.intendedState = cloneJson(incomingState)
        decorateMigratedState(
          transaction.intendedState,
          transaction.activityContext
        )
        transaction.intendedHash = await stateHash(transaction.intendedState)
      }
      const saved = await saveImportedState(transaction.intendedState, {
        preserveBackupId: recoveryBackup.id
      })
      if (!saved?.persisted) throw new Error('Imported state could not be saved')
      const persisted = readNormalizedPrimary()
      if (
        !persisted.state
        || await stateHash(persisted.state) !== transaction.intendedHash
      ) {
        throw new Error('Imported state read-back failed')
      }
      const completed = await completeOrRememberPending(capabilityDigest)
      if (completed) view.showRecovered?.({ alreadyPresent: false })
      return 'continue'
    } catch {
      showRecoverableFailure(processRetainedTransfer)
      return 'waiting'
    }
  }

  async function processRetainedTransfer() {
    view.showWorking?.()
    const transaction = await prepareRetainedTransaction()
    return transaction ? applyRetainedTransaction(transaction) : 'waiting'
  }

  async function retryPendingCompletion(marker) {
    try {
      await relayClient.complete(marker.capabilityDigest)
      remember('completed')
    } catch {
      view.showPendingCleanup?.()
    }
  }

  async function runBeforeApplicationStart() {
    const fragment = takeFragment()
    if (!destinationEligible) return { disposition: 'continue' }
    if (fragment?.startsWith('transfer.')) {
      retainedCapability = fragment.slice('transfer.'.length)
      retainedCapabilityDigest = null
      retainedTransaction = null
      const disposition = await processRetainedTransfer()
      return { disposition }
    }
    if (fragment === 'none') {
      remember('checked_none')
      return { disposition: 'continue' }
    }
    if (fragment === 'deferred') {
      remember('deferred')
      return { disposition: 'continue' }
    }

    const marker = readMarker(storage, markerKey)
    if (marker?.status === 'local_saved_pending_ack') {
      await retryPendingCompletion(marker)
      return { disposition: 'continue' }
    }
    if (!automaticEnabled || AUTOMATIC_STOP_STATUSES.has(marker?.status)) {
      return { disposition: 'continue' }
    }
    if (destinationPresent()) {
      remember('destination_present')
      return { disposition: 'continue' }
    }
    if (!runtimeValid) {
      showRecoverableFailure(async () => {
        navigate(helperUrl)
        return 'redirected'
      })
      return { disposition: 'waiting' }
    }

    const proceed = await view.waitForDisclosure({ delayMs: 1_500 })
    if (!proceed) {
      remember('deferred')
      return { disposition: 'continue' }
    }
    navigate(helperUrl)
    return { disposition: 'redirected' }
  }

  function startRecoveryFromSettings() {
    if (!runtimeValid) return false
    navigate(helperUrl)
    return true
  }

  return Object.freeze({
    runBeforeApplicationStart,
    startRecoveryFromSettings
  })
}
