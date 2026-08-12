import assert from 'node:assert/strict'
import test from 'node:test'
import { ACCOUNT_SESSION_STATES } from '../../src/integrations/account-auth-controller.js'
import {
  ACCOUNT_STUDY_SNAPSHOT_STATES,
  createAccountStudySnapshotController
} from '../../src/integrations/account-study-snapshot-controller.js'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const OWNER_KEY = 'edenia_v1_internal_test_account_study_sync_owner_v1'

function memoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial))
  return {
    getItem(key) { return entries.get(key) ?? null },
    setItem(key, value) { entries.set(key, String(value)) }
  }
}

function signedIn(userId) {
  return { sessionState: ACCOUNT_SESSION_STATES.SIGNED_IN, userId }
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

function harness({ storage = memoryStorage(), rpc } = {}) {
  const calls = []
  const states = []
  const client = {
    async rpc(name, args) {
      calls.push([name, args])
      return rpc ? rpc(name, args) : { data: '2026-08-13T00:00:00Z', error: null }
    }
  }
  const controller = createAccountStudySnapshotController({
    client,
    storage,
    ownerStorageKey: OWNER_KEY,
    createSnapshot: localState => ({ pointsToday: localState.points }),
    onStateChange(state) { states.push(state) }
  })
  return { calls, controller, states, storage }
}

test('first account atomically claims the local dataset before uploading it', async () => {
  const { calls, controller, storage } = harness()

  controller.synchronizeAccount(signedIn(USER_A), { points: 4 })
  assert.equal(storage.getItem(OWNER_KEY), USER_A)
  await settle()

  assert.deepEqual(calls, [[
    'sync_my_reminder_eligibility_snapshot',
    { payload: { pointsToday: 4 } }
  ]])
  assert.equal(controller.getState().status, ACCOUNT_STUDY_SNAPSHOT_STATES.READY)
  assert.equal(controller.getState().userId, USER_A)
})

test('repeated saves are deduplicated but changed eligibility retries', async () => {
  const { calls, controller } = harness()
  controller.synchronizeAccount(signedIn(USER_A), { points: 4 })
  await settle()

  controller.synchronizeState({ points: 4 })
  await settle()
  controller.synchronizeState({ points: 5 })
  await settle()

  assert.equal(calls.length, 2)
  assert.equal(calls[1][1].payload.pointsToday, 5)
})

test('a different signed-in account can never inherit the browser dataset', async () => {
  const storage = memoryStorage({ [OWNER_KEY]: USER_A })
  const { calls, controller } = harness({ storage })

  controller.synchronizeAccount(signedIn(USER_B), { points: 9 })
  await settle()

  assert.equal(calls.length, 0)
  assert.equal(controller.getState().status, ACCOUNT_STUDY_SNAPSHOT_STATES.OWNER_MISMATCH)
  assert.equal(storage.getItem(OWNER_KEY), USER_A)
})

test('logout keeps the durable binding and ignores an obsolete request', async () => {
  let finish
  const { calls, controller, storage } = harness({
    rpc: () => new Promise(resolve => { finish = resolve })
  })
  controller.synchronizeAccount(signedIn(USER_A), { points: 3 })
  await settle()
  assert.equal(calls.length, 1)

  controller.synchronizeAccount({ sessionState: ACCOUNT_SESSION_STATES.SIGNED_OUT })
  finish({ data: null, error: null })
  await settle()

  assert.equal(storage.getItem(OWNER_KEY), USER_A)
  assert.equal(controller.getState().status, ACCOUNT_STUDY_SNAPSHOT_STATES.SIGNED_OUT)
  assert.equal(controller.getState().userId, null)
})

test('storage and network failures fail closed without affecting auth state', async () => {
  const unavailableStorage = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') }
  }
  const storageFailure = harness({ storage: unavailableStorage })
  storageFailure.controller.synchronizeAccount(signedIn(USER_A), { points: 1 })
  await settle()
  assert.equal(storageFailure.calls.length, 0)
  assert.equal(
    storageFailure.controller.getState().status,
    ACCOUNT_STUDY_SNAPSHOT_STATES.OWNER_MISMATCH
  )

  const networkFailure = harness({
    rpc: async () => ({ data: null, error: new Error('offline') })
  })
  networkFailure.controller.synchronizeAccount(signedIn(USER_A), { points: 1 })
  await settle()
  assert.equal(
    networkFailure.controller.getState().status,
    ACCOUNT_STUDY_SNAPSHOT_STATES.UNAVAILABLE
  )
  assert.equal(networkFailure.controller.getState().userId, USER_A)
})
