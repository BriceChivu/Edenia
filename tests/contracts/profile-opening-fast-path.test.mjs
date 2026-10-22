import assert from 'node:assert/strict'
import test from 'node:test'
import { createLearnerProfileCloudPersistenceAdapter } from '../../src/integrations/learner-profile-cloud-persistence.js'
import { normalizePortableLearnerProfile, preparePortableLearnerProfileEnvelope,
  finalizePortableLearnerProfileEnvelope, verifyPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'
import { canonicalizeJson, sha256Base64UrlSync } from '../../src/state/portable-state.js'

const ownerId = '123e4567-e89b-42d3-a456-426614174000'
const profileId = '223e4567-e89b-42d3-a456-426614174001'
const key = 'opening-sync'
const prepared = preparePortableLearnerProfileEnvelope({ config: {}, videos: {}, anki: {},
  onboarding: { setupCompleted: true } })
const contentHash = profile => sha256Base64UrlSync(canonicalizeJson(profile))

function harness({ rpc, sync = {}, local = {}, extraStorage = {} } = {}) {
  const record = { version: 1, ownerId, profileId, generation: 1, acceptedRevision: 7, pending: null, queued: null, ...sync }
  const values = new Map(Object.entries({ [key]: JSON.stringify(record), ...extraStorage }))
  const storage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }
  const localProfile = { status: 'ready', ownerId, profileId, generation: 1, revision: 7,
    profile: structuredClone(prepared.profile), ...local }
  const calls = []
  let verified = 0
  const adapter = createLearnerProfileCloudPersistenceAdapter({
    handoffEnabled: true, conditionalOpeningEnabled: true, clearOnboardingDraft: () => true,
    createOnboardingEnvelope: async () => null, createOperationId: () => crypto.randomUUID(),
    eventTarget: new EventTarget(), finalizeEnvelope: finalizePortableLearnerProfileEnvelope,
    prepareEnvelope: preparePortableLearnerProfileEnvelope, normalizeProfile: normalizePortableLearnerProfile,
    importEnvelope: envelope => envelope.profile, verifyEnvelope: async envelope => {
      verified++; return verifyPortableLearnerProfileEnvelope(envelope)
    },
    isOnline: () => true, now: Date.now, readOnboardingState: () => null,
    setTimer: () => 0, storage, syncStorageKey: key,
    getClient: () => ({ rpc: async (name, params) => {
      calls.push({ name, params })
      if (rpc) return rpc(name, params)
      assert.equal(name, 'open_my_learner_profile')
      return { data: [{ status: 'profile_unchanged', created: false, profile_id: profileId,
        generation: 1, revision: 7, envelope: null, profile_sha256: contentHash(prepared.profile),
        reset_state: { status: 'none' } }], error: null }
    } })
  })
  return { calls, storage, localProfile, verified: () => verified,
    open: (isCurrent = () => true) => adapter.resolve({ authentication: { userId: ownerId }, connectivity: { status: 'online' },
      localProfile, purpose: 'resolve-signed-in-profile', isCurrent }) }
}

test('an exact clean cached profile opens with one small response and keeps its actual local body', async () => {
  const h = harness()
  const result = await h.open()
  assert.equal(result.status, 'activate')
  assert.equal(result.profileUnchanged, true)
  assert.equal(result.profile, h.localProfile.profile)
  assert.equal(result.resetState.status, 'none')
  assert.equal(h.calls.length, 1)
  assert.equal(h.verified(), 0, 'no full envelope was transferred or verified')
  assert.equal(h.calls[0].params.p_cached_profile_sha256, contentHash(prepared.profile))
  assert.equal(result.commitSyncRepair({ isCurrent: () => false }), false)
  assert.equal(result.commitSyncRepair({ isCurrent: () => true }), true)
  h.storage.setItem(key + '_dirty', 'changed')
  assert.equal(result.commitSyncRepair({ isCurrent: () => true }), false, 'late local changes retire the opening')
})

