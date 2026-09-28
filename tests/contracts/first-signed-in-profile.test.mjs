import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createInitialSignedInProfileEnvelope
} from '../../src/state/first-signed-in-profile.js'

function onboardingState() {
  return {
    activityLog: [{ type: 'study' }],
    anki: { '2026-08-21': 4 },
    cityProgress: { maxLevelIndex: 3, pendingLevelIndex: 4 },
    learnerProfile: {
      createdAt: null,
      languages: ['mandarin'],
      level: 'starting',
      selectedChannelCatalogIds: ['mandarin-daily'],
      updatedAt: null
    },
    onboarding: {
      accountStepReachedAt: '2026-08-21T00:00:00.000Z'
    },
    videos: { watched: { status: 'watched' } }
  }
}

test('the initial signed-in profile contains choices without pre-auth study facts', async () => {
  const draftState = onboardingState()
  let capturedState = null
  const envelope = await createInitialSignedInProfileEnvelope(draftState, {
    createEnvelope: async (state, options) => {
      capturedState = state
      assert.equal(
        options.now().toISOString(),
        '2026-08-21T01:00:00.000Z'
      )
      return { envelope: { profile: state } }
    },
    normalizeLearnerProfile: () => false,
    now: () => new Date('2026-08-21T01:00:00.000Z')
  })

  assert.notEqual(capturedState, draftState)
  assert.deepEqual(draftState.activityLog, [{ type: 'study' }])
  assert.deepEqual(capturedState.activityLog, [])
  assert.deepEqual(capturedState.anki, {})
  assert.deepEqual(capturedState.videos, {})
  assert.deepEqual(capturedState.cityProgress, {
    maxLevelIndex: 0,
    pendingLevelIndex: null
  })
  assert.equal(capturedState.onboarding.setupCompleted, true)
  assert.equal(capturedState.onboarding.accountStepReachedAt, null)
  assert.equal(
    envelope.profile.learnerProfile.languages[0],
    'mandarin'
  )
})

test('an incomplete onboarding draft cannot become a signed-in profile', async () => {
  const state = onboardingState()
  state.learnerProfile.level = null
  let createCalls = 0

  assert.equal(await createInitialSignedInProfileEnvelope(state, {
    createEnvelope: async () => {
      createCalls += 1
      return { envelope: {} }
    },
    normalizeLearnerProfile: () => false
  }), null)
  assert.equal(createCalls, 0)
})

test('first signed-in economy is a fresh starter, never copied rewards or purchases from a draft', async () => {
  const state = onboardingState()
  state.townEconomy = { version: 1, mode: 'legacy', rewards: { old: { baseline: 0, seconds: 600 } }, purchases: { 'garden-flower-1': 15 } }
  const result = await createInitialSignedInProfileEnvelope(state, {
    createEnvelope: async profile => ({ envelope: { profile } }),
    normalizeLearnerProfile: () => false
  })
  assert.deepEqual(result.profile.townEconomy, { version: 1, mode: 'starter', rewards: {}, purchases: {} })
  assert.equal(state.townEconomy.mode, 'legacy')
})
