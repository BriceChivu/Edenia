import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PLUS_ENTITLEMENT_STATES
} from '../../src/domain/plus-access-policy.js'
import {
  createPlusAuthController,
  PLUS_ACCOUNT_FEEDBACK,
  PLUS_ACCOUNT_SESSION_STATES
} from '../../src/integrations/plus-auth-controller.js'
import {
  createPlusEntitlementCache
} from '../../src/state/plus-entitlement-cache.js'

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
    }
  }
}

function createClient({
  session = null,
  signInError = null,
  signOutError = null,
  invokeResponses = [],
  verifyResponse = null
} = {}) {
  const calls = []
  let authListener = null
  let unsubscribed = false
  const client = {
    auth: {
      async getSession() {
        calls.push(['getSession'])
        return { data: { session }, error: null }
      },
      onAuthStateChange(listener) {
        calls.push(['onAuthStateChange'])
        authListener = listener
        return {
          data: {
            subscription: {
              unsubscribe() {
                unsubscribed = true
              }
            }
          }
        }
      },
      async signInWithOtp(options) {
        calls.push(['signInWithOtp', options])
        return { data: {}, error: signInError }
      },
      async signOut(options) {
        calls.push(['signOut', options])
        return { error: signOutError }
      },
      async verifyOtp(options) {
        calls.push(['verifyOtp', options])
        return verifyResponse || { data: {}, error: null }
      }
    },
    functions: {
      async invoke(name, options) {
        calls.push(['invoke', name, options])
        return invokeResponses.shift() || { data: null, error: null }
      }
    }
  }
  return {
    calls,
    client,
    emit(event, nextSession) {
      authListener?.(event, nextSession)
    },
    wasUnsubscribed() {
      return unsubscribed
    }
  }
}

function createControllerHarness({
  clientHarness,
  storage = createStorage(),
  readEntitlement = async () => ({
    entitlementState: PLUS_ENTITLEMENT_STATES.PLUS,
    subscriptionStatus: 'active',
    plan: 'founding_monthly',
    currentPeriodEnd: null,
    pastDueSince: null,
    updatedAt: null
  }),
  href = 'https://bricechivu.github.io/Edenia/',
  wait = async () => {}
}) {
  const states = []
  const entitlements = []
  const historyCalls = []
  const location = new URL(href)
  const cache = createPlusEntitlementCache({
    storage,
    storageKey: 'edenia_v1_plus_entitlement_cache_v1',
    now: () => 1000
  })
  const controller = createPlusAuthController({
    client: clientHarness.client,
    entitlementCache: cache,
    location,
    history: {
      state: { preserved: true },
      replaceState(...args) {
        historyCalls.push(args)
      }
    },
    onStateChange(state) {
      states.push(state)
    },
    onEntitlementChange(state) {
      entitlements.push(state)
    },
    readEntitlement,
    schedule: callback => queueMicrotask(callback),
    wait
  })
  return {
    cache,
    controller,
    entitlements,
    historyCalls,
    states,
    storage
  }
}

test('signed-in sessions restore Plus and sign out without touching study progress', async () => {
  const studyState = JSON.stringify({ videos: { kept: true } })
  const storage = createStorage({ edenia_v1: studyState })
  const session = {
    user: { id: 'user-1', email: 'learner@example.com' }
  }
  const clientHarness = createClient({ session })
  const harness = createControllerHarness({ clientHarness, storage })

  await harness.controller.initialize()
  assert.equal(harness.controller.getState().sessionState, 'signed-in')
  assert.equal(
    harness.controller.getState().entitlementState,
    PLUS_ENTITLEMENT_STATES.PLUS
  )
  assert.equal(harness.controller.getState().email, 'learner@example.com')
  assert.equal(storage.getItem('edenia_v1'), studyState)
  assert.deepEqual(harness.entitlements, [
    PLUS_ENTITLEMENT_STATES.LOADING,
    PLUS_ENTITLEMENT_STATES.PLUS
  ])

  assert.equal(await harness.controller.signOut(), true)
  assert.equal(
    harness.controller.getState().sessionState,
    PLUS_ACCOUNT_SESSION_STATES.SIGNED_OUT
  )
  assert.equal(harness.controller.getState().subscriptionStatus, null)
  assert.equal(harness.controller.getState().plan, null)
  assert.equal(storage.getItem('edenia_v1'), studyState)
  assert.deepEqual(
    clientHarness.calls.find(call => call[0] === 'signOut'),
    ['signOut', { scope: 'local' }]
  )

  harness.controller.destroy()
  assert.equal(clientHarness.wasUnsubscribed(), true)
})

