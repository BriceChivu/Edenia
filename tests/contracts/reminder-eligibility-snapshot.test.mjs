import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createReminderEligibilitySnapshot,
  MAX_REMINDER_SNAPSHOT_CHANNELS
} from '../../src/domain/reminder-eligibility-snapshot.js'

const CHANNEL_A = 'UCaaaaaaaaaaaaaaaaaaaaaa'
const CHANNEL_B = 'UCbbbbbbbbbbbbbbbbbbbbbb'

function state(overrides = {}) {
  return {
    config: {
      channels: [
        { id: CHANNEL_A, name: 'Channel A' },
        { id: CHANNEL_B, name: 'Channel B' }
      ]
    },
    learnerProfile: { languages: ['mandarin'] },
    videos: {},
    ...overrides
  }
}

function snapshot(localState, overrides = {}) {
  return createReminderEligibilitySnapshot({
    state: localState,
    timezone: 'Asia/Taipei',
    locale: 'zh-Hant',
    studyDate: '2026-08-13',
    pointsToday: 4,
    lastQualifiedStudyDate: '2026-08-12',
    currentStreakDays: 7,
    includeShorts: true,
    ...overrides
  })
}

test('snapshot contains only bounded reminder eligibility facts', () => {
  const result = snapshot(state({
    privateNotes: 'must not upload',
    activityLog: [{ detail: 'must not upload' }],
    videos: {
      dQw4w9WgXcQ: {
        id: 'dQw4w9WgXcQ',
        title: 'Newest unwatched lesson',
        channelId: CHANNEL_A,
        publishedAt: '2026-08-13T03:00:00.000Z',
        status: 'unwatched'
      }
    }
  }))

  assert.deepEqual(result, {
    timezone: 'Asia/Taipei',
    locale: 'zh-Hant',
    learningLanguage: 'mandarin',
    studyDate: '2026-08-13',
    pointsToday: 4,
    lastQualifiedStudyDate: '2026-08-12',
    currentStreakDays: 7,
    channels: [
      {
        channelId: CHANNEL_A,
        channelName: 'Channel A',
        latestVideoId: 'dQw4w9WgXcQ',
        latestVideoTitle: 'Newest unwatched lesson',
        latestVideoPublishedAt: '2026-08-13T03:00:00.000Z'
      },
      {
        channelId: CHANNEL_B,
        channelName: 'Channel B',
        latestVideoId: null,
        latestVideoTitle: null,
        latestVideoPublishedAt: null
      }
    ]
  })
  assert.equal(JSON.stringify(result).includes('privateNotes'), false)
  assert.equal(JSON.stringify(result).includes('activityLog'), false)
})

test('latest candidate is unwatched, visible, and respects the shorts choice', () => {
  const result = snapshot(state({ videos: {
    aaaaaaaaaaa: {
      id: 'aaaaaaaaaaa', title: 'Watched', channelId: CHANNEL_A,
      publishedAt: '2026-08-13T05:00:00Z', status: 'watched'
    },
    bbbbbbbbbbb: {
      id: 'bbbbbbbbbbb', title: 'Removed', channelId: CHANNEL_A,
      publishedAt: '2026-08-13T04:00:00Z', status: 'unwatched', removedFromFeedAt: '2026-08-13T04:01:00Z'
    },
    ccccccccccc: {
      id: 'ccccccccccc', title: 'Short', channelId: CHANNEL_A,
      publishedAt: '2026-08-13T03:00:00Z', status: 'unwatched', duration: 30
    },
    ddddddddddd: {
      id: 'ddddddddddd', title: 'Eligible', channelId: CHANNEL_A,
      publishedAt: '2026-08-13T02:00:00Z', status: 'unwatched', duration: 600
    }
  } }), { includeShorts: false })

  assert.equal(result.channels[0].latestVideoId, 'ddddddddddd')
  assert.equal(result.channels[0].latestVideoTitle, 'Eligible')
})

test('malformed, duplicate, and excessive channels cannot inflate the payload', () => {
  const channels = Array.from({ length: MAX_REMINDER_SNAPSHOT_CHANNELS + 20 }, (_, index) => ({
    id: `UC${String(index).padStart(22, '0')}`,
    name: `Channel ${index}`
  }))
  channels.unshift(
    { id: 'not-youtube', name: 'Invalid' },
    { id: channels[0].id, name: 'Duplicate' }
  )

  const result = snapshot(state({
    config: { channels },
    learnerProfile: { languages: ['unsupported'] }
  }))

  assert.equal(result.channels.length, MAX_REMINDER_SNAPSHOT_CHANNELS)
  assert.equal(new Set(result.channels.map(channel => channel.channelId)).size, result.channels.length)
  assert.equal(result.learningLanguage, null)
})
