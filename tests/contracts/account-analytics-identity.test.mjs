import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createAccountAnalyticsIdentity
} from '../../src/integrations/account-analytics-identity.js'

const USER_A = '3940e250-7b9d-4d2a-8f5c-4c111c812345'
const USER_B = 'B0A982B6-5A6F-4CBF-A881-DF1234567890'

function createHarness({
  currentUserId = null,
  identifyResult = true,
  resetClearsCurrentUserId = true,
  resetResult = true,
  sharedState = { currentUserId }
} = {}) {
  const calls = []
  const identity = createAccountAnalyticsIdentity({
    getPersistedAnalyticsUserId() {
      calls.push(['get-current-user-id'])
      return sharedState.currentUserId
    },
    identify(userId, properties) {
      calls.push(['identify', userId, properties])
      if (identifyResult === true) sharedState.currentUserId = userId
      return identifyResult
    },
    reset() {
      calls.push(['reset'])
      if (resetResult === true && resetClearsCurrentUserId) {
        sharedState.currentUserId = null
      }
      return resetResult
    }
  })
  return { calls, identity, sharedState }
}

test('authenticated analytics identifies a normalized UUID with only approved email', () => {
  const { calls, identity } = createHarness()

  assert.equal(identity.synchronize({
    sessionState: 'signed-in',
    userId: `  ${USER_B}  `,
    email: ' LEARNER@Example.com ',
    authMethod: 'GOOGLE',
    name: 'Learner Name',
    providerSubject: 'google-subject'
  }), true)
  assert.deepEqual(calls, [[
    'get-current-user-id'
  ], [
    'identify',
    USER_B.toLowerCase(),
    { email: 'learner@example.com' }
  ]])
  assert.equal(identity.getIdentifiedUserId(), USER_B.toLowerCase())

  assert.equal(identity.synchronize({
    sessionState: 'signed-in',
    userId: USER_B,
    email: 'learner@example.com'
  }), true)

  assert.equal(identity.synchronize({
    sessionState: 'signed-in',
    userId: USER_B,
    email: 'changed@example.com'
  }), true)
  assert.deepEqual(calls[2], [
    'identify',
    USER_B.toLowerCase(),
    { email: 'changed@example.com' }
  ])
  assert.equal(calls.filter(call => call[0] === 'identify').length, 2)
  assert.equal(calls.some(call => call[0] === 'reset'), false)
})

test('emails and malformed identifiers never reach PostHog identify', () => {
  const { calls, identity } = createHarness()
  for (const userId of [
    '',
    null,
    'learner@example.com',
    '3940e250-7b9d-0d2a-8f5c-4c111c812345',
    '3940e250-7b9d-4d2a-7f5c-4c111c812345'
  ]) {
    assert.equal(identity.synchronize({ sessionState: 'signed-in', userId }), false)
  }
  assert.deepEqual(calls, [])
})

test('logout resets once and an account switch resets before identifying', () => {
  const { calls, identity } = createHarness()
  identity.synchronize({ sessionState: 'signed-in', userId: USER_A })
  identity.synchronize({ sessionState: 'signed-in', userId: USER_B })
  identity.synchronize({ sessionState: 'signed-out' })
  identity.synchronize({ sessionState: 'signed-out' })

  assert.deepEqual(calls, [
    ['get-current-user-id'],
    ['identify', USER_A, {}],
    ['reset'],
    ['identify', USER_B.toLowerCase(), {}],
    ['reset']
  ])
  assert.equal(identity.getIdentifiedUserId(), null)
})

test('a reloaded adapter resets a persisted learner before identifying another', () => {
  const sharedState = { currentUserId: null }
  const first = createHarness({ sharedState })
  first.identity.synchronize({ sessionState: 'signed-in', userId: USER_A })

  const reloaded = createHarness({ sharedState })
  reloaded.identity.synchronize({ sessionState: 'signed-in', userId: USER_B })

  assert.deepEqual(first.calls, [
    ['get-current-user-id'],
    ['identify', USER_A, {}]
  ])
  assert.deepEqual(reloaded.calls, [
    ['get-current-user-id'],
    ['reset'],
    ['identify', USER_B.toLowerCase(), {}]
  ])
})

test('identity waits for the persisted PostHog identity to become readable', () => {
  let ready = false
  const calls = []
  const identity = createAccountAnalyticsIdentity({
    getPersistedAnalyticsUserId() {
      calls.push(['get-persisted-analytics-user-id'])
      return ready ? null : undefined
    },
    identify(userId) {
      calls.push(['identify', userId])
      return true
    },
    reset() {
      calls.push(['reset'])
      return true
    }
  })

  assert.equal(identity.synchronize({
    sessionState: 'signed-in', userId: USER_A
  }), false)
  ready = true
  assert.equal(identity.synchronize({
    sessionState: 'signed-in', userId: USER_A
  }), true)
  assert.deepEqual(calls, [
    ['get-persisted-analytics-user-id'],
    ['get-persisted-analytics-user-id'],
    ['identify', USER_A]
  ])
})

test('a signed-out reload clears one persisted authenticated identity', () => {
  const { calls, identity } = createHarness({ currentUserId: USER_A })

  assert.equal(identity.synchronize({ sessionState: 'signed-out' }), true)
  assert.equal(identity.synchronize({ sessionState: 'signed-out' }), true)

  assert.deepEqual(calls, [
    ['get-current-user-id'],
    ['reset']
  ])
})

test('one successful reset is enough when persisted-marker cleanup fails', () => {
  const { calls, identity } = createHarness({
    currentUserId: USER_A,
    resetClearsCurrentUserId: false
  })

  assert.equal(identity.synchronize({ sessionState: 'signed-out' }), true)
  assert.equal(identity.synchronize({ sessionState: 'signed-out' }), true)
  assert.equal(identity.synchronize({
    sessionState: 'signed-in',
    userId: USER_B
  }), true)

  assert.deepEqual(calls, [
    ['get-current-user-id'],
    ['reset'],
    ['identify', USER_B.toLowerCase(), {}]
  ])
})

test('analytics failures cannot break account state rendering or merge users', () => {
  const identifyFailure = createHarness({ identifyResult: false })
  assert.equal(identifyFailure.identity.synchronize({
    sessionState: 'signed-in', userId: USER_A
  }), false)
  assert.equal(identifyFailure.identity.getIdentifiedUserId(), null)

  const resetFailure = createHarness({ resetResult: false })
  resetFailure.identity.synchronize({ sessionState: 'signed-in', userId: USER_A })
  assert.equal(resetFailure.identity.synchronize({
    sessionState: 'signed-in', userId: USER_B
  }), false)
  assert.equal(resetFailure.identity.getIdentifiedUserId(), USER_A)
  assert.deepEqual(resetFailure.calls, [
    ['get-current-user-id'],
    ['identify', USER_A, {}],
    ['reset']
  ])

  const throwingIdentity = createAccountAnalyticsIdentity({
    getPersistedAnalyticsUserId() { throw new Error('analytics unavailable') },
    identify() { throw new Error('analytics unavailable') },
    reset() { throw new Error('analytics unavailable') }
  })
  assert.doesNotThrow(() => throwingIdentity.synchronize({
    sessionState: 'signed-in', userId: USER_A
  }))
})

test('account analytics identity validates its integration boundary', () => {
  assert.throws(
    () => createAccountAnalyticsIdentity({ identify() {}, reset() {} }),
    /persisted analytics user, identify, and reset callbacks/
  )
})
