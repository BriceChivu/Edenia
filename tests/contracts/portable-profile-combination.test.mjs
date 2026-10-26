import assert from 'node:assert/strict'
import test from 'node:test'
import { captureProfileChanges, restoreProfileBase, combinePortableProfiles, portableProfilesHaveSameProgress, PROFILE_CHANGE_MAX_BYTES } from '../../src/domain/portable-profile-combination.js'

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

test('a profile cannot declare meaningful building arrays as ambient', () => {
  const base = { tinySwordsIsland: { sync_semantics: { version: 1, sha256: 'a'.repeat(64), ambient_arrays: ['buildings'] }, buildings: [{ type: 'farm' }] } }
  const local = clone(base), cloud = clone(base)
  local.tinySwordsIsland.buildings[0].type = 'sawmill'
  cloud.tinySwordsIsland.buildings[0].type = 'house'
  assert.equal(combinePortableProfiles(base, local, cloud), null)
})


test('automatic Cloud adoption ignores only diagnostics and validated Godot ambient motion', () => {
  const base = { tinySwordsIsland: { sync_semantics: { version: 1, sha256: 'a'.repeat(64), ambient_arrays: ['chickens', 'sheep'] },
    chickens: [], sheep: [[1, 2]], resources: { wood: 10 }, buildings: [] }, activityLog: [], anki: {}, config: { locale: 'en' } }
  const cloud = clone(base)
  cloud.tinySwordsIsland.sheep = [[4, 5]]
  cloud.activityLog = [{ id: 'refresh', title: 'Channel refreshed' }]
  assert.equal(portableProfilesHaveSameProgress(base, cloud), true)
  for (const mutate of [
    value => { value.tinySwordsIsland.resources.wood++ },
    value => { value.tinySwordsIsland.buildings.push({ type: 'house' }) },
    value => { value.tinySwordsIsland.sheep.push([6, 7]) },
    value => { value.anki['2026-10-14'] = { reviewed: 1, experienceReviews: 1 } },
    value => { value.config.locale = 'fr' },
    value => { value.unknown = true },
    value => { value.tinySwordsIsland.sync_semantics.ambient_arrays = ['buildings'] }
  ]) {
    const changed = clone(cloud)
    mutate(changed)
    assert.equal(portableProfilesHaveSameProgress(base, changed), false)
  }
})


test('durable Godot v38 counts preserve gameplay identity without ambient arrays', () => {
  const island = { version: 38, chicken_count: 1, sheep_count: 1,
    sync_semantics: { version: 2, ambient_arrays: [], sha256: 'a'.repeat(64) }, resources: { wood: 1 } }
  const profile = { tinySwordsIsland: island }
  assert.equal(portableProfilesHaveSameProgress(profile, structuredClone(profile)), true)
  const changed = structuredClone(profile)
  changed.tinySwordsIsland.chicken_count += 1
  assert.equal(portableProfilesHaveSameProgress(profile, changed), false)
  changed.tinySwordsIsland.chicken_count -= 1
  changed.tinySwordsIsland.resources.wood += 1
  assert.equal(portableProfilesHaveSameProgress(profile, changed), false)
})

function channelProfile(ids = ['a', 'b']) {
  return { config: { locale: 'en', channels: ids.map(id => ({ id, name: `Channel ${id}`, imageUrl: '', catalogId: null })),
    channelShelfOrder: [...ids], channelVideoFormats: {}, removedChannelIds: [], removedDefaultChannelIds: [] },
    videos: { lesson: { favorite: false } } }
}
function addChannel(profile, id, { prepend = false } = {}) {
  profile.config.channels.push({ id, name: `Channel ${id}`, imageUrl: '', catalogId: null })
  profile.config.channelShelfOrder = prepend ? [id, ...profile.config.channelShelfOrder] : [...profile.config.channelShelfOrder, id]
  profile.config.removedChannelIds = profile.config.removedChannelIds.filter(value => value !== id)
}
function removeChannel(profile, id) {
  profile.config.channels = profile.config.channels.filter(channel => channel.id !== id)
  profile.config.removedChannelIds.push(id)
}

test('independent channel additions retain append/prepend intent without a whole-profile conflict', () => {
  const base = channelProfile(), local = clone(base), cloud = clone(base)
  addChannel(local, 'c')
  addChannel(cloud, 'd', { prepend: true })
  const result = combinePortableProfiles(base, local, cloud)
  assert.deepEqual(result.config.channels.map(channel => channel.id), ['a', 'b', 'c', 'd'])
  assert.deepEqual(result.config.channelShelfOrder, ['d', 'a', 'b', 'c'])
  assert.deepEqual(combinePortableProfiles(base, cloud, local), result, 'Device arrival order does not select the shelf arrangement')
  local.config.channelShelfOrder = ['c', 'a', 'b']
  assert.deepEqual(combinePortableProfiles(base, local, cloud).config.channelShelfOrder, ['c', 'd', 'a', 'b'])
})

