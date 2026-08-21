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

function createAdapter({ clearOnboardingDraft, rpc, verifyEnvelope } = {}) {
  return createLearnerProfileCloudPersistenceAdapter({
    clearOnboardingDraft: clearOnboardingDraft || (() => true),
    createOnboardingEnvelope: async () => null,
    getClient: () => ({
      rpc: rpc || (async () => ({
        data: [{
          created: false,
          envelope: { profile: { learnerProfile: {} } },
          generation: 1,
          profile_id: PROFILE_ID,
          revision: 1,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
        }],
        error: null
      }))
    }),
    importEnvelope: envelope => envelope.profile,
    readOnboardingState: () => null,
    verifyEnvelope: verifyEnvelope || (async envelope => envelope)
  })
}

test('cloud unavailability remains distinct from unsafe profile recovery', async () => {
  const unavailable = createAdapter({
    rpc: async () => ({
      data: null,
      error: { code: 'PGRST000', message: 'upstream unavailable' },
      status: 503
    })
  })
  const rejected = createAdapter({
    rpc: async () => ({
      data: null,
      error: { code: '42501', message: 'permission denied' },
      status: 403
    })
  })
  const thrown = createAdapter({
    rpc: async () => { throw new TypeError('network unavailable') }
  })
  const context = {
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: { learnerProfile: {} },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  }

  assert.deepEqual(await unavailable.resolve(context), {
    status: 'waiting-cloud'
  })
  assert.deepEqual(await thrown.resolve(context), {
    status: 'waiting-cloud'
  })
  assert.deepEqual(await rejected.resolve(context), {
    status: 'recovering'
  })
})

test('an unsupported or damaged cloud envelope cannot activate or clear local state', async () => {
  let clearCalls = 0
  const adapter = createAdapter({
    clearOnboardingDraft: () => {
      clearCalls += 1
      return true
    },
    verifyEnvelope: async () => null
  })

  const result = await adapter.resolve({
    authentication: { userId: OWNER_ID },
    connectivity: { status: 'online' },
    localProfile: {
      ownerId: OWNER_ID,
      profile: { learnerProfile: { languages: ['french'] } },
      profileId: PROFILE_ID,
      status: 'ready'
    },
    purpose: 'resolve-signed-in-profile'
  })

  assert.deepEqual(result, { status: 'recovering' })
  assert.equal(clearCalls, 0)
})

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

test('a returning owner activation discards an incidental onboarding draft', async () => {
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

  assert.equal(clearCalls, 0)
  assert.equal(result.finalize(), true)
  assert.equal(clearCalls, 1)
})
