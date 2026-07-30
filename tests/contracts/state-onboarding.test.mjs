import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeOnboardingState,
  ONBOARDING_VERSION
} from '../../src/state/onboarding-state.js'

const completedAt = '2026-07-28T01:02:03.000Z'

test('onboarding normalization preserves the current version and empty defaults', () => {
  assert.equal(ONBOARDING_VERSION, 2)
  const state = {}
  assert.equal(normalizeOnboardingState(state), true)
  assert.deepEqual(state.onboarding, {
    version: 2,
    introSeenAt: null,
    setupCompleted: false,
    setupCompletedAt: null,
    walkthroughCompleted: false,
    walkthroughCompletedAt: null,
    levelUpGuidanceShownAt: null,
    recommendationsAppliedAt: null
  })
  assert.equal(normalizeOnboardingState(state), false)
})

test('legacy completion promotes setup, walkthrough, and timestamp fallbacks', () => {
  const state = {
    onboarding: {
      version: -3,
      completed: true,
      completedAt,
      introSeenAt: 'invalid',
      levelUpGuidanceShownAt: 'invalid',
      recommendationsAppliedAt: '2026-07-29T01:02:03.000Z'
    }
  }

  assert.equal(normalizeOnboardingState(state), true)
  assert.deepEqual(state.onboarding, {
    version: -3,
    introSeenAt: completedAt,
    setupCompleted: true,
    setupCompletedAt: completedAt,
    walkthroughCompleted: true,
    walkthroughCompletedAt: completedAt,
    levelUpGuidanceShownAt: null,
    recommendationsAppliedAt: '2026-07-29T01:02:03.000Z'
  })
})

test('explicit completion timestamps retain precedence over legacy values', () => {
  const setupCompletedAt = '2026-07-27T01:02:03.000Z'
  const walkthroughCompletedAt = '2026-07-29T01:02:03.000Z'
  const introSeenAt = '2026-07-26T01:02:03.000Z'
  const state = {
    onboarding: {
      completed: true,
      completedAt,
      setupCompletedAt,
      walkthroughCompletedAt,
      introSeenAt
    }
  }
  normalizeOnboardingState(state)
  assert.equal(state.onboarding.setupCompletedAt, setupCompletedAt)
  assert.equal(state.onboarding.walkthroughCompletedAt, walkthroughCompletedAt)
  assert.equal(state.onboarding.introSeenAt, introSeenAt)
})

test('incomplete states discard orphan completion timestamps', () => {
  const state = {
    onboarding: {
      version: 7,
      setupCompleted: false,
      setupCompletedAt: completedAt,
      walkthroughCompleted: false,
      walkthroughCompletedAt: completedAt
    }
  }
  normalizeOnboardingState(state)
  assert.equal(state.onboarding.version, 7)
  assert.equal(state.onboarding.setupCompletedAt, null)
  assert.equal(state.onboarding.walkthroughCompletedAt, null)
  assert.equal(state.onboarding.introSeenAt, null)
})

test('onboarding normalization preserves null handling and mutation failures', () => {
  assert.equal(normalizeOnboardingState(null), false)
  assert.equal(normalizeOnboardingState(undefined), false)
  assert.throws(
    () => normalizeOnboardingState(Object.freeze({})),
    TypeError
  )
})
