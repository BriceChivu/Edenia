import assert from 'node:assert/strict'
import test from 'node:test'
import { performance } from 'node:perf_hooks'
import { normalizePortableLearnerProfile } from '../../src/state/portable-learner-profile.js'
import {
  createProfileRecordBatch,
  dirtyUnitsFromBatch,
  isProfileRecordBatch,
  mergeDirtyUnits,
  PROFILE_RECORD_BATCH_MAX_BYTES,
  recordBatchPaths,
  recordRequestDigest
} from '../../src/domain/learner-profile-records.js'

const at = '2026-10-26T10:00:00.000Z'
const later = '2026-10-26T10:01:00.000Z'
const day = '2026-10-26'
const clone = value => structuredClone(value)
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength

function fixture(count = 2) {
  return normalizePortableLearnerProfile({
    config: { locale: 'en', channels: [{ id: 'channel', name: 'Example channel', imageUrl: 'https://example.com/channel.png' }] },
    videos: Object.fromEntries(Array.from({ length: count }, (_, index) => [`video-${index}`, {
      id: `video-${index}`, title: `Lesson ${index} ${'metadata '.repeat(20)}`,
      duration: 3600, channelId: 'channel', channelTitle: 'Example channel',
      channelImageUrl: 'https://example.com/channel.png', thumbnail: `https://example.com/video-${index}.png`,
      publishedAt: at, source: 'channel', status: 'partial', favorite: false,
      resumeAtSeconds: 15, pausedAt: at,
      watchProgress: [{ watchedAt: at, studyDay: day, seconds: 15, experienceSeconds: 15 }]
    }])),
    anki: { [day]: { created: 1, reviewed: 10, observedAt: at, experienceReviews: 10, experienceWatermark: 10 } },
    tinySwordsIsland: { version: 38, chicken_count: 1, sheep_count: 0, resources: { wood: 0 }, buildings: [] },
    townEconomy: { version: 1, mode: 'starter', rewards: {}, purchases: {} },
    legacyCityProgress: { maxLevelIndex: 0 },
    cityProgress: { maxLevelIndex: 0, experienceVersion: 1 },
    activityLog: [{ id: 'device-only', createdAt: at, type: 'info', message: 'Local diagnostic' }]
  })
}

function editVideo(profile) {
  profile.videos['video-0'].resumeAtSeconds = 60
  profile.videos['video-0'].pausedAt = later
  profile.videos['video-0'].watchProgress[0].seconds = 60
}

function videoBatch() {
  const base = fixture(), profile = clone(base)
  editVideo(profile)
  return createProfileRecordBatch(profile, base, { videos: ['video-0'] }, later)
}

test('one video checkpoint sends only personal fields and leaves a large unchanged library out', t => {
  const base = fixture(500), profile = clone(base)
  editVideo(profile)
  const started = performance.now()
  const batch = createProfileRecordBatch(profile, base, { videos: ['video-0'] }, later)
  const elapsed = performance.now() - started
  assert.equal(isProfileRecordBatch(batch), true)
  assert.equal(batch.units.length, 1)
  const [unit] = batch.units
  assert.equal(unit.kind, 'video')
  assert.equal(unit.key, 'video-0')
  assert.equal(unit.after.resumeAtSeconds, 60)
  assert.equal(unit.after.watchProgress[0].seconds, 60)
  assert.equal(Object.keys(unit.after).length, 13)
  assert.equal(Object.hasOwn(unit, 'metadata'), false)
  assert.equal(Object.hasOwn(unit.after, 'title'), false)
  assert.equal(Object.hasOwn(batch, 'activityLog'), false)
  assert.ok(bytes(batch) < bytes(profile) / 100)
  t.diagnostic(`500-video profile=${bytes(profile)} bytes; batch=${bytes(batch)} bytes; preparation=${elapsed.toFixed(3)} ms (diagnostic only)`)
})

test('new and changed video metadata is complete, while unchanged metadata stays cached', () => {
  const base = fixture(), profile = clone(base)
  profile.videos['video-0'].title = 'Changed title'
  profile.videos['new-video'] = { ...clone(profile.videos['video-1']), id: 'new-video' }
  const batch = createProfileRecordBatch(profile, base, { videos: ['video-0', 'new-video'] }, later)
  assert.equal(isProfileRecordBatch(batch), true)
  assert.equal(batch.units.length, 2)
  for (const unit of batch.units) {
    assert.equal(Object.keys(unit.metadata).length, 11)
    assert.equal(unit.metadata.id, unit.key)
    assert.equal(Object.keys(unit.after).length, 13)
  }
  assert.equal(batch.units.find(unit => unit.key === 'video-0').metadata.title, 'Changed title')
  delete profile.videos['new-video'].title
  assert.equal(createProfileRecordBatch(profile, base, { videos: ['new-video'] }, later), null)
})