test('independent channel removals and removal tombstones combine without resurrection', () => {
  const base = channelProfile(['a', 'b', 'c']), local = clone(base), cloud = clone(base)
  removeChannel(local, 'a')
  removeChannel(cloud, 'b')
  local.config.removedDefaultChannelIds = ['a']
  cloud.config.removedDefaultChannelIds = ['b']
  const result = combinePortableProfiles(base, local, cloud)
  assert.deepEqual(result.config.channels.map(channel => channel.id), ['c'])
  assert.deepEqual(result.config.removedChannelIds, ['a', 'b'])
  assert.deepEqual(result.config.removedDefaultChannelIds, ['a', 'b'])
  const continued = clone(result), other = clone(result)
  addChannel(continued, 'd')
  addChannel(other, 'e', { prepend: true })
  const merged = combinePortableProfiles(result, continued, other)
  assert.deepEqual(merged.config.channels.map(channel => channel.id), ['c', 'd', 'e'])
  assert.deepEqual(merged.config.removedChannelIds, ['a', 'b'])
})

test('channel removal versus editing that channel metadata remains a protected choice', () => {
  const base = channelProfile(), local = clone(base), cloud = clone(base)
  removeChannel(local, 'a')
  cloud.config.channels[0].name = 'Edited channel name'
  assert.equal(combinePortableProfiles(base, local, cloud), null)
  assert.equal(combinePortableProfiles(base, cloud, local), null)
})

test('ordinary membership and separate study edits combine while duplicate channel IDs are rejected', () => {
  const base = channelProfile(), local = clone(base), cloud = clone(base)
  removeChannel(local, 'a')
  cloud.videos.lesson.favorite = true
  const result = combinePortableProfiles(base, local, cloud)
  assert.equal(result.videos.lesson.favorite, true)
  assert.deepEqual(result.config.channels.map(channel => channel.id), ['b'])
  assert.deepEqual(result.config.removedChannelIds, ['a'])
  local.config.channels.push(clone(local.config.channels[0]))
  assert.equal(combinePortableProfiles(base, local, cloud), null)
  assert.equal(combinePortableProfiles(local, local, local), null, 'Unchanged duplicate IDs cannot bypass validation')
})

test('conflicting shelf reorder constraints require a choice and independent moves remain compatible', () => {
  const base = channelProfile(['a', 'b', 'c']), local = clone(base), cloud = clone(base)
  local.config.channelShelfOrder = ['b', 'a', 'c']
  cloud.config.channelShelfOrder = ['a', 'c', 'b']
  assert.equal(combinePortableProfiles(base, local, cloud), null)
  cloud.config.channelShelfOrder = ['a', 'b', 'c']
  addChannel(cloud, 'd', { prepend: true })
  assert.deepEqual(combinePortableProfiles(base, local, cloud).config.channelShelfOrder, ['d', 'b', 'a', 'c'])
  const four = channelProfile(['a', 'b', 'c', 'd']), left = clone(four), right = clone(four)
  left.config.channelShelfOrder = ['b', 'a', 'c', 'd']
  right.config.channelShelfOrder = ['a', 'b', 'd', 'c']
  assert.deepEqual(combinePortableProfiles(four, left, right).config.channelShelfOrder, ['b', 'a', 'd', 'c'])
})

test('per-channel format preferences combine distinct IDs and protect competing choices', () => {
  const base = channelProfile(), local = clone(base), cloud = clone(base)
  base.config.channelVideoFormats = { a: 'videos', b: 'videos' }
  local.config.channelVideoFormats = { a: 'shorts', b: 'videos' }
  cloud.config.channelVideoFormats = { a: 'videos', b: 'shorts' }
  assert.deepEqual(combinePortableProfiles(base, local, cloud).config.channelVideoFormats, { a: 'shorts', b: 'shorts' })
  delete base.config.channelVideoFormats.a
  local.config.channelVideoFormats.a = 'videos'
  cloud.config.channelVideoFormats.a = 'shorts'
  assert.equal(combinePortableProfiles(base, local, cloud), null)
})

test('concurrent channel addition and explicit absent-channel removal do not infer away removal intent', () => {
  const base = channelProfile(), local = clone(base), cloud = clone(base)
  addChannel(local, 'new')
  cloud.config.removedChannelIds.push('new')
  assert.equal(combinePortableProfiles(base, local, cloud), null)
  const restored = channelProfile()
  restored.config.removedChannelIds = ['old']
  const left = clone(restored), right = clone(restored)
  addChannel(left, 'old')
  addChannel(right, 'new')
  const result = combinePortableProfiles(restored, left, right)
  assert.deepEqual(result.config.channels.map(channel => channel.id), ['a', 'b', 'new', 'old'])
  assert.deepEqual(result.config.removedChannelIds, [])
})
