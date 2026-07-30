import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getVideoStatus,
  getVideoUrl,
  hasVideoResumePriority,
  hasWatchedConfirmationUnlock,
  isFavoriteVideo,
  isVideoSetAside,
  isVideoWatchLater,
  normalizeResumeAtSeconds,
  normalizeVideoStatus,
  VIDEO_STATUSES
} from '../../src/domain/video-state.js'

test('video status primitives preserve exact statuses and strict flags', () => {
  assert.deepEqual(VIDEO_STATUSES, ['watch-later', 'unwatched', 'partial', 'watched'])
  VIDEO_STATUSES.forEach(status => assert.equal(normalizeVideoStatus(status), status))
  for (const status of [null, undefined, '', 'favorite', 'Watched', 0]) {
    assert.equal(normalizeVideoStatus(status), 'unwatched')
  }
  assert.equal(getVideoStatus(), 'unwatched')
  assert.equal(getVideoStatus({ status: 'watched' }), 'watched')
  assert.equal(isFavoriteVideo({ favorite: true }), true)
  assert.equal(isFavoriteVideo({ favorite: 1 }), false)
  assert.equal(isVideoSetAside({ status: 'watched', setAside: true }), true)
  assert.equal(isVideoSetAside({ status: 'partial', setAside: true }), false)
  assert.equal(isVideoSetAside({ status: 'watched', setAside: 1 }), false)
  assert.equal(isVideoWatchLater({ status: 'watch-later' }), true)
  assert.equal(isVideoWatchLater({ status: 'watched', watchLater: true }), true)
  assert.equal(isVideoWatchLater({ status: 'watched', watchLater: 1 }), false)
})

test('resume normalization preserves coercion, flooring, and duration edge behavior', () => {
  for (const value of [null, undefined, '', '  ', -1, Infinity, NaN, 'invalid']) {
    assert.equal(normalizeResumeAtSeconds(value), null)
  }
  assert.equal(normalizeResumeAtSeconds(0), 0)
  assert.equal(normalizeResumeAtSeconds('9.9'), 9)
  assert.equal(normalizeResumeAtSeconds(100, 100), 99)
  assert.equal(normalizeResumeAtSeconds(100, '100'), 100)
  assert.equal(normalizeResumeAtSeconds(1, 0.5), 0)
  assert.equal(normalizeResumeAtSeconds(4.9, 10), 4)
  assert.throws(() => normalizeResumeAtSeconds(Symbol('seconds')), TypeError)
})

test('resume priority preserves status-specific favorite and timestamp rules', () => {
  assert.equal(hasVideoResumePriority({ status: 'partial' }), true)
  assert.equal(hasVideoResumePriority({
    status: 'watched',
    favorite: true,
    resumeAtSeconds: 0
  }), true)
  assert.equal(hasVideoResumePriority({
    status: 'watched',
    favorite: false,
    resumeAtSeconds: 5
  }), false)
  assert.equal(hasVideoResumePriority({
    status: 'watch-later',
    resumeAtSeconds: 0
  }), false)
  assert.equal(hasVideoResumePriority({
    status: 'watch-later',
    resumeAtSeconds: 1
  }), true)
  assert.equal(hasVideoResumePriority({
    status: 'unwatched',
    favorite: true,
    resumeAtSeconds: 20
  }), false)
})

test('video URLs preserve identifier encoding and eligible resume query strings', () => {
  assert.equal(getVideoUrl(), 'https://youtube.com/watch?v=')
  assert.equal(
    getVideoUrl({ id: 'a b&c', status: 'unwatched' }),
    'https://youtube.com/watch?v=a%20b%26c'
  )
  assert.equal(
    getVideoUrl({ id: 0, status: 'partial', resumeAtSeconds: 3.9 }),
    'https://youtube.com/watch?v=0&t=3s'
  )
  assert.equal(
    getVideoUrl({ id: 'watched', status: 'watched', favorite: true, resumeAtSeconds: 0 }),
    'https://youtube.com/watch?v=watched&t=0s'
  )
  assert.equal(
    getVideoUrl({ id: 'later', status: 'watch-later', resumeAtSeconds: 0 }),
    'https://youtube.com/watch?v=later'
  )
})

test('watched confirmation unlocks preserve permissive timestamp validation', () => {
  assert.equal(hasWatchedConfirmationUnlock(), false)
  assert.equal(hasWatchedConfirmationUnlock({
    watchedConfirmationUnlockedAt: 'invalid'
  }), false)
  assert.equal(hasWatchedConfirmationUnlock({
    watchedConfirmationUnlockedAt: 0
  }), false)
  assert.equal(hasWatchedConfirmationUnlock({
    watchedConfirmationUnlockedAt: 1
  }), true)
  assert.equal(hasWatchedConfirmationUnlock({
    watchedConfirmationUnlockedAt: '2026-07-28T12:34:56.000Z'
  }), true)
})
