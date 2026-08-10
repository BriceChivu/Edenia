import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACTIVE_VIDEOS_PER_CHANNEL,
  compareActiveVideos,
  compareChannelTimelineVideos,
  comparePausedVideos,
  getActiveVideoGroupKey,
  getVideoDisplayChannelKey,
  getVideoPausedTimestamp,
  getVideoPublishedTimestamp,
  getVisibleActiveVideos,
  groupActiveVideosByChannel,
  isHiddenFromVideoGrid,
  isHiddenShortVideo,
  isSavedActiveVideo,
  matchesActiveChannelFilter,
  matchesChannelFilter,
  matchesWatchedChannelFilter,
  normalizeChannelShelfOrder
} from '../../src/features/videos/feed-selectors.js'

test('feed timestamps and comparators preserve invalid, pre-epoch, and tie behavior', () => {
  const older = {
    id: 'older',
    pausedAt: '2026-07-27T00:00:00.000Z',
    publishedAt: '2026-07-28T00:00:00.000Z'
  }
  const newer = {
    id: 'newer',
    pausedAt: '2026-07-28T00:00:00.000Z',
    publishedAt: '2026-07-27T00:00:00.000Z'
  }
  assert.equal(getVideoPausedTimestamp(), 0)
  assert.equal(getVideoPublishedTimestamp({ publishedAt: 'invalid' }), 0)
  assert.equal(getVideoPublishedTimestamp({ publishedAt: '1960-01-01T00:00:00.000Z' }) < 0, true)
  assert.equal(comparePausedVideos(older, newer) > 0, true)
  assert.equal(compareActiveVideos(older, newer) < 0, true)

  const tiedPauseOlderPublication = {
    pausedAt: '2026-07-28T00:00:00.000Z',
    publishedAt: '2026-07-26T00:00:00.000Z'
  }
  assert.equal(comparePausedVideos(tiedPauseOlderPublication, newer) > 0, true)
})

test('timeline ordering preserves resume, watch-later, legacy, and chronological rules', () => {
  const resume = {
    id: 'resume',
    status: 'partial',
    publishedAt: '2026-01-01T00:00:00.000Z'
  }
  const watchedFavoriteAtZero = {
    id: 'favorite',
    status: 'watched',
    favorite: true,
    resumeAtSeconds: 0,
    publishedAt: '2025-01-01T00:00:00.000Z'
  }
  const later = {
    id: 'later',
    status: 'watch-later',
    publishedAt: '2026-07-27T00:00:00.000Z'
  }
  const legacyLater = {
    id: 'legacy-later',
    status: 'unwatched',
    watchLater: true,
    publishedAt: '2026-07-28T00:00:00.000Z'
  }
  const ordinary = {
    id: 'ordinary',
    status: 'unwatched',
    publishedAt: '2026-07-29T00:00:00.000Z'
  }
  assert.deepEqual(
    [ordinary, later, resume, legacyLater, watchedFavoriteAtZero]
      .sort(compareChannelTimelineVideos)
      .map(video => video.id),
    ['resume', 'favorite', 'legacy-later', 'later', 'ordinary']
  )
  assert.deepEqual(
    [ordinary, later, resume].sort(compareActiveVideos).map(video => video.id),
    ['ordinary', 'later', 'resume']
  )
  assert.equal(isSavedActiveVideo(legacyLater), false)
})

test('shelf order and grouping preserve keys, metadata precedence, and source identity', () => {
  assert.deepEqual(
    normalizeChannelShelfOrder([' b ', 'a', 'b', '', 0, null, { key: 1 }]),
    ['b', 'a', '[object Object]']
  )
  assert.deepEqual(normalizeChannelShelfOrder('a'), [])
  assert.equal(getVideoDisplayChannelKey({ channelId: 'id', channelTitle: 'title' }), 'id')
  assert.equal(getVideoDisplayChannelKey({ channelTitle: 'title' }), 'title')
  assert.equal(getVideoDisplayChannelKey({ id: 'video-id' }), 'video:video-id')
  assert.equal(getVideoDisplayChannelKey({ id: 0 }), 'video:unknown')

  const firstA = {
    id: 'a-old',
    channelId: 'a',
    channelTitle: '',
    channelImageUrl: '',
    status: 'unwatched',
    publishedAt: '2026-07-20T00:00:00.000Z'
  }
  const secondA = {
    id: 'a-new',
    channelId: 'a',
    channelTitle: 'Ignored later title',
    channelImageUrl: 'later-image',
    status: 'watch-later',
    publishedAt: '2026-07-28T00:00:00.000Z'
  }
  const channelB = {
    id: 'b',
    channelId: 'b',
    channelTitle: 'Channel B',
    channelImageUrl: 'video-image',
    status: 'unwatched',
    publishedAt: '2026-07-29T00:00:00.000Z'
  }
  const input = [firstA, secondA, channelB]
  const groups = groupActiveVideosByChannel(
    input,
    ['a'],
    [
      { id: 'a', imageUrl: 'old-config-image', catalogId: 'old' },
      { id: 'a', imageUrl: 'config-image', catalogId: 'latest' },
      { id: 'b', imageUrl: 'ignored-config-image', catalogId: 'b-catalog' }
    ],
    false,
    'YouTube fallback'
  )
  assert.deepEqual(groups.map(group => group.key), ['a', 'b'])
  assert.equal(groups[0].title, 'YouTube fallback')
  assert.equal(groups[0].imageUrl, 'config-image')
  assert.equal(groups[0].catalogId, 'latest')
  assert.deepEqual(groups[0].videos, [secondA, firstA])
  assert.equal(groups[1].imageUrl, 'video-image')
  assert.equal(groups[1].catalogId, 'b-catalog')
  assert.deepEqual(input, [firstA, secondA, channelB])

  const chronological = groupActiveVideosByChannel(
    [firstA, secondA],
    [],
    [],
    true,
    'fallback'
  )
  assert.deepEqual(chronological[0].videos, [secondA, firstA])
})

