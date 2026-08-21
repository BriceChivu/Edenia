import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLearnerProfileOwnerVerificationStore
} from '../../src/state/learner-profile-owner-verification.js'

const OWNER_ID = '123e4567-e89b-42d3-a456-426614174000'

function createStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  }
}

function createEventTarget() {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    dispatch(type, event) {
      listeners.get(type)?.(event)
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type)
    }
  }
}

test('owner verification stores only the verified UUID and verification time', () => {
  const storage = createStorage()
  const storageKey = 'edenia_test_owner_verification_v1'
  const store = createLearnerProfileOwnerVerificationStore({
    eventTarget: null,
    storage,
    storageKey
  })

  assert.equal(store.record({
    accessToken: 'must-not-be-stored',
    ownerId: OWNER_ID,
    verifiedAt: 1_786_982_400_000
  }), false)
  assert.equal(storage.getItem(storageKey), null)
  assert.equal(store.record({
    ownerId: OWNER_ID,
    verifiedAt: 1_786_982_400_000
  }), true)
  assert.deepEqual(store.read(), {
    ownerId: OWNER_ID,
    verifiedAt: 1_786_982_400_000
  })
  assert.deepEqual(
    Object.keys(JSON.parse(storage.getItem(storageKey))).sort(),
    ['ownerId', 'verifiedAt']
  )
})

test('clearing owner verification notifies other browser tabs', () => {
  const storage = createStorage()
  const eventTarget = createEventTarget()
  const storageKey = 'edenia_test_owner_verification_v1'
  const store = createLearnerProfileOwnerVerificationStore({
    eventTarget,
    storage,
    storageKey
  })
  store.record({ ownerId: OWNER_ID, verifiedAt: 1_786_982_400_000 })
  let notifications = 0
  const unsubscribe = store.subscribe(() => { notifications += 1 })

  assert.equal(store.clear(), true)
  assert.equal(store.read(), null)
  eventTarget.dispatch('storage', { key: storageKey, storageArea: storage })
  assert.equal(notifications, 1)

  unsubscribe()
  eventTarget.dispatch('storage', { key: storageKey, storageArea: storage })
  assert.equal(notifications, 1)
})
