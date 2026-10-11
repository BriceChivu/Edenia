import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  createPortableLearnerProfileEnvelope,
  preparePortableLearnerProfileEnvelope,
  verifyPortableLearnerProfileEnvelope
} from '../../src/state/portable-learner-profile.js'

// Run from the repository root. This uses synthetic profiles and a fake service;
// no production service, session, or learner data is read.
// Compare sequential runs with --baseline-ref=<commit-before-the-fix>.
let adapterUrl = '../../src/integrations/learner-profile-cloud-persistence.js'
const baselineRef = process.argv.find(value => value.startsWith('--baseline-ref='))?.slice('--baseline-ref='.length)
if (baselineRef) {
  const { build } = await import('esbuild')
  const source = execFileSync('git', [
    'show', `${baselineRef}:src/integrations/learner-profile-cloud-persistence.js`
  ], { encoding: 'utf8' })
  const bundle = await build({
    stdin: { contents: source, resolveDir: resolve('src/integrations') },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false
  })
  adapterUrl = 'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
}
const { createLearnerProfileCloudPersistenceAdapter } = await import(adapterUrl)
const fixture = JSON.parse(await readFile('tests/fixtures/learner-profile/profile-ready-trial-smoke.json', 'utf8'))
const profile = structuredClone(fixture.resolution.envelope.profile)
for (let index = 0; index < 1800; index++) {
  const videoId = `video-${index}`
  profile.videos[videoId] = {
    id: videoId,
    manuallyAdded: true,
    title: `Synthetic study video ${index} ${'x'.repeat(160)}`,
    duration: 3600,
    status: 'unwatched',
    watchProgress: []
  }
}
const { envelope } = await createPortableLearnerProfileEnvelope(profile)
const ownerId = fixture.session.user.id
const profileId = fixture.resolution.profile_id
const conflictIds = Array.from({ length: 7 }, (_, index) => `${index + 1}aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`)
const values = new Map([['sync', JSON.stringify({
  version: 1,
  ownerId,
  profileId,
  generation: 1,
  acceptedRevision: 6,
  pending: null,
  queued: null,
  protectedConflictIds: conflictIds
})]])
let bytes = 0
let archivedBytes = 0
let verifications = 0
const latencyPerRequestMs = 150
const client = createClient('https://synthetic.invalid', 'synthetic-key', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (url, options) => {
      await new Promise(resolve => setTimeout(resolve, latencyPerRequestMs))
      const requestUrl = new URL(url)
      let row
      if (requestUrl.pathname.endsWith('resolve_my_learner_profile')) {
        row = { status: 'profile_ready', created: false, envelope, generation: 1, revision: 6, profile_id: profileId }
      } else if (requestUrl.pathname.endsWith('read_my_learner_profile_conflict')) {
        const conflictId = JSON.parse(options.body).p_conflict_id
        row = {
          status: 'resolved',
          conflict_id: conflictId,
          operation_id: conflictId,
          profile_id: profileId,
          device_generation: 1,
          device_revision: 2,
          cloud_generation: 1,
          cloud_revision: 2,
          selected_side: 'device',
          protected_until: '2027-01-01T00:00:00.000Z',
          device_envelope: envelope,
          cloud_envelope: envelope
        }
        const select = requestUrl.searchParams.get('select')
        if (select) row = Object.fromEntries(select.split(',').map(column => [column, row[column]]))
        archivedBytes += Buffer.byteLength(JSON.stringify([row]))
      } else if (requestUrl.pathname.endsWith('read_my_latest_learner_profile_reset')) {
        row = { status: 'none' }
      } else {
        throw new Error('Unexpected RPC: ' + requestUrl.pathname)
      }
      const body = JSON.stringify([row])
      bytes += Buffer.byteLength(body)
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
    }
  }
})
const adapter = createLearnerProfileCloudPersistenceAdapter({
  clearOnboardingDraft: () => true,
  createOnboardingEnvelope: async () => null,
  createOperationId: () => crypto.randomUUID(),
  eventTarget: new EventTarget(),
  finalizeEnvelope: async prepared => ({ envelope: prepared }),
  getClient: () => client,
  importEnvelope: value => value.profile,
  isOnline: () => true,
  now: () => Date.parse('2026-10-11T00:00:00Z'),
  prepareEnvelope: preparePortableLearnerProfileEnvelope,
  readOnboardingState: () => null,
  setTimer: setTimeout,
  storage: {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  },
  syncStorageKey: 'sync',
  verifyEnvelope: async value => {
    verifications++
    return verifyPortableLearnerProfileEnvelope(value)
  }
})
const began = performance.now()
const result = await adapter.resolve({
  authentication: { userId: ownerId },
  connectivity: { status: 'online' },
  localProfile: { status: 'ready', ownerId, profileId, generation: 1, revision: 6, profile: envelope.profile },
  purpose: 'resolve-signed-in-profile'
})
console.log(JSON.stringify({
  synthetic: true,
  baselineRef,
  latencyPerRequestMs,
  profileBytes: envelope.integrity.byteLength,
  status: result.status,
  ms: Math.round(performance.now() - began),
  bytes,
  archivedBytes,
  verifications,
  retained: result.protectedConflicts?.length
}))
// A stable payload/work budget catches the regression without machine-specific timings.
if (result.status !== 'activate' || archivedBytes > 8192 || verifications !== 1) process.exitCode = 1