test('passwordless restoration validates email and preserves safe redirect parameters', async () => {
  const clientHarness = createClient()
  const harness = createControllerHarness({
    clientHarness,
    href: 'https://bricechivu.github.io/Edenia/?internal_test=1#private'
  })
  await harness.controller.initialize()
  await harness.controller.refresh()
  assert.equal(harness.controller.getState().busyAction, null)

  assert.equal(await harness.controller.restore('not-an-email'), false)
  assert.equal(
    harness.controller.getState().feedback,
    PLUS_ACCOUNT_FEEDBACK.INVALID_EMAIL
  )
  assert.equal(await harness.controller.restore(' Learner@Example.COM '), true)
  assert.equal(
    harness.controller.getState().feedback,
    PLUS_ACCOUNT_FEEDBACK.SIGN_IN_LINK_SENT
  )
  assert.equal(harness.controller.getState().feedbackEmail, 'learner@example.com')
  assert.deepEqual(
    clientHarness.calls.find(call => call[0] === 'signInWithOtp'),
    ['signInWithOtp', {
      email: 'learner@example.com',
      options: {
        emailRedirectTo:
          'https://bricechivu.github.io/Edenia/?internal_test=1',
        shouldCreateUser: false
      }
    }]
  )
})

test('upgrade sign-in may create an account and preserves the selected plan', async () => {
  const clientHarness = createClient()
  const harness = createControllerHarness({
    clientHarness,
    href: 'https://bricechivu.github.io/Edenia/plus/?internal_test=1'
  })
  await harness.controller.initialize()

  assert.equal(
    await harness.controller.startUpgradeSignIn(' learner@example.com ', 'monthly'),
    true
  )
  assert.equal(
    harness.controller.getState().feedback,
    PLUS_ACCOUNT_FEEDBACK.UPGRADE_LINK_SENT
  )
  assert.deepEqual(
    clientHarness.calls.find(call => call[0] === 'signInWithOtp'),
    ['signInWithOtp', {
      email: 'learner@example.com',
      options: {
        emailRedirectTo:
          'https://bricechivu.github.io/Edenia/plus/?internal_test=1&plus=1&plan=monthly',
        shouldCreateUser: true
      }
    }]
  )
})

test('temporary entitlement failures use only an unexpired matching cache', async () => {
  const clientHarness = createClient({
    session: { user: { id: 'user-1', email: 'learner@example.com' } }
  })
  const harness = createControllerHarness({
    clientHarness,
    readEntitlement: async () => {
      throw new Error('temporarily unavailable')
    }
  })
  harness.cache.write('user-1', {
    entitlementState: PLUS_ENTITLEMENT_STATES.PLUS,
    subscriptionStatus: 'active',
    plan: 'founding_monthly'
  })

  await harness.controller.initialize()
  assert.equal(
    harness.controller.getState().entitlementState,
    PLUS_ENTITLEMENT_STATES.PLUS
  )
  assert.equal(harness.controller.getState().usingCachedEntitlement, true)
  assert.equal(
    harness.entitlements.at(-1),
    PLUS_ENTITLEMENT_STATES.PLUS
  )
})

