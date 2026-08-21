import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLearnerProfileCloudPersistenceAdapter
} from '../../src/integrations/learner-profile-cloud-persistence.js'
import {
  LEARNER_PROFILE_RESOLUTION_STATUSES
} from '../../src/domain/learner-profile-resolution.js'

const OWNER_ID = '123e4567-e89b-42d3-a456-426614174000'
const PROFILE_ID = '223e4567-e89b-42d3-a456-426614174001'

function createAdapter({ clearOnboardingDraft }) {
  return createLearnerProfileCloudPersistenceAdapter({
    clearOnboardingDraft,
    createOnboardingEnvelope: async () => null,
    getClient: () => ({
      rpc: async () => ({
        data: [{
          created: false,
          envelope: { profile: { learnerProfile: {} } },
          generation: 1,
          profile_id: PROFILE_ID,
          revision: 1,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
        }],
        error: null
      })
    }),
    importEnvelope: envelope => envelope.profile,
    readOnboardingState: () => null,
    verifyEnvelope: async envelope => envelope
  })
}

test('a retried signed-in profile activation finishes pending draft deletion', async () => {
  let clearCalls = 0
  const adapter = createAdapter({
    clearOnboardingDraft: () => {
      clearCalls += 1
      return true
    }
  })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      onboardingFinalizationPending: true,
      ownerId: OWNER_ID,
      profile: { learnerProfile: {} },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(result.status, 'activate')
  assert.equal(result.created, false)
  assert.equal(result.finalize(), true)
  assert.equal(clearCalls, 1)
})

test('an existing signed-in profile does not discard an unrelated draft', async () => {
  let clearCalls = 0
  const adapter = createAdapter({
    clearOnboardingDraft: () => {
      clearCalls += 1
      return true
    }
  })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: { learnerProfile: {} },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.equal(result.finalize(), true)
  assert.equal(clearCalls, 0)
})
