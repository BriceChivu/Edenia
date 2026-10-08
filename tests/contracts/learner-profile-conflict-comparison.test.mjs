import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  createLearnerProfileConflictComparison
} from '../../src/features/profile-access/conflict-comparison.js'

function profile(overrides = {}) {
  return {
    activityLog: [],
    anki: {},
    cityProgress: { maxLevelIndex: 0 },
    config: { channels: [] },
    learnerProfile: {
      languages: ['french'],
      level: 'beginner',
      selectedChannelCatalogIds: [],
      updatedAt: '2026-08-20T10:00:00.000Z'
    },
    videos: {},
    ...overrides
  }
}

test('island-only divergence is visible without interpreting the snapshot', () => {
  const island = JSON.parse(readFileSync(new URL('../fixtures/tiny-swords-populated-island.json', import.meta.url)))
  const device = profile({ tinySwordsIsland: island })
  const cloud = structuredClone(device)
  cloud.tinySwordsIsland.resources.wood += 1
  assert.deepEqual(createLearnerProfileConflictComparison(device, cloud), [
    { key: 'island', device: { present: true }, cloud: { present: true } }
  ])
  const reordered = { ...device, tinySwordsIsland: Object.fromEntries(Object.entries(island).reverse()) }
  assert.deepEqual(createLearnerProfileConflictComparison(device, reordered), [])
  assert.deepEqual(createLearnerProfileConflictComparison(device, profile()), [
    { key: 'island', device: { present: true }, cloud: { present: false } }
  ])
})

test('identical profiles produce no comparison rows', () => {
  const shared = profile()

  assert.deepEqual(
    createLearnerProfileConflictComparison(shared, structuredClone(shared)),
    []
  )
})

test('comparison rows cover only the meaningful conflict groups', () => {
  const device = profile({
    activityLog: [{
      createdAt: '2026-08-21T09:00:00.000Z',
      title: 'Reviewed a lesson',
      type: 'study'
    }],
    anki: {
      '2026-08-21': {
        created: 4,
        observedAt: '2026-08-21T09:10:00.000Z',
        reviewed: 20
      }
    },
    cityProgress: { maxLevelIndex: 3 },
    config: {
      channels: [{ id: 'device-channel', name: 'Device channel' }]
    },
    learnerProfile: {
      languages: ['french'],
      level: 'intermediate',
      selectedChannelCatalogIds: ['french-news'],
      updatedAt: '2026-08-21T09:15:00.000Z'
    },
    videos: {
      deviceVideo: {
        favorite: true,
        id: 'deviceVideo',
        removedFromFeedAt: null,
        status: 'watched',
        watchLater: false,
        watchProgress: [{
          seconds: 600,
          studyDay: '2026-08-21',
          watchedAt: '2026-08-21T09:05:00.000Z'
        }]
      }
    }
  })
  const cloud = profile({
    activityLog: [{
      createdAt: '2026-08-20T08:00:00.000Z',
      title: 'Saved a video',
      type: 'video'
    }],
    anki: {
      '2026-08-20': {
        created: 1,
        observedAt: '2026-08-20T08:10:00.000Z',
        reviewed: 5
      }
    },
    cityProgress: { maxLevelIndex: 1 },
    config: {
      channels: [{ id: 'cloud-channel', name: 'Cloud channel' }]
    },
    learnerProfile: {
      languages: ['mandarin'],
      level: 'beginner',
      selectedChannelCatalogIds: ['mandarin-stories'],
      updatedAt: '2026-08-20T08:15:00.000Z'
    },
    videos: {
      cloudVideo: {
        favorite: false,
        id: 'cloudVideo',
        removedFromFeedAt: null,
        status: 'partial',
        watchLater: true,
        watchProgress: [{
          seconds: 120,
          studyDay: '2026-08-20',
          watchedAt: '2026-08-20T08:05:00.000Z'
        }]
      }
    }
  })

  const comparison = createLearnerProfileConflictComparison(device, cloud)

  assert.deepEqual(
    comparison.map(row => row.key),
    [
      'update-study-time',
      'language-level',
      'town-study-progress',
      'recent-activity',
      'video-organization',
      'anki-totals',
      'channels'
    ]
  )
  assert.equal(JSON.stringify(comparison).includes('winner'), false)
  assert.equal(JSON.stringify(comparison).includes('recommend'), false)
  assert.deepEqual(comparison[0].device, {
    studyDays: 1,
    studySeconds: 600,
    updatedAt: '2026-08-21T09:15:00.000Z'
  })
  assert.deepEqual(comparison[5].cloud, {
    created: 1,
    days: 1,
    reviewed: 5
  })
})
