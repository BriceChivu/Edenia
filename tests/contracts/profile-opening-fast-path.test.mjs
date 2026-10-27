import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
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

function harness({ rpc, sync = {}, local = {}, extraStorage = {}, cryptoLike,
  authentication = { userId: ownerId }, hasOnboardingProfileDraft = () => false,
  beginOpeningTrace } = {}) {
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
    cryptoLike,
    hasOnboardingProfileDraft, beginOpeningTrace,
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
  return { calls, storage, localProfile, authentication, verified: () => verified,
    open: (isCurrent = () => true) => adapter.resolve({ authentication, connectivity: { status: 'online' },
      localProfile, purpose: 'resolve-signed-in-profile', isCurrent }) }
}

test('a clean opening waits for native content proof before sending its cache claim', async () => {
  let release, observed
  const entered = new Promise(resolve => { observed = resolve })
  const permission = new Promise(resolve => { release = resolve })
  const h = harness({ cryptoLike: { subtle: { async digest(algorithm, bytes) {
    assert.equal(algorithm, 'SHA-256')
    observed()
    await permission
    return Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer
  } } } })
  const opening = h.open()
  assert.equal(await Promise.race([entered.then(() => 'native-proof'), opening.then(() => 'already-completed')]), 'native-proof')
  assert.equal(h.calls.length, 0, 'No request may claim content while its proof is incomplete')
  release()
  const result = await opening
  assert.equal(result.status, 'activate')
  assert.equal(result.profile, h.localProfile.profile)
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].params.p_cached_profile_sha256,
    createHash('sha256').update(canonicalizeJson(prepared.profile)).digest('base64url'))
})

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
  let finish, began
  const started = new Promise(resolve => { began = resolve })
  const h = harness({ rpc: () => new Promise(resolve => { finish = resolve; began() }) })
  const opening = h.open()
  await started
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
  let current = true
  const h = harness({ rpc: async () => {
    current = false
    return { data: [{ status: 'profile_unchanged', created: false, profile_id: profileId,
      generation: 1, revision: 7, envelope: null, profile_sha256: contentHash(prepared.profile), reset_state: { status: 'none' } }] }
  } })
  assert.equal((await h.open(() => current)).status, 'recovering')
  assert.equal(h.calls.length, 1)
})

function pausedCrypto() {
  let release, began
  const started = new Promise(resolve => { began = resolve })
  const permission = new Promise(resolve => { release = resolve })
  return { started, release, cryptoLike: { subtle: { async digest(algorithm, bytes) {
    began()
    await permission
    return Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer
  } } } }
}

function pendingOperation(baseRevision, operationId) {
  return { activationId: 'other-tab-activation', baseRevision, envelope: null, generation: 1,
    integrity: prepared.integrity, nextRetryAt: 0, operationId, ownerId, prepared,
    profileId, retryCount: 0, revision: baseRevision + 1 }
}

for (const change of ['body', 'dirty checkpoint', 'pending operation', 'queued operation', 'accepted revision',
  'local owner', 'authenticated owner', 'request retired', 'signed out', 'recovery journal', 'import journal', 'handoff journal', 'onboarding draft']) {
  test('a change while native proof is pending prevents a stale cache request: ' + change, async () => {
    const crypto = pausedCrypto()
    let current = true, draft = false
    const h = harness({ cryptoLike: crypto.cryptoLike, hasOnboardingProfileDraft: () => draft })
    const opening = h.open(() => current)
    await crypto.started
    assert.equal(h.calls.length, 0)
    if (change === 'body') h.localProfile.profile.config.weeklyGoalHours = 6
    if (change === 'dirty checkpoint') h.storage.setItem(key + '_dirty', JSON.stringify({ version: 1, ownerId, profileId, generation: 1 }))
    if (change === 'pending operation' || change === 'queued operation' || change === 'accepted revision') {
      const sync = JSON.parse(h.storage.getItem(key))
      if (change === 'accepted revision') sync.acceptedRevision++
      else {
        sync.pending = pendingOperation(7, '323e4567-e89b-42d3-a456-426614174002')
        if (change === 'queued operation') sync.queued = pendingOperation(8, '423e4567-e89b-42d3-a456-426614174003')
      }
      h.storage.setItem(key, JSON.stringify(sync))
    }
    if (change === 'local owner') h.localProfile.ownerId = '523e4567-e89b-42d3-a456-426614174004'
    if (change === 'authenticated owner') h.authentication.userId = '523e4567-e89b-42d3-a456-426614174004'
    if (change === 'request retired') current = false
    if (change === 'signed out') { h.authentication.userId = null; current = false }
    if (change === 'recovery journal') h.storage.setItem(key + '_recovery', '{}')
    if (change === 'import journal') h.storage.setItem(key + '_import_v1', '{}')
    if (change === 'handoff journal') h.storage.setItem(key + '_handoff_repair', '{}')
    if (change === 'onboarding draft') draft = true
    const syncAfterEdit = h.storage.getItem(key)
    crypto.release()
    assert.equal((await opening).status, 'recovering')
    assert.equal(h.calls.length, 0, 'A retired candidate must not be sent as a cache claim or silently retried as a full opening')
    assert.equal(h.storage.getItem(key), syncAfterEdit, 'Newer durable operations remain untouched')
    if (change === 'body') assert.equal(h.localProfile.profile.config.weeklyGoalHours, 6)
  })
}

