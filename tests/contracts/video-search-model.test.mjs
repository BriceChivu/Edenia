import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getVideoSearchMatches,
  normalizeVideoSearchText,
  VIDEO_SEARCH_RESULT_LIMIT
} from '../../src/features/videos/search-model.js'

function stateWith(videos) {
  return {
    videos: Object.fromEntries(videos.map(video => [video.id, video]))
  }
}

test('video search normalization preserves string coercion, case folding, and whitespace', () => {
  assert.equal(VIDEO_SEARCH_RESULT_LIMIT, 8)
  assert.equal(normalizeVideoSearchText(null), '')
  assert.equal(normalizeVideoSearchText(undefined), '')
  assert.equal(normalizeVideoSearchText('  Learn\\n\\tJAPANESE  '), 'learn\\n\\tjapanese')
  assert.equal(normalizeVideoSearchText('  Learn\n\tJAPANESE  '), 'learn japanese')
  assert.equal(normalizeVideoSearchText(42), '42')
  assert.equal(normalizeVideoSearchText(Symbol('Study')), 'symbol(study)')
})

test('video search matches phrases across normalized title and channel text', () => {
  const exact = { id: 'exact', title: 'Learn Japanese', channelTitle: 'Kana Lab' }
  const split = { id: 'split', title: 'Learn', channelTitle: 'Japanese Daily' }
  const missing = { id: 'missing', title: 'Learn French', channelTitle: 'Paris Lab' }
  const state = stateWith([exact, split, missing])

  assert.deepEqual(getVideoSearchMatches('', state), [])
  assert.deepEqual(getVideoSearchMatches('learn japanese', state), [exact, split])
  assert.deepEqual(getVideoSearchMatches('JAPANESE   learn', state), [exact, split])
  assert.deepEqual(getVideoSearchMatches('korean', state), [])
  assert.deepEqual(getVideoSearchMatches('learn', null), [])
})

test('video search ranking preserves title, channel, and status priorities', () => {
  const exactTitle = {
    id: 'exact-title',
    title: 'Focus',
    channelTitle: 'Other',
    status: 'unwatched',
    publishedAt: '2026-01-01T00:00:00.000Z'
  }
  const exactChannel = {
    id: 'exact-channel',
    title: 'A focus exercise',
    channelTitle: 'Focus',
    status: 'partial',
    publishedAt: '2026-07-28T00:00:00.000Z'
  }
  const startsTitle = {
    id: 'starts-title',
    title: 'Focus session',
    channelTitle: 'Other',
    status: 'watched',
    publishedAt: '2026-07-28T00:00:00.000Z'
  }
  assert.deepEqual(
    getVideoSearchMatches('focus', stateWith([exactChannel, startsTitle, exactTitle])),
    [exactChannel, exactTitle, startsTitle]
  )
})

test('video search ties use the newest watched or published timestamp', () => {
  const watchedNewest = {
    id: 'watched-newest',
    title: 'Same',
    channelTitle: 'Channel',
    watchedAt: '2026-07-28T00:00:00.000Z',
    publishedAt: '2020-01-01T00:00:00.000Z'
  }
  const publishedNewest = {
    id: 'published-newest',
    title: 'Same',
    channelTitle: 'Channel',
    watchedAt: 'invalid',
    publishedAt: '2026-07-27T00:00:00.000Z'
  }
  const invalidDates = {
    id: 'invalid',
    title: 'Same',
    channelTitle: 'Channel',
    watchedAt: 'invalid',
    publishedAt: 'invalid'
  }
  assert.deepEqual(
    getVideoSearchMatches('same', stateWith([invalidDates, publishedNewest, watchedNewest])),
    [watchedNewest, publishedNewest, invalidDates]
  )
})

test('video search caps at eight and returns original video objects', () => {
  const videos = Array.from({ length: 10 }, (_, index) => ({
    id: `video-${index}`,
    title: 'Shared query',
    channelTitle: 'Channel',
    publishedAt: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`
  }))
  const results = getVideoSearchMatches('shared', stateWith(videos))
  assert.equal(results.length, 8)
  assert.equal(results[0], videos[9])
  assert.equal(results.at(-1), videos[2])
})
