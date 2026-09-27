import test from 'node:test'
import assert from 'node:assert/strict'
import { refreshSavedYoutubeMetadata, expireYoutubeMetadata } from '../../src/integrations/youtube-metadata-cache.js'
const now = Date.parse('2026-09-27T00:00:00Z')
function state() { return { config: { channels: [] }, videos: { v: { id: 'v', channelId: 'UCmanual', title: 'Old', duration: 600, channelImageUrl: 'old-image', metadataFetchedAt: '2026-08-01', resumeAtSeconds: 40, watchProgress: [{ seconds: 40 }], favorite: true, watchLater: true, status: 'partial' } } } }
test('manual-only libraries refresh metadata independently of upload checks', async () => {
  const s = state(); const calls = []
  await refreshSavedYoutubeMetadata({ state: s, now, isCurrent: () => true,
    fetchVideos: async ids => { calls.push(ids); return { v: { title: 'New', duration: 600 } } },
    fetchChannels: async channels => channels.forEach(c => Object.assign(c, { imageUrl: 'new-image', metadataFetchedAt: new Date(now).toISOString() })) })
  assert.deepEqual(calls, [['v']]); assert.equal(s.videos.v.title, 'New'); assert.equal(s.videos.v.channelImageUrl, 'new-image')
  assert.equal(s.videos.v.resumeAtSeconds, 40); assert.deepEqual(s.videos.v.watchProgress, [{ seconds: 40 }])
})
test('expired metadata is removed on failure and retries back off without losing study facts', async () => {
  const s = state(); let requests = 0
  const options = { state: s, now, isCurrent: () => true, fetchVideos: async () => { requests++; throw Error('offline') }, fetchChannels: async () => {} }
  await refreshSavedYoutubeMetadata(options); await refreshSavedYoutubeMetadata(options)
  assert.equal(requests, 1); assert.equal(s.videos.v.title, ''); assert.equal(s.videos.v.duration, 0)
  assert.equal(s.videos.v.resumeAtSeconds, 40); assert.equal(s.videos.v.favorite, true)
  assert.equal(s.videos.v.watchLater, true); assert.equal(s.videos.v.status, 'partial')
})
test('metadata completing after profile deactivation cannot merge', async () => {
  const s = state(); s.videos.v.metadataFetchedAt = '2026-09-01'
  let active = true
  await refreshSavedYoutubeMetadata({ state: s, now, isCurrent: () => active, fetchVideos: async () => { active = false; return { v: { title: 'Wrong' } } }, fetchChannels: async () => {} })
  assert.equal(s.videos.v.title, 'Old')
})
test('opening an expired cache clears provider fields while retaining identity and progress', () => {
  const s = state(); assert.equal(expireYoutubeMetadata(s, now), true)
  assert.equal(s.videos.v.id, 'v'); assert.equal(s.videos.v.channelImageUrl, ''); assert.equal(s.videos.v.resumeAtSeconds, 40)
})
test('metadata renewed after expiration can expire again on a later offline opening', () => {
  const s = state()
  expireYoutubeMetadata(s, now)
  Object.assign(s.videos.v, { title: 'Renewed', metadataFetchedAt: new Date(now).toISOString() })
  assert.equal(expireYoutubeMetadata(s, now + 45 * 86400000), true)
  assert.equal(s.videos.v.title, '')
})