test('deletions are explicit and cover only the selected records', () => {
  const base = fixture(), profile = clone(base)
  delete profile.videos['video-0']
  delete profile.anki[day]
  delete profile.tinySwordsIsland
  delete profile.legacyCityProgress
  const batch = createProfileRecordBatch(profile, base, { videos: ['video-0'], anki: [day], island: true }, later)
  assert.deepEqual(batch.units, [
    { kind: 'video', key: 'video-0', afterPresent: false },
    { kind: 'anki', key: day, afterPresent: false },
    { kind: 'island', key: 'tinySwordsIsland', afterPresent: false },
    { kind: 'progression', key: 'legacyCityProgress', afterPresent: false }
  ])
  assert.deepEqual(dirtyUnitsFromBatch(batch), { videos: ['video-0'], anki: [day], island: true })
  assert.deepEqual(recordBatchPaths(batch), [['videos', 'video-0'], ['anki', day], ['tinySwordsIsland'], ['legacyCityProgress']])
  assert.equal(Object.hasOwn(profile.videos, 'video-1'), true)
})

test('study, island and coupled progression/economy travel in one batch', () => {
  const base = fixture(), profile = clone(base)
  editVideo(profile)
  profile.anki[day].reviewed += 1
  profile.tinySwordsIsland.resources.wood += 1
  profile.cityProgress.maxLevelIndex = 1
  profile.legacyCityProgress.maxLevelIndex = 1
  profile.townEconomy.rewards['video:video-0:observation'] = { baseline: 0, seconds: 60 }
  const batch = createProfileRecordBatch(profile, base, { videos: ['video-0'], anki: [day], island: true }, later)
  assert.equal(isProfileRecordBatch(batch), true)
  assert.deepEqual(batch.units.map(unit => [unit.kind, unit.key]), [
    ['video', 'video-0'], ['anki', day], ['island', 'tinySwordsIsland'],
    ['progression', 'cityProgress'], ['progression', 'legacyCityProgress'], ['progression', 'townEconomy']
  ])
  assert.equal(batch.units.at(-1).after.rewards['video:video-0:observation'].seconds, 60)
})

test('activity-only edits produce no units and unsupported edits retain full-envelope fallback', () => {
  const base = fixture(), profile = clone(base)
  profile.activityLog.push({ id: 'local', createdAt: later, message: 'Diagnostic' })
  assert.deepEqual(createProfileRecordBatch(profile, base, {}, later), { version: 1, exportedAt: later, units: [] })
  assert.equal(createProfileRecordBatch(profile, base, null, later), null)
  profile.config.locale = 'fr'
  assert.equal(createProfileRecordBatch(profile, base, { videos: ['video-0'] }, later), null)
  profile.config = clone(base.config)
  profile.unsupported = true
  assert.equal(createProfileRecordBatch(profile, base, {}, later), null)
})

test('dirty hints coalesce known domains, retain unknown-work fallback and roundtrip batches', () => {
  assert.deepEqual(mergeDirtyUnits(), { videos: [], anki: [], island: false })
  assert.deepEqual(mergeDirtyUnits(undefined, { videos: ['b', 'a', 'a'] }, { anki: [day], island: true }), {
    videos: ['a', 'b'], anki: [day], island: true
  })
  assert.equal(mergeDirtyUnits({ videos: ['a'] }, null, { island: true }), null)
  assert.equal(mergeDirtyUnits({ settings: ['config'] }), null)
  assert.equal(mergeDirtyUnits({ videos: ['__proto__'] }), null)
  assert.equal(mergeDirtyUnits({ anki: ['2026-02-30'] }), null)
  assert.equal(mergeDirtyUnits({ island: 1 }), null)
  assert.equal(mergeDirtyUnits({ videos: Array(1) }), null)
  assert.equal(dirtyUnitsFromBatch(undefined), undefined)
  assert.equal(dirtyUnitsFromBatch(null), undefined)
  assert.equal(dirtyUnitsFromBatch({ version: 1 }), null)
  assert.deepEqual(dirtyUnitsFromBatch(videoBatch()), { videos: ['video-0'], anki: [], island: false })
})

