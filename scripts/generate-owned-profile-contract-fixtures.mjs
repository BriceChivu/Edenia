import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createPortableLearnerProfileEnvelope, verifyPortableLearnerProfileEnvelope } from '../src/state/portable-learner-profile.js'
import { createInitialSignedInProfileEnvelope } from '../src/state/first-signed-in-profile.js'
import { initializeExperience } from '../src/domain/experience.js'
import { canonicalizeJson, sha256Base64Url } from '../src/state/portable-state.js'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { createProductionSourceResolver } from './build-production-experience.mjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const { sourcePath, plugin } = await createProductionSourceResolver(projectRoot)
await mkdir(new URL('../.cache/', import.meta.url), { recursive: true })
const legacyModule = new URL('../.cache/legacy-owned-profile-verifier.mjs', import.meta.url)
await build({ entryPoints: [sourcePath('src/state/portable-learner-profile.js')], plugins: [plugin], bundle: true, platform: 'node', format: 'esm', outfile: fileURLToPath(legacyModule) })
const { verifyPortableLearnerProfileEnvelope: verifyLegacyEnvelope } = await import(legacyModule.href)

// Generate with node scripts/generate-owned-profile-contract-fixtures.mjs, then run
// supabase test db .cache/current-experience-owned-profile.test.sql --local.
// No database connection or hosted configuration: generate inputs with owning client code.
const at = '2026-10-08T01:00:00.000Z'
const options = { now: () => new Date(at) }
const draft = {
  config: {}, videos: {}, anki: {}, cityProgress: { maxLevelIndex: 0 },
  learnerProfile: { languages: ['french'], level: 'beginner', selectedChannelCatalogIds: [] },
  onboarding: { accountStepReachedAt: at, introSeenAt: at, islandAnnouncementSeenAt: at }
}
const initial = await createInitialSignedInProfileEnvelope(draft, {
  createEnvelope: createPortableLearnerProfileEnvelope,
  normalizeLearnerProfile: () => {}, ...options
})
const cases = new Map([['initial', initial]])
async function add(name, state) {
  const { envelope } = await createPortableLearnerProfileEnvelope(state, options)
  assert.ok(await verifyPortableLearnerProfileEnvelope(envelope))
  cases.set(name, envelope)
  return envelope
}
await add('initial-xp', { ...initial.profile, cityProgress: { maxLevelIndex: 0, experienceVersion: 1 } })
const legacy = structuredClone(initial.profile)
delete legacy.onboarding.islandAnnouncementSeenAt
await add('legacy', legacy)
assert.ok(await verifyLegacyEnvelope(cases.get('legacy')))
const current = structuredClone(initial.profile)
current.cityProgress = { maxLevelIndex: 11, pendingLevelIndex: 12, scoringVersion: 7 }
initializeExperience(current, 7)
current.anki = { '2026-10-08': { reviewed: 101, created: 4, observedAt: at, experienceWatermark: 101, experienceReviews: 1 } }
current.videos = { lesson: { id: 'lesson', title: 'Lesson', duration: 600, watchProgressTracked: true,
  watchProgress: [{ seconds: 120, experienceSeconds: 60, watchedAt: at, studyDay: '2026-10-08' }] } }
await add('xp', current)
current.tinySwordsIsland = JSON.parse(await readFile(new URL('../tests/fixtures/tiny-swords-populated-island.json', import.meta.url)))
await add('island', current)
const differentIsland = structuredClone(current)
differentIsland.tinySwordsIsland.resources.wood += 2
await add('island-different', differentIsland)
await add('opaque', { ...current, tinySwordsIsland: { version: 999, unknown: '保留🌴', timer: 1e-7, small: 1e-6, large: 1e20, huge: 1e21, negative: -0.000001, '\uE000': 1, '\u{10000}': 2, '10': 10, '2': 2 } })
assert.equal(await verifyLegacyEnvelope(cases.get('island')), null, 'old client must guard new durable fields')
const blank = { config: {}, videos: {}, anki: {}, cityProgress: { maxLevelIndex: 0 } }
initializeExperience(blank)
await add('reset', blank)
await add('island-limit', { ...current, tinySwordsIsland: 'x'.repeat(512 * 1024 - 2) })

// Exercise recursive work across many ordinary records, rather than only a
// large string. Large real video libraries exposed an import RPC timeout.
const largeLibrary = structuredClone(current)
largeLibrary.videos = Object.fromEntries(Array.from({ length: 1600 }, (_, index) => {
  const id = `library-${String(index).padStart(5, '0')}`
  return [id, { ...current.videos.lesson, id, title: `Lesson ${index}: ` + 'Language study 日本語 français '.repeat(12) }]
}))
await add('large-library', largeLibrary)
assert.ok(cases.get('large-library').integrity.byteLength > 1024 * 1024)
assert.ok(cases.get('large-library').integrity.byteLength < 2 * 1024 * 1024)

