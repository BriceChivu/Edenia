import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACCOUNT_FEATURE_ROLLOUTS,
  deriveAccountFeaturesEnabled,
  normalizeAccountFeaturesRollout
} from '../../src/core/account-feature-rollout.js'

test('account rollout normalization fails closed', () => {
  assert.equal(normalizeAccountFeaturesRollout(), ACCOUNT_FEATURE_ROLLOUTS.OFF)
  assert.equal(normalizeAccountFeaturesRollout(''), ACCOUNT_FEATURE_ROLLOUTS.OFF)
  assert.equal(normalizeAccountFeaturesRollout('unknown'), ACCOUNT_FEATURE_ROLLOUTS.OFF)
  assert.equal(normalizeAccountFeaturesRollout(true), ACCOUNT_FEATURE_ROLLOUTS.OFF)
  assert.equal(
    normalizeAccountFeaturesRollout(' INTERNAL '),
    ACCOUNT_FEATURE_ROLLOUTS.INTERNAL
  )
  assert.equal(
    normalizeAccountFeaturesRollout('PUBLIC'),
    ACCOUNT_FEATURE_ROLLOUTS.PUBLIC
  )
})

test('account features are disabled when the rollout is off or unavailable', () => {
  assert.equal(deriveAccountFeaturesEnabled(null, 'public'), false)
  assert.equal(deriveAccountFeaturesEnabled({}, 'off'), false)
  assert.equal(
    deriveAccountFeaturesEnabled({ isInternalTest: true }, 'off'),
    false
  )
  assert.equal(
    deriveAccountFeaturesEnabled({ isLocalDevelopment: true }, 'off'),
    false
  )
  assert.equal(
    deriveAccountFeaturesEnabled({ isInternalTest: true }, 'invalid'),
    false
  )
})

test('internal rollout reaches internal-test and exact local-development audiences', () => {
  assert.equal(
    deriveAccountFeaturesEnabled({ isInternalTest: false }, 'internal'),
    false
  )
  assert.equal(
    deriveAccountFeaturesEnabled({ isInternalTest: true }, 'internal'),
    true
  )
  assert.equal(
    deriveAccountFeaturesEnabled({ isLocalDevelopment: true }, 'internal'),
    true
  )
  assert.equal(
    deriveAccountFeaturesEnabled({ isLocalhost: true }, 'internal'),
    false
  )
  assert.equal(
    deriveAccountFeaturesEnabled({
      isLocalDevelopment: true,
      isSandbox: true
    }, 'internal'),
    false
  )
})

test('public rollout reaches ordinary and internal audiences but never sandbox', () => {
  assert.equal(
    deriveAccountFeaturesEnabled({ isInternalTest: false }, 'public'),
    true
  )
  assert.equal(
    deriveAccountFeaturesEnabled({ isInternalTest: true }, 'public'),
    true
  )
  assert.equal(
    deriveAccountFeaturesEnabled({
      isInternalTest: true,
      isSandbox: true
    }, 'public'),
    false
  )
  assert.equal(
    deriveAccountFeaturesEnabled({
      isInternalTest: true,
      isSandbox: true
    }, 'internal'),
    false
  )
})
