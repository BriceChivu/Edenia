import assert from 'node:assert/strict'
import test from 'node:test'
import { strFromU8, unzipSync } from 'fflate'
import { createPortableLearnerProfileConflictArchive } from '../../src/state/portable-learner-profile-archive.js'
import { preparePortableLearnerProfileEnvelope, verifyPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'
const now = () => new Date('2026-10-09T12:00:00Z')
const profile = title => ({ config: { channels: [] }, anki: {}, videos: {
  v: { id: 'v', title, favorite: true, status: 'partial', resumeAtSeconds: 42,
    watchProgress: [{ seconds: 42, watchedAt: '2026-10-08T12:00:00Z' }] }
}, tinySwordsIsland: { version: 23, resources: { wood: 6 }, tiles: [] } })
test('one archive contains two independently valid canonical sync files with complete alternatives', async () => {
  const profiles = { device: profile('Device lesson 中文'), cloud: profile('Cloud lesson') }
  const original = structuredClone(profiles)
  const archive = await createPortableLearnerProfileConflictArchive(profiles, { dateKey: '2026-10-09', now })
  assert.equal(archive.filename, 'edenia-sync-both-2026-10-09.zip')
  const files = unzipSync(archive.bytes)
  assert.deepEqual(Object.keys(files), ['edenia-sync-this-device-2026-10-09.json', 'edenia-sync-cloud-2026-10-09.json'])
  for (const [index, side] of ['device', 'cloud'].entries()) {
    const envelope = await verifyPortableLearnerProfileEnvelope(strFromU8(Object.values(files)[index]))
    assert.ok(envelope)
    assert.deepEqual(envelope.profile, preparePortableLearnerProfileEnvelope(profiles[side]).profile)
    assert.equal(envelope.exportedAt, now().toISOString())
  }
  assert.deepEqual(profiles, original)
})
test('invalid or oversized alternatives reject the complete archive', async () => {
  for (const options of [{ device: profile('Good'), cloud: {} }, { device: profile('Good'), cloud: profile('Large') }]) {
    await assert.rejects(createPortableLearnerProfileConflictArchive(options, { dateKey: '2026-10-09', now, maxBytes: options.cloud.videos ? 128 : undefined }))
  }
})
test('archive filenames cannot contain a path supplied as the date', async () => {
  await assert.rejects(createPortableLearnerProfileConflictArchive({ device: profile('a'), cloud: profile('b') }, { dateKey: '../profiles' }), TypeError)
})