for (const mutate of [
  row => { row.revision++ }, row => { row.generation++ }, row => { row.profile_id = ownerId },
  row => { row.profile_sha256 = 'A'.repeat(43) }, row => { row.created = true },
  row => { row.envelope = prepared }
]) test('an inconsistent unchanged response never activates a local copy: ' + mutate.toString(), async () => {
  const h = harness({ rpc: async () => {
    const row = { status: 'profile_unchanged', created: false, profile_id: profileId,
      generation: 1, revision: 7, envelope: null, profile_sha256: contentHash(prepared.profile), reset_state: { status: 'none' } }
    mutate(row)
    return { data: [row] }
  } })
  assert.equal((await h.open()).status, 'recovering')
})

for (const kind of ['dirty', 'queued', 'protected', 'recovery', 'wrong-owner', 'older-local']) {
  test('unsettled or unrelated local state cannot use the fast path: ' + kind, async () => {
    const options = kind === 'dirty' ? { extraStorage: { [key + '_dirty']: '{}' } }
      : kind === 'protected' ? { sync: { protectedConflictIds: [ownerId] } }
      : kind === 'queued' ? { sync: { queued: { invalid: true } } }
      : kind === 'recovery' ? { extraStorage: { [key + '_recovery']: '{}' } }
      : kind === 'wrong-owner' ? { local: { ownerId: profileId } }
      : { local: { revision: 6 } }
    const h = harness({ ...options, rpc: async (name, params) => {
      if (name === 'open_my_learner_profile') assert.equal(params.p_cached_profile_sha256, null)
      return { data: [{ status: 'access_disabled' }] }
    } })
    assert.notEqual((await h.open()).status, 'activate')
  })
}

for (const kind of ['dirty', 'sync-revision', 'body']) test('changes during the request cannot be discarded: ' + kind, async () => {
  let finish
  const h = harness({ rpc: () => new Promise(resolve => { finish = resolve }) })
  const opening = h.open()
  while (!finish) await Promise.resolve()
  if (kind === 'body') h.localProfile.profile.config.weeklyGoalHours = 6
  if (kind === 'dirty') h.storage.setItem(key + '_dirty', 'changed')
  if (kind === 'sync-revision') h.storage.setItem(key, JSON.stringify({ changed: true }))
  const before = h.storage.getItem(key)
  finish({ data: [{ status: 'profile_unchanged', created: false, profile_id: profileId,
    generation: 1, revision: 7, envelope: null, profile_sha256: contentHash(prepared.profile), reset_state: { status: 'none' } }] })
  assert.equal((await opening).status, 'recovering')
  assert.equal(h.storage.getItem(key), before)
})

test('a newer cloud revision returns and verifies the complete profile in the same request', async () => {
  const newer = preparePortableLearnerProfileEnvelope({ ...prepared.profile, config: { ...prepared.profile.config, weeklyGoalHours: 6 } })
  const h = harness({ rpc: async name => {
    assert.equal(name, 'open_my_learner_profile')
    return { data: [{ status: 'profile_ready', created: false, profile_id: profileId,
      generation: 1, revision: 8, envelope: newer, reset_state: { status: 'none' } }] }
  } })
  const result = await h.open()
  assert.equal(result.status, 'activate')
  assert.equal(result.profileUnchanged, undefined)
  assert.equal(result.profile.config.weeklyGoalHours, 6)
  assert.equal(result.revision, 8)
  assert.equal(result.resetState.status, 'none')
  assert.equal(h.calls.length, 1)
  assert.equal(h.verified(), 1)
})

test('a client deployed before the new RPC falls back only for a missing function', async () => {
  const h = harness({ rpc: async name => name === 'open_my_learner_profile'
    ? { error: { code: 'PGRST202' }, status: 404 }
    : { data: [{ status: 'profile_ready', created: false, profile_id: profileId,
      generation: 1, revision: 7, envelope: prepared }] } })
  assert.equal((await h.open()).status, 'activate')
  assert.deepEqual(h.calls.map(call => call.name), ['open_my_learner_profile', 'resolve_my_learner_profile'])
})

test('a transient cloud failure cannot masquerade as an unchanged profile', async () => {
  const h = harness({ rpc: async () => ({ error: { code: 'network' }, status: 503 }) })
  assert.equal((await h.open()).status, 'waiting-cloud')
  assert.equal(h.calls.length, 1)
})

test('an account change retires even an exact unchanged response', async () => {
  const h = harness()
  assert.equal((await h.open(() => false)).status, 'recovering')
  assert.equal(h.calls.length, 1)
})
