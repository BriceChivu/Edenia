import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createAccountAnalyticsIdentity
} from '../../src/integrations/account-analytics-identity.js'

const USER_A = '3940e250-7b9d-4d2a-8f5c-4c111c812345'
const USER_B = 'B0A982B6-5A6F-4CBF-A881-DF1234567890'

function createHarness({ identifyResult = true, resetResult = true } = {}) {
  const calls = []
  const identity = createAccountAnalyticsIdentity({
    identify(userId) {
      calls.push(['identify', userId])
      return identifyResult
    },
    reset() {
      calls.push(['reset'])
      return resetResult
    }
  })
  return { calls, identity }
}

test('authenticated analytics identifies only a normalized Supabase UUID', () => {
  const { calls, identity } = createHarness()

  assert.equal(identity.synchronize({
    sessionState: 'signed-in',
    userId: `  ${USER_B}  `,
    email: 'must-not-be-used@example.com'
  }), true)
  assert.deepEqual(calls, [['identify', USER_B.toLowerCase()]])
  assert.equal(identity.getIdentifiedUserId(), USER_B.toLowerCase())

  assert.equal(identity.synchronize({
    sessionState: 'signed-in',
    userId: USER_B,
    email: 'changed@example.com'
  }), true)
  assert.equal(calls.length, 1)
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
    ['identify', USER_A],
    ['reset'],
    ['identify', USER_B.toLowerCase()],
    ['reset']
  ])
  assert.equal(identity.getIdentifiedUserId(), null)
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
    ['identify', USER_A],
    ['reset']
  ])

  const throwingIdentity = createAccountAnalyticsIdentity({
    identify() { throw new Error('analytics unavailable') },
    reset() { throw new Error('analytics unavailable') }
  })
  assert.doesNotThrow(() => throwingIdentity.synchronize({
    sessionState: 'signed-in', userId: USER_A
  }))
})

test('account analytics identity validates its integration boundary', () => {
  assert.throws(
    () => createAccountAnalyticsIdentity({ identify() {} }),
    /identify and reset callbacks/
  )
})