for (const cryptoLike of [null, {}, { subtle: {} }, { subtle: { digest() { throw new Error('Native crypto unavailable') } } },
  { subtle: { async digest() { throw new Error('Native crypto rejected') } } }]) {
  test('unsupported native hashing preserves the existing exact cached-content proof', async () => {
    const h = harness({ cryptoLike })
    const result = await h.open()
    assert.equal(result.status, 'activate')
    assert.equal(result.profileUnchanged, true)
    assert.equal(h.calls[0].params.p_cached_profile_sha256,
      createHash('sha256').update(canonicalizeJson(prepared.profile)).digest('base64url'))
  })
}

test('retirement during a rejected native proof skips stale synchronous fallback work', async t => {
  let rejectDigest, began, current = true
  const started = new Promise(resolve => { began = resolve })
  const h = harness({ cryptoLike: { subtle: { digest() {
    began()
    return new Promise((resolve, reject) => { rejectDigest = reject })
  } } } })
  const opening = h.open(() => current)
  await started
  let encodings = 0
  const encode = TextEncoder.prototype.encode
  t.mock.method(TextEncoder.prototype, 'encode', function (...args) {
    encodings++
    return Reflect.apply(encode, this, args)
  })
  current = false
  rejectDigest(new Error('Native crypto rejected after retirement'))
  assert.equal((await opening).status, 'recovering')
  assert.equal(encodings, 0, 'A retired proof must not encode and hash the captured body again')
  assert.equal(h.calls.length, 0)
})

test('an already retired attempt cannot start hashing or a profile request', async () => {
  let hashes = 0
  const h = harness({ cryptoLike: { subtle: { digest() { hashes++; throw new Error('Must not start') } } } })
  assert.equal((await h.open(() => false)).status, 'recovering')
  assert.equal(hashes, 0)
  assert.equal(h.calls.length, 0)
})

test('optional opening diagnostics capture one handle and fixed RPC phases without profile data', async () => {
  const phases = []
  let traces = 0
  const h = harness({ beginOpeningTrace(...args) {
    assert.deepEqual(args, [])
    traces++
    return { mark(...values) { assert.equal(values.length, 1); phases.push(values[0]) } }
  } })
  assert.equal((await h.open()).status, 'activate')
  assert.equal(traces, 1)
  assert.deepEqual(phases, ['opening-rpc-start', 'opening-rpc-end'])
})

for (const source of ['factory', 'mark']) test('diagnostic errors cannot change a verified opening: ' + source, async () => {
  const h = harness({ beginOpeningTrace() {
    if (source === 'factory') throw new Error('Synthetic diagnostic failure')
    return { mark() { throw new Error('Synthetic diagnostic failure') } }
  } })
  assert.equal((await h.open()).status, 'activate')
  assert.equal(h.calls.length, 1)
})

test('the RPC end phase is recorded even when transport fails', async () => {
  const phases = []
  const h = harness({ beginOpeningTrace: () => ({ mark: phase => phases.push(phase) }),
    rpc: async () => { throw new TypeError('Synthetic transport failure') } })
  assert.equal((await h.open()).status, 'waiting-cloud')
  assert.deepEqual(phases, ['opening-rpc-start', 'opening-rpc-end'])
})

test('missing-function fallback retains one captured trace handle for both RPCs', async () => {
  const phases = []
  let traces = 0
  const h = harness({ beginOpeningTrace() { traces++; return { mark: phase => phases.push(phase) } },
    rpc: async name => name === 'open_my_learner_profile'
      ? { error: { code: 'PGRST202' }, status: 404 }
      : { data: [{ status: 'profile_ready', created: false, profile_id: profileId, generation: 1, revision: 7, envelope: prepared }] } })
  assert.equal((await h.open()).status, 'activate')
  assert.equal(traces, 1)
  assert.deepEqual(phases, ['opening-rpc-start', 'opening-rpc-end', 'opening-rpc-start', 'opening-rpc-end'])
})

test('overlapping attempts mark only their own captured diagnostic handle', async () => {
  const phases = []
  const h = harness({ beginOpeningTrace() {
    const own = []
    phases.push(own)
    return { mark: phase => own.push(phase) }
  } })
  const results = await Promise.all([h.open(), h.open()])
  assert.ok(results.every(result => result.status === 'activate'))
  assert.deepEqual(phases, [['opening-rpc-start', 'opening-rpc-end'], ['opening-rpc-start', 'opening-rpc-end']])
})

for (const source of ['local owner', 'authenticated owner']) test('ownership is still fenced after native proof and the server response: ' + source, async () => {
  const h = harness({ rpc: async () => {
    if (source === 'local owner') h.localProfile.ownerId = '523e4567-e89b-42d3-a456-426614174004'
    else h.authentication.userId = '523e4567-e89b-42d3-a456-426614174004'
    return { data: [{ status: 'profile_unchanged', created: false, profile_id: profileId,
      generation: 1, revision: 7, envelope: null, profile_sha256: contentHash(prepared.profile), reset_state: { status: 'none' } }] }
  } })
  assert.equal((await h.open()).status, 'recovering')
  assert.equal(h.calls.length, 1)
})

test('a delayed activation repair cannot cross a later authenticated owner change', async () => {
  const h = harness()
  const result = await h.open()
  assert.equal(result.status, 'activate')
  h.authentication.userId = '523e4567-e89b-42d3-a456-426614174004'
  assert.equal(result.commitSyncRepair({ isCurrent: () => true }), false)
})