test('channel filters preserve selected and removed-channel overrides', () => {
  const selected = new Set(['selected-id', 'Selected title'])
  const removed = new Set(['removed-id', 'Removed title'])
  assert.equal(matchesChannelFilter({ channelId: 'selected-id' }, selected), true)
  assert.equal(matchesChannelFilter({ channelTitle: 'Selected title' }, selected), true)
  assert.equal(matchesChannelFilter({ channelId: 'other' }, selected), false)

  assert.equal(matchesActiveChannelFilter({
    status: 'partial',
    channelId: 'removed-id'
  }, selected, removed), true)
  assert.equal(matchesActiveChannelFilter({
    status: 'unwatched',
    channelId: 'removed-id'
  }, selected, removed), false)
  assert.equal(matchesWatchedChannelFilter({
    status: 'watched',
    channelTitle: 'Removed title'
  }, selected, removed), true)
})

test('active visibility preserves hidden, Shorts, caps, manual isolation, and input order', () => {
  assert.equal(ACTIVE_VIDEOS_PER_CHANNEL, 5)
  assert.equal(isHiddenShortVideo({ duration: 179 }, false), true)
  assert.equal(isHiddenShortVideo({ duration: 180 }, false), false)
  assert.equal(isHiddenShortVideo({ duration: 179 }, true), false)
  assert.equal(isHiddenFromVideoGrid({ hiddenFromGrid: 'false' }), true)
  assert.equal(isHiddenFromVideoGrid({ hiddenFromGrid: 0 }), false)
  assert.equal(isHiddenFromVideoGrid({
    removedFromFeedAt: '2026-08-03T00:00:00.000Z'
  }), true)
  assert.equal(getActiveVideoGroupKey({
    manuallyAdded: true,
    source: 'manual',
    id: 'manual-id',
    channelId: 'shared'
  }), 'manual:manual-id')

  const regular = Array.from({ length: 6 }, (_, index) => ({
    id: `regular-${index}`,
    channelId: 'shared',
    duration: 180,
    status: 'unwatched',
    publishedAt: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`
  }))
  const manual = Array.from({ length: 6 }, (_, index) => ({
    id: `manual-${index}`,
    channelId: 'manual-shared',
    duration: 180,
    status: 'unwatched',
    manuallyAdded: true,
    source: 'manual',
    publishedAt: `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`
  }))
  const excluded = [
    {
      id: 'watched',
      channelId: 'shared',
      duration: 180,
      status: 'watched',
      publishedAt: '2026-08-01T00:00:00.000Z'
    },
    {
      id: 'hidden',
      channelId: 'shared',
      duration: 180,
      hiddenFromGrid: true,
      publishedAt: '2026-08-02T00:00:00.000Z'
    },
    {
      id: 'short',
      channelId: 'shared',
      duration: 179,
      publishedAt: '2026-08-03T00:00:00.000Z'
    }
  ]
  const input = [...regular, ...manual, ...excluded]
  const originalOrder = input.map(video => video.id)
  const limited = getVisibleActiveVideos(input, false)
  assert.equal(limited.filter(video => video.id.startsWith('regular-')).length, 5)
  assert.equal(limited.filter(video => video.id.startsWith('manual-')).length, 6)
  assert.equal(limited.some(video => video.id === 'regular-0'), false)
  assert.equal(limited.some(video => video.id === 'short'), false)
  assert.deepEqual(input.map(video => video.id), originalOrder)

  const unlimited = getVisibleActiveVideos(input, false, { limitPerChannel: false })
  assert.equal(unlimited.filter(video => video.id.startsWith('regular-')).length, 6)
})