test('batch validation fences unknown keys, duplicate paths and malformed deletion intent', () => {
  const good = videoBatch()
  const rejected = [
    { ...clone(good), unknown: true },
    { ...clone(good), version: 2 },
    { ...clone(good), exportedAt: 'yesterday' },
    { ...clone(good), units: [...clone(good.units), ...clone(good.units)] }
  ]
  for (const unit of [
    { ...clone(good.units[0]), afterPresent: 1 },
    { ...clone(good.units[0]), unknown: true },
    { ...clone(good.units[0]), metadata: { title: 'Incomplete' } },
    { kind: 'video', key: 'video-0', afterPresent: false, after: {} },
    { kind: 'island', key: 'wrong', afterPresent: true, after: {} },
    { kind: 'anki', key: '2026-02-30', afterPresent: true, after: {} },
    { kind: 'settings', key: 'unknown', afterPresent: true, after: {} },
    { kind: 'settings', key: 'config', afterPresent: false },
    { kind: 'progression', key: 'cityProgress', afterPresent: false },
    { kind: 'activityLog', key: 'activityLog', afterPresent: true, after: {} }
  ]) rejected.push({ ...clone(good), units: [unit] })
  for (const batch of rejected) assert.equal(isProfileRecordBatch(batch), false)
  assert.equal(recordBatchPaths(rejected[0]), null)
})

test('prototype keys and oversized units cannot enter a durable typed request', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const batch = videoBatch()
    batch.units[0].after.watchProgress = [JSON.parse(`{"${key}":{"polluted":true}}`)]
    assert.equal(isProfileRecordBatch(batch), false)
    batch.units = [{ kind: 'video', key, afterPresent: false }]
    assert.equal(isProfileRecordBatch(batch), false)
  }
  const huge = videoBatch()
  huge.units[0].after.watchProgress = [{ value: 'x'.repeat(PROFILE_RECORD_BATCH_MAX_BYTES) }]
  assert.equal(isProfileRecordBatch(huge), false)
  const bad = videoBatch()
  bad.units[0].after.resumeAtSeconds = NaN
  assert.equal(isProfileRecordBatch(bad), false)
  const base = fixture(), profile = clone(base)
  profile.videos['video-0'].watchProgress = [JSON.parse('{"__proto__":{"polluted":true}}')]
  assert.equal(createProfileRecordBatch(profile, base, { videos: ['video-0'] }, later), null)
  assert.equal({}.polluted, undefined)
})

test('batch captures immutable bytes and request digest binds identity plus content', () => {
  const base = fixture(), profile = clone(base)
  editVideo(profile)
  const batch = createProfileRecordBatch(profile, base, { videos: ['video-0'] }, later)
  const operation = { operationId: 'operation', ownerId: 'owner', profileId: 'profile', generation: 1, baseRevision: 1, recordBatch: batch }
  const digest = recordRequestDigest(operation)
  assert.match(digest, /^[A-Za-z0-9_-]{43}$/)
  profile.videos['video-0'].watchProgress[0].seconds += 100
  assert.equal(batch.units[0].after.watchProgress[0].seconds, 60)
  assert.equal(recordRequestDigest({ retryCount: 3, ...operation }), digest)
  assert.equal(recordRequestDigest({ ...operation, recordBatch: JSON.parse(JSON.stringify(batch)) }), digest)
  for (const key of ['ownerId', 'profileId', 'operationId', 'generation', 'baseRevision']) {
    const changed = { ...operation, [key]: typeof operation[key] === 'number' ? 2 : 'changed' }
    assert.notEqual(recordRequestDigest(changed), digest)
  }
  const changed = clone(operation)
  changed.recordBatch.units[0].after.resumeAtSeconds += 1
  assert.notEqual(recordRequestDigest(changed), digest)
  assert.throws(() => recordRequestDigest({ ...operation, recordBatch: null }), /Invalid profile record operation/)
})

test('record selection does not read unrelated video records', () => {
  const base = fixture(), profile = clone(base)
  editVideo(profile)
  for (const value of [base, profile]) {
    Object.defineProperty(value.videos, 'unrelated', { enumerable: true, get() { throw new Error('Unrelated record was scanned') } })
  }
  assert.equal(createProfileRecordBatch(profile, base, { videos: ['video-0'] }, later).units.length, 1)
})

test('known settings paths validate for recovery routing but select full-envelope creation', () => {
  const batch = { version: 1, exportedAt: later, units: [{ kind: 'settings', key: 'config', afterPresent: true, after: { locale: 'en' } }] }
  assert.equal(isProfileRecordBatch(batch), true)
  assert.deepEqual(recordBatchPaths(batch), [['config']])
  assert.equal(dirtyUnitsFromBatch(batch), null)
})