test('checkout return waits once, verifies the exact user, and removes session data', async () => {
  const verifiedSession = {
    user: { id: 'user-1', email: 'learner@example.com' }
  }
  const clientHarness = createClient({
    invokeResponses: [
      { data: { pending: true }, error: null },
      {
        data: { token_hash: 'hashed-token', user_id: 'user-1' },
        error: null
      }
    ],
    verifyResponse: {
      data: { session: verifiedSession, user: verifiedSession.user },
      error: null
    }
  })
  const waits = []
  const harness = createControllerHarness({
    clientHarness,
    href: 'https://bricechivu.github.io/Edenia/?upgrade_success=1&session_id=cs_test_123&kept=1#done',
    wait: async milliseconds => waits.push(milliseconds)
  })

  await harness.controller.initialize()
  assert.deepEqual(waits, [2000])
  assert.equal(
    clientHarness.calls.filter(call => call[0] === 'invoke').length,
    2
  )
  assert.deepEqual(
    clientHarness.calls.find(call => call[0] === 'verifyOtp'),
    ['verifyOtp', { token_hash: 'hashed-token', type: 'email' }]
  )
  assert.deepEqual(harness.historyCalls, [
    [{ preserved: true }, '', '/Edenia/?kept=1#done']
  ])
  assert.equal(
    harness.controller.getState().feedback,
    PLUS_ACCOUNT_FEEDBACK.CHECKOUT_RESTORED
  )
  assert.equal(
    harness.controller.getState().entitlementState,
    PLUS_ENTITLEMENT_STATES.PLUS
  )
})

test('auth session changes refresh entitlement outside the auth callback', async () => {
  const clientHarness = createClient()
  const readUserIds = []
  const harness = createControllerHarness({
    clientHarness,
    readEntitlement: async (_client, userId) => {
      readUserIds.push(userId)
      return {
        entitlementState: PLUS_ENTITLEMENT_STATES.FREE,
        subscriptionStatus: null,
        plan: null,
        currentPeriodEnd: null,
        pastDueSince: null,
        updatedAt: null
      }
    }
  })
  await harness.controller.initialize()
  clientHarness.emit('SIGNED_IN', {
    user: { id: 'user-2', email: 'second@example.com' }
  })
  await new Promise(resolve => setImmediate(resolve))

  assert.deepEqual(readUserIds, ['user-2'])
  assert.equal(harness.controller.getState().userId, 'user-2')
  assert.equal(
    harness.controller.getState().entitlementState,
    PLUS_ENTITLEMENT_STATES.FREE
  )
})

test('switching users clears the previous account metadata before refreshing', async () => {
  const clientHarness = createClient({
    session: { user: { id: 'user-1', email: 'first@example.com' } }
  })
  const harness = createControllerHarness({
    clientHarness,
    readEntitlement: async (_client, userId) => userId === 'user-1'
      ? {
          entitlementState: PLUS_ENTITLEMENT_STATES.PLUS,
          subscriptionStatus: 'active',
          plan: 'founding_monthly',
          currentPeriodEnd: '2026-08-31T00:00:00.000Z',
          pastDueSince: null,
          updatedAt: '2026-08-01T00:00:00.000Z'
        }
      : {
          entitlementState: PLUS_ENTITLEMENT_STATES.FREE,
          subscriptionStatus: null,
          plan: null,
          currentPeriodEnd: null,
          pastDueSince: null,
          updatedAt: null
        }
  })

  await harness.controller.initialize()
  clientHarness.emit('SIGNED_IN', {
    user: { id: 'user-2', email: 'second@example.com' }
  })
  await new Promise(resolve => setImmediate(resolve))

  const loadingState = harness.states.find(state => (
    state.userId === 'user-2'
    && state.entitlementState === PLUS_ENTITLEMENT_STATES.LOADING
  ))
  assert.ok(loadingState)
  assert.equal(loadingState.subscriptionStatus, null)
  assert.equal(loadingState.plan, null)
  assert.equal(loadingState.currentPeriodEnd, null)
})
