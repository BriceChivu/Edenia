import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getEdeniaProfileCreatedAt,
  hasRecordedAnkiDataSinceProfileCreation,
  isValidEdeniaDateKey,
  normalizeNoAnkiFrequentUserPromptState,
  recordNoAnkiFrequentUserWatchedDate
} from '../../src/state/anki-prompt-state.js'

const profileCreatedAt = '2026-07-28T00:00:00.000Z'

test('profile creation uses onboarding before learner-profile fallback', () => {
  assert.equal(getEdeniaProfileCreatedAt(null), null)
  assert.equal(getEdeniaProfileCreatedAt({
    onboarding: { setupCompletedAt: profileCreatedAt },
    learnerProfile: { createdAt: '2026-07-27T00:00:00.000Z' }
  }), profileCreatedAt)
  assert.equal(getEdeniaProfileCreatedAt({
    onboarding: { setupCompletedAt: 'invalid' },
    learnerProfile: { createdAt: '2026-07-27T00:00:00.000Z' }
  }), '2026-07-27T00:00:00.000Z')
})

test('Edenia date keys require exact, real local calendar dates', () => {
  assert.equal(isValidEdeniaDateKey('2026-07-28'), true)
  assert.equal(isValidEdeniaDateKey('2028-02-29'), true)
  assert.equal(isValidEdeniaDateKey('2027-02-29'), false)
  assert.equal(isValidEdeniaDateKey('2026-7-28'), false)
  assert.equal(isValidEdeniaDateKey('2026-07-28T00:00:00'), false)
  assert.equal(isValidEdeniaDateKey(null), false)
})

test('Anki prompt normalization merges stored, video, and activity dates after signup', () => {
  const state = {
    onboarding: { setupCompletedAt: profileCreatedAt },
    noAnkiFrequentUserPrompt: {
      watchedVideoDateKeys: [
        '2026-07-27',
        '2026-07-29',
        'invalid',
        '2026-07-29'
      ],
      response: 'yes',
      respondedAt: '2026-08-01T00:00:00.000Z'
    },
    videos: {
      before: { watchedAt: '2026-07-27T00:00:00.000Z' },
      after: { watchedAt: '2026-07-30T00:00:00.000Z' }
    },
    activityLog: [
      {
        type: 'video-status',
        createdAt: '2026-07-31T00:00:00.000Z',
        meta: { status: 'watched' }
      },
      {
        type: 'video-status',
        createdAt: '2026-08-01T00:00:00.000Z',
        meta: { status: 'paused' }
      }
    ]
  }
  assert.equal(normalizeNoAnkiFrequentUserPromptState(state), true)
  assert.deepEqual(state.noAnkiFrequentUserPrompt, {
    watchedVideoDateKeys: [
      '2026-07-29',
      '2026-07-30',
      '2026-07-31'
    ],
    response: 'yes',
    respondedAt: '2026-08-01T00:00:00.000Z'
  })
  assert.equal(normalizeNoAnkiFrequentUserPromptState(state), false)
})

test('Anki prompt response and timestamp remain coupled', () => {
  const state = {
    noAnkiFrequentUserPrompt: {
      response: 'later',
      respondedAt: '2026-08-01T00:00:00.000Z'
    }
  }
  normalizeNoAnkiFrequentUserPromptState(state)
  assert.deepEqual(state.noAnkiFrequentUserPrompt, {
    watchedVideoDateKeys: [],
    response: null,
    respondedAt: null
  })

  state.noAnkiFrequentUserPrompt = {
    response: 'not-interested',
    respondedAt: 'invalid'
  }
  normalizeNoAnkiFrequentUserPromptState(state)
  assert.equal(state.noAnkiFrequentUserPrompt.response, 'not-interested')
  assert.equal(state.noAnkiFrequentUserPrompt.respondedAt, null)
})

test('recording watched dates preserves signup boundary, dedupe, and sorting', () => {
  const state = {
    onboarding: { setupCompletedAt: profileCreatedAt },
    noAnkiFrequentUserPrompt: {
      watchedVideoDateKeys: ['2026-07-30'],
      response: null,
      respondedAt: null
    }
  }
  assert.equal(
    recordNoAnkiFrequentUserWatchedDate(state, '2026-07-27T00:00:00.000Z'),
    undefined
  )
  recordNoAnkiFrequentUserWatchedDate(state, '2026-07-29T00:00:00.000Z')
  recordNoAnkiFrequentUserWatchedDate(state, '2026-07-29T00:00:00.000Z')
  assert.deepEqual(
    state.noAnkiFrequentUserPrompt.watchedVideoDateKeys,
    ['2026-07-29', '2026-07-30']
  )
  assert.equal(recordNoAnkiFrequentUserWatchedDate(null, profileCreatedAt), undefined)
  assert.equal(recordNoAnkiFrequentUserWatchedDate(state, 'invalid'), undefined)
})

test('recorded Anki data respects logged timestamps and date-key fallback', () => {
  const base = {
    onboarding: { setupCompletedAt: profileCreatedAt }
  }
  assert.equal(hasRecordedAnkiDataSinceProfileCreation(base), false)
  assert.equal(hasRecordedAnkiDataSinceProfileCreation({
    ...base,
    anki: {
      before: {
        loggedAt: '2026-07-27T00:00:00.000Z'
      },
      '2026-07-27': {
        reviewed: 3
      }
    }
  }), false)
  assert.equal(hasRecordedAnkiDataSinceProfileCreation({
    ...base,
    anki: {
      after: {
        loggedAt: '2026-07-29T00:00:00.000Z'
      }
    }
  }), true)
  assert.equal(hasRecordedAnkiDataSinceProfileCreation({
    ...base,
    anki: {
      '2026-07-28': {
        reviewed: 0
      }
    }
  }), true)
})
