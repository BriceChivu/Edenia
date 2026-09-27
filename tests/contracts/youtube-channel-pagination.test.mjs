import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { checkNewUploads } from '../../src/integrations/youtube-upload-check.js'
import { getYoutubeUploadsPlaylistId } from '../../src/integrations/youtube-parsing.js'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
function sourceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  assert.ok(start >= 0 && end > start)
  return source.slice(start, end)
}

const channel = { id: 'UCtest-channel' }
const uploads = (count, prefix = 'old') => Array.from({ length: count }, (_, i) => `${prefix}-${i}`)
const asKnownVideos = ids => Object.fromEntries(ids.map((id, index) => [id, {
  id, channelId: channel.id,
  status: index % 2 ? 'watched' : 'unwatched',
  removedFromFeedAt: index % 3 ? null : '2026-09-24T00:00:00.000Z'
}]))

function createHarness(initialIds, { internalTest = false, requestHook = () => {} } = {}) {
  let ids = initialIds
  const requests = []
  const context = vm.createContext({
    checkNewUploads,
    IS_INTERNAL_TEST: internalTest,
    uploadsId: getYoutubeUploadsPlaylistId,
    getYoutubeApiKey: () => 'test-key',
    ytFetch: async input => {
      const url = new URL(input)
      requests.push(url)
      requestHook(url)
      assert.equal(url.pathname, '/youtube/v3/playlistItems')
      assert.equal(url.searchParams.get('playlistId'), 'UUtest-channel')
      const offset = Number(url.searchParams.get('pageToken') || 0)
      const size = Number(url.searchParams.get('maxResults'))
      return {
        items: ids.slice(offset, offset + size).map(id => ({ snippet: {
          resourceId: { videoId: id }, title: id, channelTitle: 'Channel',
          thumbnails: {}, publishedAt: '2026-09-24T00:00:00.000Z'
        } })),
        nextPageToken: offset + size < ids.length ? String(offset + size) : null
      }
    }
  })
  vm.runInContext([
    source.match(/^const FETCH_PAGE_SIZE = .+$/m)[0],
    sourceBetween('async function fetchChannelVideosPage(', '\nasync function hydrateYoutubeChannelProfiles('),
    sourceBetween('async function fetchChannelVideos(', '\nasync function fetchVideoDetails(')
  ].join('\n'), context)
  return {
    context,
    requests,
    setUploads: next => { ids = next },
    fetch: async (known = {}, refresh = null) => {
      const result = await context.fetchChannelVideos(channel, known, refresh)
      return JSON.parse(JSON.stringify({
        ...result,
        newVideos: result.videos.filter(video => !known[video.id])
      }))
    }
  }
}

for (const internalTest of [false, true]) {
  test(`first fetch loads 50 uploads, including internal-test=${internalTest}`, async () => {
    const harness = createHarness(uploads(120), { internalTest })
    const result = await harness.fetch()
    assert.deepEqual(result.newVideos.map(video => video.id), uploads(50))
    assert.equal(result.filteredShorts, 0)
    assert.equal(harness.requests.length, 1)
    assert.equal(harness.requests[0].searchParams.get('maxResults'), '50')
  })
}

for (const newestCount of [0, 3, 50, 70]) {
  test(`${newestCount} new uploads stop at established coverage`, async () => {
    const oldIds = uploads(7000)
    const newIds = uploads(newestCount, 'new')
    const harness = createHarness([...newIds, ...oldIds])
    const known = asKnownVideos(oldIds)
    const original = structuredClone(known)
    const result = await harness.fetch(known, { lastFetchedAt: '2026-09-24T00:00:00Z' })
    assert.deepEqual(result.newVideos.map(video => video.id), newIds)
    assert.deepEqual(known, original)
    assert.equal(harness.requests.length, Math.floor(newestCount / 50) + 1)
  })
}

test('manual known IDs do not establish legacy coverage', async () => {
  const all = uploads(180)
  const known = asKnownVideos(all.slice(0, 1))
  known[all[0]].manuallyAdded = true
  const harness = createHarness(all)
  const result = await harness.fetch(known, { lastFetchedAt: '2026-09-24T00:00:00Z' })
  assert.equal(result.videos.length, 50)
  assert.equal(harness.requests.length, 1)
})