async function cloudBoundary(name, targetBytes) {
  const state = { ...current, activityLog: [{ id: 'boundary', type: 'study', createdAt: at, detail: '' }] }
  const first = await createPortableLearnerProfileEnvelope(state, options)
  state.activityLog[0].detail = 'x'.repeat(targetBytes - first.byteLength)
  let result = await createPortableLearnerProfileEnvelope(state, options)
  state.activityLog[0].detail += 'x'.repeat(Math.max(0, targetBytes - result.byteLength))
  if (result.byteLength > targetBytes) state.activityLog[0].detail = state.activityLog[0].detail.slice(0, targetBytes - result.byteLength)
  result = await createPortableLearnerProfileEnvelope(state, options)
  assert.equal(result.byteLength, targetBytes)
  cases.set(name, result.envelope)
  assert.ok(await verifyPortableLearnerProfileEnvelope(result.envelope))
  assert.equal(Boolean(await verifyPortableLearnerProfileEnvelope(result.envelope, { maxBytes: 2 * 1024 * 1024 })), targetBytes <= 2 * 1024 * 1024)
}
await cloudBoundary('cloud-limit', 2 * 1024 * 1024)
await cloudBoundary('cloud-over', 2 * 1024 * 1024 + 1)

// Malformed inputs are deliberately rehashed, isolating schema/transport rejection
// from integrity rejection. They never pass through normalization that repairs them.
async function malformed(name, mutate) {
  const envelope = structuredClone(cases.get('island'))
  mutate(envelope)
  const { integrity, ...payload } = envelope
  integrity.payloadSha256 = await sha256Base64Url(canonicalizeJson(payload))
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = Buffer.byteLength(canonicalizeJson(envelope))
    if (bytes === integrity.byteLength) break
    integrity.byteLength = bytes
  }
  cases.set(name, envelope)
}
await malformed('island-over', e => { e.profile.tinySwordsIsland = 'é'.repeat(256 * 1024) })
await malformed('bad-xp', e => { e.profile.videos.lesson.watchProgress[0].experienceSeconds = 121 })
await malformed('bad-counter', e => { e.profile.anki['2026-10-08'].experienceReviews = -1 })
await malformed('unsafe-counter', e => { e.profile.anki['2026-10-08'].experienceWatermark = 9007199254740992 })
await malformed('bad-marker', e => { e.profile.cityProgress.experienceVersion = 2 })
await malformed('bad-date', e => { e.profile.onboarding.islandAnnouncementSeenAt = '2026-02-30T01:00:00.000Z' })
const corrupt = structuredClone(cases.get('island'))
corrupt.profile.tinySwordsIsland.resources.wood++
cases.set('corrupt', corrupt)
const badBytes = structuredClone(cases.get('island'))
badBytes.integrity.byteLength++
cases.set('bad-bytes', badBytes)

const output = new URL('../.cache/current-experience-owned-profile.test.sql', import.meta.url)
await mkdir(new URL('../.cache/', import.meta.url), { recursive: true })
const rows = [...cases].map(([name, envelope]) => `('${name}', '${canonicalizeJson(envelope).replaceAll("'", "''")}'::jsonb)`).join(',\n')
const inputs = `-- Generated by scripts/generate-owned-profile-contract-fixtures.mjs\ncreate temporary table owned_profile_inputs (name text primary key, envelope jsonb);\ninsert into owned_profile_inputs values\n${rows};\ngrant select on owned_profile_inputs to authenticated;\ncreate function pg_temp.profile_input(input_name text) returns jsonb language sql as $$ select envelope from owned_profile_inputs where name = input_name $$;\n`
const suite = await readFile(new URL('../tests/fixtures/current-experience-owned-profile.sql', import.meta.url), 'utf8')
await writeFile(output, suite.replace('-- CLIENT_ENVELOPE_INPUTS', () => inputs))
const handoffSuite = await readFile(new URL('../tests/fixtures/stale-generation-island-conflict.sql', import.meta.url), 'utf8')
await writeFile(new URL('../.cache/stale-generation-island-conflict.test.sql', import.meta.url), handoffSuite.replace('-- CLIENT_ENVELOPE_INPUTS', () => inputs))
const trialSuite = await readFile(new URL('../tests/fixtures/auth-trial-admission.sql', import.meta.url), 'utf8')
await writeFile(new URL('../.cache/auth-trial-admission.test.sql', import.meta.url), trialSuite.replace('-- CLIENT_ENVELOPE_INPUTS', () => inputs))
console.log(`Generated ${cases.size} client envelope inputs for local SQL tests`)
