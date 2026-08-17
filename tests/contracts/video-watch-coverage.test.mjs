import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addVideoWatchCoverageRange,
  getVideoWatchCoverageSeconds,
  normalizeVideoWatchCoverage
} from '../../src/domain/video-watch-coverage.js'
import {
  normalizeVideoWatchProgress
} from '../../src/domain/video-watch-progress.js'

test('watch-progress entries preserve validation, flooring, clipping, and order', () => {
  const input = [
    { watchedAt: '2026-07-28T06:00:00.000Z', seconds: '12.9' },
    { watchedAt: 'invalid', seconds: 20 },
    null,
    { watchedAt: '2026-07-28T05:00:00.000Z', seconds: 200 },
    { watchedAt: '2026-07-28T07:00:00.000Z', seconds: -1 }
  ]

  assert.deepEqual(normalizeVideoWatchProgress(input, 100.9), [
    { watchedAt: '2026-07-28T05:00:00.000Z', seconds: 100 },
    { watchedAt: '2026-07-28T06:00:00.000Z', seconds: 12 }
  ])
  assert.equal(input[0].seconds, '12.9')
  assert.deepEqual(normalizeVideoWatchProgress(null, 100), [])
  assert.deepEqual(
    normalizeVideoWatchProgress([
      { watchedAt: '2026-07-28T05:00:00.000Z', seconds: 200 }
    ]),
    [{ watchedAt: '2026-07-28T05:00:00.000Z', seconds: 200 }]
  )
})

test('watch-progress normalization preserves canonical portable fact identity', () => {
  assert.deepEqual(normalizeVideoWatchProgress([{
    id: 'video:lesson:2026-07-28T05:00:00.000Z:60:1',
    studyDay: '2026-07-27',
    watchedAt: '2026-07-28T05:00:00.000Z',
    seconds: 60,
    deviceId: 'must-not-survive'
  }, {
    id: '',
    studyDay: '2026-02-30',
    watchedAt: '2026-07-28T06:00:00.000Z',
    seconds: 30
  }]), [{
    id: 'video:lesson:2026-07-28T05:00:00.000Z:60:1',
    studyDay: '2026-07-27',
    watchedAt: '2026-07-28T05:00:00.000Z',
    seconds: 60
  }, {
    watchedAt: '2026-07-28T06:00:00.000Z',
    seconds: 30
  }])
})

test('coverage normalization clips, rounds, sorts, and removes invalid ranges', () => {
  const input = [
    { start: 8.0004, end: 12.5555 },
    { start: -5, end: 2 },
    { start: 15, end: 20 },
    { start: 4, end: 4 },
    { start: 'invalid', end: 8 },
    null
  ]

  assert.deepEqual(normalizeVideoWatchCoverage(input, 16), [
    { start: 0, end: 2 },
    { start: 8, end: 12.556 },
    { start: 15, end: 16 }
  ])
  assert.deepEqual(input[0], { start: 8.0004, end: 12.5555 })
  assert.deepEqual(normalizeVideoWatchCoverage('invalid'), [])
})

test('coverage normalization merges overlap, touching, and one-millisecond gaps', () => {
  assert.deepEqual(normalizeVideoWatchCoverage([
    { start: 5, end: 10 },
    { start: 0, end: 6 },
    { start: 10, end: 12 },
    { start: 12.001, end: 13 },
    { start: 13.002, end: 14 }
  ]), [
    { start: 0, end: 13 },
    { start: 13.002, end: 14 }
  ])
})

test('coverage totals and additions count unique clipped seconds', () => {
  const ranges = [
    { start: 0, end: 5 },
    { start: 3, end: 9 }
  ]

  assert.equal(getVideoWatchCoverageSeconds(ranges), 9)
  assert.equal(getVideoWatchCoverageSeconds(ranges, 7), 7)
  assert.deepEqual(addVideoWatchCoverageRange(ranges, 8, 12, 10), [
    { start: 0, end: 10 }
  ])
  assert.deepEqual(ranges, [
    { start: 0, end: 5 },
    { start: 3, end: 9 }
  ])
})

test('coverage preserves legacy clip-before-round and validate-before-round order', () => {
  assert.deepEqual(
    normalizeVideoWatchCoverage([{ start: 0, end: 4 }], 3.3336),
    [{ start: 0, end: 3.334 }]
  )
  assert.deepEqual(
    normalizeVideoWatchCoverage([{ start: 1.0001, end: 1.0004 }]),
    [{ start: 1, end: 1 }]
  )
})

test('coverage accepts numeric duration strings and leaves frozen inputs untouched', () => {
  const first = Object.freeze({ start: 0, end: 2 })
  const second = Object.freeze({ start: 4, end: 12 })
  const ranges = Object.freeze([first, second])

  assert.deepEqual(normalizeVideoWatchCoverage(ranges, '10'), [
    { start: 0, end: 2 },
    { start: 4, end: 10 }
  ])
  assert.deepEqual(
    addVideoWatchCoverageRange(ranges, 2.001, 4, '10'),
    [{ start: 0, end: 10 }]
  )
})
