import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { isYoutubeMetadataFresh } from '../../src/integrations/youtube-metadata-cache.js'
const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const section = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)))
function harness(videos = {}, channels = []) {
  const requests = []
  const context = vm.createContext({
    isYoutubeMetadataFresh,
    loadState: () => ({ videos, config: { channels } }),
    getYoutubeApiKey: () => 'mock',
    YOUTUBE_CHANNEL_ID_RE: /^UC/,
    getBestThumbnail: thumbs => thumbs?.high?.url || '',
    parseDuration: () => 600,
    getVideoAspectRatioFromItem: () => 16 / 9,
    getVideoDetailFromItem: () => ({ duration: 600, aspectRatio: 16 / 9 }),
    SHORT_VIDEO_DETECTION_VERSION: 1,
    t: key => key,
    ytFetch: async input => {
      const url = new URL(input); requests.push(url)
      return { items: url.searchParams.get('id').split(',').map(id => ({ id, snippet: { channelId: 'UCchannel', title: 'Current title', thumbnails: { high: { url: 'https://example.com/image' } } }, contentDetails: {}, player: {} })) }
    }
  })
  vm.runInContext([
    section('async function hydrateYoutubeChannelProfiles(', '\nasync function hydrateStoredManualVideoChannelImages('),
    section('async function fetchVideoDetails(', '\nfunction getChannelRefreshes(')
  ].join('\n'), context)
  return { context, requests }
}
test('adding a fresh known video uses cached video and channel metadata', async () => {
  const video = { id: 'video', title: 'Saved title', duration: 600, metadataFetchedAt: new Date().toISOString() }
  const h = harness({ video })
  const result = await h.context.fetchVideoMetadata('video')
  assert.equal(result.title, 'Saved title')
  assert.equal(h.requests.length, 0)
})
test('adding a new video from a fresh known channel uses only videos.list', async () => {
  const channelTimestamp = new Date(Date.now() - 86400000).toISOString()
  const h = harness({}, [{ id: 'UCchannel', imageUrl: 'cached-image', metadataFetchedAt: channelTimestamp }])
  const result = await h.context.fetchVideoMetadata('new')
  assert.equal(result.channelImageUrl, 'cached-image')
  assert.equal(result.channelMetadataFetchedAt, channelTimestamp)
  assert.deepEqual(h.requests.map(url => url.pathname), ['/youtube/v3/videos'])
})
test('metadata expires at 29 days and missing/future timestamps are not reusable', () => {
  const h = harness()
  for (const value of [undefined, 'invalid', new Date(Date.now() + 86400000).toISOString(), new Date(Date.now() - 29 * 86400000).toISOString()]) {
    assert.equal(h.context.isYoutubeMetadataFresh({ metadataFetchedAt: value }), false)
  }
  assert.equal(h.context.isYoutubeMetadataFresh({ metadataFetchedAt: new Date().toISOString() }), true)
})
test('151 detail lookups use four batched requests, no search or insert budget', async () => {
  const h = harness()
  const result = await h.context.fetchVideoDetails(Array.from({ length: 151 }, (_, i) => String(i)))
  assert.equal(Object.keys(result).length, 151)
  assert.equal(h.requests.length, 4)
  assert.ok(h.requests.every(url => url.pathname === '/youtube/v3/videos'))
})
test('unavailable saved identities shed obsolete display metadata without deleting study records', async () => {
  const h = harness()
  h.context.ytFetch = async () => ({ items: [] })
  const result = await h.context.fetchVideoDetails(['gone'])
  assert.equal(result.gone.title, '')
  assert.equal(result.gone.thumbnail, '')
  assert.ok(result.gone.metadataFetchedAt)
})
test('missing channel metadata clears stale provider names and images', async () => {
  const h = harness()
  h.context.ytFetch = async () => ({ items: [] })
  const channels = [{ id: 'UCgone', name: 'Old name', imageUrl: 'old-image' }]
  await h.context.hydrateYoutubeChannelProfiles(channels)
  assert.equal(channels[0].name, 'UCgone')
  assert.equal(channels[0].imageUrl, '')
  assert.ok(channels[0].metadataFetchedAt)
})
test('resolved channel freshness survives the actual tracked-channel add path', () => {
  const h = harness()
  Object.assign(h.context, { normalizeChannelShelfOrder: value => value || [], restoreChannelVideosToGrid() {}, isDefaultChannelId: () => false, selectedChannelFilters: new Set() })
  vm.runInContext(section('function addTrackedYoutubeChannelToState(', '\nfunction getTrackedChannelAccessView('), h.context)
  const state = { config: { channels: [] } }
  const timestamp = new Date().toISOString()
  h.context.addTrackedYoutubeChannelToState(state, { id: 'UCnew', name: 'New', imageUrl: 'image', metadataFetchedAt: timestamp })
  assert.equal(state.config.channels[0].metadataFetchedAt, timestamp)
})
test('YouTube adapter preserves structured reasons for cursor recovery', async () => {
  const h = harness()
  Object.assign(h.context, { AbortController, window: { setTimeout, clearTimeout }, YOUTUBE_REQUEST_TIMEOUT_MS: 1000, fetch: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Invalid page token.', errors: [{ reason: 'invalidPageToken' }] } }) }) })
  vm.runInContext(section('async function ytFetch(', '\nasync function fetchYoutubeChannelByFilter('), h.context)
  await assert.rejects(h.context.ytFetch('https://example.com'), error => error.reasons[0] === 'invalidPageToken' && error.status === 400)
})
test('an unavailable cached video is revalidated instead of being accepted as a valid addition', async () => {
  const h = harness({ gone: { id: 'gone', metadataFetchedAt: new Date().toISOString(), metadataUnavailable: true } })
  h.context.ytFetch = async () => ({ items: [] })
  await assert.rejects(h.context.fetchVideoMetadata('gone'), /toast.videoNotFound/)
})
