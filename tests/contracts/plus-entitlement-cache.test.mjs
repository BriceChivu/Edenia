import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PLUS_ENTITLEMENT_STATES
} from '../../src/domain/plus-access-policy.js'
import {
  createPlusEntitlementCache,
  PLUS_ENTITLEMENT_CACHE_TTL_MS
} from '../../src/state/plus-entitlement-cache.js'
import {
  PLUS_PAYMENT_GRACE_PERIOD_MS
} from '../../src/domain/plus-entitlement.js'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
    removeItem(key) {
      values.delete(key)
    },
    value(key) {
      return values.get(key)
    }
  }
}

test('entitlement cache grants only a short, user-specific outage grace', () => {
  let now = 1000
  const storage = createStorage()
  const cache = createPlusEntitlementCache({
    storage,
    storageKey: 'entitlement',
    now: () => now
  })
  const snapshot = {
    entitlementState: PLUS_ENTITLEMENT_STATES.PLUS,
    subscriptionStatus: 'active',
    plan: 'founding_monthly',
    currentPeriodEnd: '2026-09-01T00:00:00.000Z'
  }

  assert.equal(cache.write('user-1', snapshot), true)
  assert.equal(cache.read('user-2'), null)
  assert.deepEqual(cache.read('user-1'), {
    ...snapshot,
    pastDueSince: null,
    updatedAt: null,
    checkedAt: 1000,
    expiresAt: 1000 + PLUS_ENTITLEMENT_CACHE_TTL_MS
  })

  now += PLUS_ENTITLEMENT_CACHE_TTL_MS
  assert.equal(cache.read('user-1'), null)
  assert.equal(storage.value('entitlement'), undefined)
})

test('entitlement cache fails closed for transient and malformed states', () => {
  const storage = createStorage()
  const cache = createPlusEntitlementCache({
    storage,
    storageKey: 'entitlement',
    now: () => 5000
  })

  for (const entitlementState of [
    PLUS_ENTITLEMENT_STATES.LOADING,
    PLUS_ENTITLEMENT_STATES.UNAVAILABLE,
    'unknown'
  ]) {
    assert.equal(cache.write('user-1', { entitlementState }), false)
  }

  storage.setItem('entitlement', '{not-json')
  assert.equal(cache.read('user-1'), null)
  assert.equal(storage.value('entitlement'), undefined)
})

test('cached payment-problem access cannot extend past seven-day grace', () => {
  const now = Date.parse('2026-08-01T00:00:00.000Z')
  const storage = createStorage()
  const cache = createPlusEntitlementCache({
    storage,
    storageKey: 'entitlement',
    now: () => now
  })
  cache.write('user-1', {
    entitlementState: PLUS_ENTITLEMENT_STATES.PAYMENT_PROBLEM,
    subscriptionStatus: 'past_due',
    pastDueSince: new Date(
      now - PLUS_PAYMENT_GRACE_PERIOD_MS
    ).toISOString()
  })

  assert.equal(
    cache.read('user-1').entitlementState,
    PLUS_ENTITLEMENT_STATES.FREE
  )
})
