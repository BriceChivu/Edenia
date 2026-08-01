import {
  PLUS_ENTITLEMENT_STATES
} from '../domain/plus-access-policy.js'
import { getPlusEntitlementState } from '../domain/plus-entitlement.js'

export const PLUS_ENTITLEMENT_CACHE_TTL_MS = 15 * 60 * 1000

const CACHEABLE_ENTITLEMENT_STATES = new Set([
  PLUS_ENTITLEMENT_STATES.FREE,
  PLUS_ENTITLEMENT_STATES.PLUS,
  PLUS_ENTITLEMENT_STATES.PAYMENT_PROBLEM
])

function normalizeCachedSnapshot(value, userId, now) {
  if (!value || value.version !== 1 || value.userId !== userId) return null
  if (!CACHEABLE_ENTITLEMENT_STATES.has(value.entitlementState)) return null
  if (!Number.isFinite(value.expiresAt) || value.expiresAt <= now) return null

  const subscriptionStatus = typeof value.subscriptionStatus === 'string'
    ? value.subscriptionStatus
    : null
  const pastDueSince = typeof value.pastDueSince === 'string'
    ? value.pastDueSince
    : null
  const entitlementState = subscriptionStatus === 'past_due'
    ? getPlusEntitlementState({
        status: subscriptionStatus,
        past_due_since: pastDueSince
      }, now)
    : value.entitlementState

  return Object.freeze({
    entitlementState,
    subscriptionStatus,
    plan: typeof value.plan === 'string' ? value.plan : null,
    currentPeriodEnd: typeof value.currentPeriodEnd === 'string'
      ? value.currentPeriodEnd
      : null,
    cancelAtPeriodEnd: value.cancelAtPeriodEnd === true,
    pastDueSince,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    checkedAt: value.checkedAt,
    expiresAt: value.expiresAt
  })
}

export function createPlusEntitlementCache({
  storage,
  storageKey,
  ttlMs = PLUS_ENTITLEMENT_CACHE_TTL_MS,
  now = () => Date.now()
}) {
  if (!storage || typeof storage.getItem !== 'function') {
    throw new TypeError('Plus entitlement cache requires browser storage')
  }
  if (!storageKey) {
    throw new TypeError('Plus entitlement cache requires a storage key')
  }

  function read(userId) {
    if (!userId) return null
    try {
      const value = JSON.parse(storage.getItem(storageKey) || 'null')
      const snapshot = normalizeCachedSnapshot(value, userId, now())
      if (!snapshot && value?.expiresAt <= now()) storage.removeItem(storageKey)
      return snapshot
    } catch {
      try { storage.removeItem(storageKey) } catch {}
      return null
    }
  }

  function write(userId, snapshot) {
    if (!userId || !CACHEABLE_ENTITLEMENT_STATES.has(snapshot?.entitlementState)) {
      return false
    }
    const checkedAt = now()
    const value = {
      version: 1,
      userId,
      entitlementState: snapshot.entitlementState,
      subscriptionStatus: snapshot.subscriptionStatus || null,
      plan: snapshot.plan || null,
      currentPeriodEnd: snapshot.currentPeriodEnd || null,
      cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd === true,
      pastDueSince: snapshot.pastDueSince || null,
      updatedAt: snapshot.updatedAt || null,
      checkedAt,
      expiresAt: checkedAt + ttlMs
    }
    try {
      storage.setItem(storageKey, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  }

  return Object.freeze({ read, write })
}
