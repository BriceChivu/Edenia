import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
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
    fetch: async (known = {}) => {
      const result = await context.fetchChannelVideos(channel, known)
      return JSON.parse(JSON.stringify(result))
    }
  }
}

for (const internalTest of [false, true]) {
  test(`first fetch loads 50 uploads, including internal-test=${internalTest}`, async () => {
    const harness = createHarness(uploads(120), { internalTest })
    const result = await harness.fetch()
    assert.deepEqual(result.videos.map(video => video.id), uploads(50))
    assert.equal(result.filteredShorts, 0)
    assert.equal(harness.requests.length, 1)
    assert.equal(harness.requests[0].searchParams.get('maxResults'), '50')
  })
}

for (const newestCount of [0, 3, 50, 70]) {
  test(`${newestCount} new uploads take priority, with older uploads filling the remaining slots`, async () => {
    const oldIds = uploads(180)
    const newIds = uploads(newestCount, 'new')
    const harness = createHarness([...newIds, ...oldIds])
    const known = asKnownVideos(oldIds.slice(0, 100))
    const original = structuredClone(known)
    const result = await harness.fetch(known)
    assert.deepEqual(result.videos.map(video => video.id), [
      ...newIds, ...oldIds.slice(100)
    ].slice(0, 50))
    assert.deepEqual(known, original, 'Pagination cannot mutate learner progress')
  })
}

test('successive refreshes continue history without losing the unselected tail of a page', async () => {
  const oldIds = uploads(180)
  const harness = createHarness(oldIds)
  let known = {}
  const first = await harness.fetch(known)
  known = asKnownVideos(first.videos.map(video => video.id))
  harness.setUploads([...uploads(3, 'new'), ...oldIds])
  const second = await harness.fetch(known)
  assert.deepEqual(second.videos.map(video => video.id), [...uploads(3, 'new'), ...oldIds.slice(50, 97)])
  Object.assign(known, asKnownVideos(second.videos.map(video => video.id)))
  // Simulate reloading persisted state between hourly refreshes.
  const third = await harness.fetch(JSON.parse(JSON.stringify(known)))
  assert.deepEqual(third.videos.map(video => video.id), oldIds.slice(97, 147))
})

test('more than 50 new uploads leave the overflow ahead of older history on the next refresh', async () => {
  const oldIds = uploads(150)
  const newIds = uploads(70, 'new')
  const known = asKnownVideos(oldIds.slice(0, 50))
  const harness = createHarness([...newIds, ...oldIds])
  const first = await harness.fetch(known)
  Object.assign(known, asKnownVideos(first.videos.map(video => video.id)))
  const second = await harness.fetch(known)
  assert.deepEqual(second.videos.map(video => video.id), [...newIds.slice(50), ...oldIds.slice(50, 80)])
})

test('deleted cached uploads do not shift the next batch past unseen older uploads', async () => {
  const oldIds = uploads(160)
  const harness = createHarness(oldIds.slice(13))
  const result = await harness.fetch(asKnownVideos(oldIds.slice(0, 100)))
  assert.deepEqual(result.videos.map(video => video.id), oldIds.slice(100, 150))
})

test('duplicate and missing IDs do not consume the 50-video allowance', async () => {
  const ids = uploads(80)
  const harness = createHarness([null, '', ...ids.slice(0, 30), ...ids])
  const result = await harness.fetch()
  assert.deepEqual(result.videos.map(video => video.id), ids.slice(0, 50))
})

for (const total of [0, 17, 100, 113]) {
  test(`end of a ${total}-upload channel returns only what is still unseen`, async () => {
    const ids = uploads(total)
    const harness = createHarness(ids)
    const result = await harness.fetch(asKnownVideos(ids.slice(0, 100)))
    assert.deepEqual(result.videos.map(video => video.id), ids.slice(100))
    assert.equal(harness.requests.length, Math.max(1, Math.ceil(total / 50)))
  })
}

test('a failed older-page request leaves the batch retryable without skipping IDs', async () => {
  const ids = uploads(120)
  let fail = true
  const harness = createHarness(ids, { requestHook: url => {
    if (fail && url.searchParams.get('pageToken') === '50') throw new Error('Network failure')
  } })
  const known = asKnownVideos(ids.slice(0, 40))
  await assert.rejects(harness.fetch(known), /Network failure/)
  assert.equal(Object.keys(known).length, 40)
  fail = false
  assert.deepEqual((await harness.fetch(known)).videos.map(video => video.id), ids.slice(40, 90))
})

test('a repeated API page token fails instead of looping indefinitely', async () => {
  const harness = createHarness([])
  harness.context.fetchChannelVideosPage = async () => ({ videos: [], nextPageToken: 'repeat' })
  await assert.rejects(harness.fetch(), /repeated uploads page token/)
})
