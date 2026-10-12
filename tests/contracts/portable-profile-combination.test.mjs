import assert from 'node:assert/strict'
import test from 'node:test'
import { captureProfileChanges, restoreProfileBase, combinePortableProfiles, PROFILE_CHANGE_MAX_BYTES } from '../../src/domain/portable-profile-combination.js'

const clone = value => structuredClone(value)
const fact = (watchedAt, seconds) => ({ watchedAt, studyDay: '2026-10-12', seconds })

test('bounded before-values survive reload and combine separate device study', () => {
  const base = { config: { locale: 'en' }, videos: { a: { favorite: false }, b: { favorite: false } } }
  const local = clone(base), cloud = clone(base)
  local.videos.a.favorite = true
  cloud.videos.b.favorite = true
  const changes = JSON.parse(JSON.stringify(captureProfileChanges(base, local)))
  assert.deepEqual(restoreProfileBase(local, changes), base)
  assert.deepEqual(combinePortableProfiles(base, local, cloud), { config: { locale: 'en' }, videos: { a: { favorite: true }, b: { favorite: true } } })
  const corrupted = clone(changes)
  corrupted.entries[0].before = { favorite: true }
  assert.equal(restoreProfileBase(local, corrupted), null)
  assert.equal(restoreProfileBase(cloud, changes), null)
})

test('watch facts combine by stable time and grow once without resurrecting deleted facts', () => {
  const at = '2026-10-12T01:00:00.000Z', later = '2026-10-12T02:00:00.000Z'
  const base = { videos: { a: { status: 'partial', watchProgress: [fact(at, 10)] } } }
  const local = clone(base), cloud = clone(base)
  local.videos.a.watchProgress[0].seconds = 20
  cloud.videos.a.watchProgress.push(fact(later, 30))
  const result = combinePortableProfiles(base, local, cloud)
  assert.deepEqual(result.videos.a.watchProgress.map(({ seconds }) => seconds), [20, 30])
  local.videos.a.watchProgress = []
  assert.equal(combinePortableProfiles(base, local, cloud), null)
})

test('Anki observations use maxima and conflicting preference edits stay explicit', () => {
  const base = { config: { weeklyGoalHours: 4 }, anki: { '2026-10-12': { reviewed: 10, created: 2, observedAt: null } } }
  const local = clone(base), cloud = clone(base)
  local.anki['2026-10-12'].reviewed = 15
  cloud.anki['2026-10-12'].reviewed = 20
  assert.equal(combinePortableProfiles(base, local, cloud).anki['2026-10-12'].reviewed, 20)
  local.config.weeklyGoalHours = 6
  cloud.config.weeklyGoalHours = 8
  assert.equal(combinePortableProfiles(base, local, cloud), null)
  local.config.weeklyGoalHours = 4
  local.anki['2026-10-12'].reviewed = 5
  assert.equal(combinePortableProfiles(base, local, cloud), null)
})

test('Godot semantic identity ignores ambient positions and fences gameplay disagreement', () => {
  const island = { sync_semantics: { version: 1, sha256: 'a'.repeat(64), ambient_arrays: ['chickens', 'sheep'] }, chickens: [[1, 2]], sheep: [] }
  const base = { tinySwordsIsland: island, config: { locale: 'en' } }
  const local = clone(base), cloud = clone(base)
  local.tinySwordsIsland.chickens = [[3, 4]]
  cloud.tinySwordsIsland.chickens = [[5, 6]]
  local.config.locale = 'fr'
  assert.deepEqual(combinePortableProfiles(base, local, cloud), { tinySwordsIsland: cloud.tinySwordsIsland, config: { locale: 'fr' } })
  assert.ok(restoreProfileBase(local, captureProfileChanges(base, local)))
  local.tinySwordsIsland.sync_semantics.sha256 = 'b'.repeat(64)
  cloud.tinySwordsIsland.sync_semantics.sha256 = 'c'.repeat(64)
  assert.equal(combinePortableProfiles(base, local, cloud), null)
})

test('large unchanged libraries do not duplicate a full snapshot into the change record', () => {
  const base = { config: { locale: 'en' }, videos: Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [String(i), { title: 'a'.repeat(400), favorite: false }])) }
  const local = clone(base)
  local.config.locale = 'fr'
  assert.ok(JSON.stringify(captureProfileChanges(base, local)).length < 1024)
  local.videos = {}
  assert.equal(captureProfileChanges(base, local), null)
  assert.equal(PROFILE_CHANGE_MAX_BYTES, 128 * 1024)
  assert.equal(captureProfileChanges({ unknown: 1 }, { unknown: 2 }), null)
  assert.equal(restoreProfileBase(local, { entries: [{ path: ['__proto__', 'polluted'], before: true }] }), null)
  assert.equal({}.polluted, undefined)
})

test('bounded journal sparsely captures a full activity log and large receipt maps', () => {
  const base = { activityLog: Array.from({ length: 500 }, (_, i) => ({ id: String(i), createdAt: `2026-10-12T01:${String(i % 60).padStart(2, '0')}:00.000Z`, detail: 'x'.repeat(400) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)),
    townEconomy: { rewards: Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [String(i), { experience: i, detail: 'x'.repeat(400) }])), purchases: {} } }
  const local = clone(base)
  local.activityLog[0].detail = 'new observation'
  local.townEconomy.rewards.extra = { experience: 1 }
  const changes = captureProfileChanges(base, local)
  assert.ok(JSON.stringify(changes).length < 2048)
  assert.deepEqual(restoreProfileBase(local, changes), base)
})

test('a stale Godot tag never hides meaningful island changes', () => {
  const base = { tinySwordsIsland: { sync_semantics: { version: 1, sha256: 'a'.repeat(64), ambient_arrays: ['chickens'] }, chickens: [[0, 0]], stock: 1 } }
  const local = clone(base), cloud = clone(base)
  local.tinySwordsIsland.stock = 2
  cloud.tinySwordsIsland.stock = 3
  assert.equal(combinePortableProfiles(base, local, cloud), null)
})

test('same-video sequential playback retains both study facts and the latest dated resume observation', () => {
  const base = { videos: { a: { resumeAtSeconds: 0, pausedAt: '2026-10-12T00:00:00.000Z', watchProgress: [] } } }
  const local = clone(base), cloud = clone(base)
  local.videos.a = { resumeAtSeconds: 40, pausedAt: '2026-10-12T01:00:00.000Z', watchProgress: [fact('2026-10-12T01:00:00.000Z', 40)] }
  cloud.videos.a = { resumeAtSeconds: 60, pausedAt: '2026-10-12T02:00:00.000Z', watchProgress: [fact('2026-10-12T02:00:00.000Z', 60)] }
  const result = combinePortableProfiles(base, local, cloud)
  assert.equal(result.videos.a.resumeAtSeconds, 60)
  assert.equal(result.videos.a.pausedAt, cloud.videos.a.pausedAt)
  assert.equal(result.videos.a.watchProgress.length, 2)
  cloud.videos.a.pausedAt = local.videos.a.pausedAt
  assert.equal(combinePortableProfiles(base, local, cloud), null)
  cloud.videos.a.pausedAt = null
  assert.equal(combinePortableProfiles(base, local, cloud), null)
})
