import { ACCOUNT_SESSION_STATES } from './account-auth-controller.js'

export const ACCOUNT_STUDY_SNAPSHOT_STATES = Object.freeze({
  SIGNED_OUT: 'signed-out',
  READY: 'ready',
  SYNCING: 'syncing',
  OWNER_MISMATCH: 'owner-mismatch',
  UNAVAILABLE: 'unavailable'
})

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function createAccountStudySnapshotController({
  client,
  storage,
  ownerStorageKey,
  createSnapshot,
  onStateChange = () => {},
  schedule = callback => queueMicrotask(callback)
}) {
  if (typeof client?.rpc !== 'function') {
    throw new TypeError('Account study snapshots require a Supabase RPC client')
  }
  if (
    typeof storage?.getItem !== 'function'
    || typeof storage?.setItem !== 'function'
    || !ownerStorageKey
  ) {
    throw new TypeError('Account study snapshots require durable owner storage')
  }
  if (
    typeof createSnapshot !== 'function'
    || typeof onStateChange !== 'function'
    || typeof schedule !== 'function'
  ) {
    throw new TypeError('Account study snapshots require state callbacks')
  }

  let currentState = Object.freeze({
    status: ACCOUNT_STUDY_SNAPSHOT_STATES.SIGNED_OUT,
    userId: null,
    error: null
  })
  let activeUserId = null
  let accountVersion = 0
  let lastSuccessfulFingerprint = null
  let inFlightFingerprint = null
  let pendingSync = null
  let drainScheduled = false
  let draining = false
  let destroyed = false

  function publish(patch) {
    if (destroyed) return currentState
    currentState = Object.freeze({ ...currentState, ...patch })
    onStateChange(currentState)
    return currentState
  }

  function bindLocalStateToOwner(userId) {
    try {
      const existingOwner = storage.getItem(ownerStorageKey)
      if (existingOwner === userId) return true
      if (existingOwner) return false
      storage.setItem(ownerStorageKey, userId)
      return storage.getItem(ownerStorageKey) === userId
    } catch {
      return false
    }
  }

  async function drain() {
    drainScheduled = false
    if (draining || destroyed) return
    draining = true
    while (pendingSync && !destroyed) {
      const request = pendingSync
      pendingSync = null
      if (
        request.userId !== activeUserId
        || request.accountVersion !== accountVersion
      ) continue
      inFlightFingerprint = request.fingerprint
      publish({
        status: ACCOUNT_STUDY_SNAPSHOT_STATES.SYNCING,
        error: null
      })
      let error = null
      try {
        const result = await client.rpc(
          'sync_my_reminder_eligibility_snapshot',
          { payload: request.snapshot }
        )
        error = result?.error || null
      } catch (caught) {
        error = caught || new Error('Snapshot sync failed')
      }
      inFlightFingerprint = null
      if (
        destroyed
        || request.userId !== activeUserId
        || request.accountVersion !== accountVersion
      ) continue
      if (error) {
        publish({
          status: ACCOUNT_STUDY_SNAPSHOT_STATES.UNAVAILABLE,
          error: 'sync-failed'
        })
      } else {
        lastSuccessfulFingerprint = request.fingerprint
        publish({
          status: ACCOUNT_STUDY_SNAPSHOT_STATES.READY,
          error: null
        })
      }
    }
    draining = false
  }

  function scheduleDrain() {
    if (drainScheduled || draining || destroyed) return
    drainScheduled = true
    schedule(() => { void drain() })
  }

  function synchronizeState(localState) {
    if (!activeUserId || destroyed || !localState) return currentState
    let snapshot
    try {
      snapshot = createSnapshot(localState)
    } catch {
      return publish({
        status: ACCOUNT_STUDY_SNAPSHOT_STATES.UNAVAILABLE,
        error: 'invalid-snapshot'
      })
    }
    const fingerprint = JSON.stringify(snapshot)
    if (
      fingerprint === lastSuccessfulFingerprint
      || fingerprint === inFlightFingerprint
      || pendingSync?.fingerprint === fingerprint
    ) return currentState
    pendingSync = {
      accountVersion,
      fingerprint,
      snapshot,
      userId: activeUserId
    }
    scheduleDrain()
    return currentState
  }

  function synchronizeAccount(accountState, localState) {
    const userId = accountState?.userId
    const signedIn = accountState?.sessionState === ACCOUNT_SESSION_STATES.SIGNED_IN
      && typeof userId === 'string'
      && UUID_PATTERN.test(userId)

    if (!signedIn) {
      accountVersion += 1
      activeUserId = null
      lastSuccessfulFingerprint = null
      inFlightFingerprint = null
      pendingSync = null
      return publish({
        status: ACCOUNT_STUDY_SNAPSHOT_STATES.SIGNED_OUT,
        userId: null,
        error: null
      })
    }

    if (activeUserId !== userId) {
      accountVersion += 1
      activeUserId = userId
      lastSuccessfulFingerprint = null
      inFlightFingerprint = null
      pendingSync = null
    }
    if (!bindLocalStateToOwner(userId)) {
      activeUserId = null
      pendingSync = null
      return publish({
        status: ACCOUNT_STUDY_SNAPSHOT_STATES.OWNER_MISMATCH,
        userId,
        error: 'owner-mismatch'
      })
    }
    publish({
      status: ACCOUNT_STUDY_SNAPSHOT_STATES.READY,
      userId,
      error: null
    })
    return synchronizeState(localState)
  }

  function retry(localState) {
    lastSuccessfulFingerprint = null
    return synchronizeState(localState)
  }

  function destroy() {
    destroyed = true
    accountVersion += 1
    activeUserId = null
    inFlightFingerprint = null
    pendingSync = null
  }

  return {
    destroy,
    getState: () => currentState,
    retry,
    synchronizeAccount,
    synchronizeState
  }
}
