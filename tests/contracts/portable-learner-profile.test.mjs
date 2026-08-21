import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPortableLearnerProfileEnvelope,
  finalizePortableLearnerProfileEnvelope,
  PORTABLE_LEARNER_PROFILE_SCHEMA,
  PORTABLE_LEARNER_PROFILE_VERSION,
  preparePortableLearnerProfileEnvelope,
  reconcilePortableAnkiDays,
  verifyPortableLearnerProfileEnvelope
} from '../../src/state/portable-learner-profile.js'

function durableState() {
  return {
    config: {
      weeklyGoalHours: 6,
      locale: 'fr',
      includeShorts: false,
      ankiEnabled: false,
      channels: [{
        id: 'channel-b',
        name: 'Second channel',
        imageUrl: 'https://example.com/channel-b.jpg',
        catalogId: 'catalog-b',
        privateCredential: 'channel-secret'
      }, {
        id: 'channel-a',
        name: 'First channel',
        imageUrl: 'https://example.com/channel-a.jpg'
      }],
      channelShelfOrder: ['channel-b', 'channel-a', 'channel-b'],
      channelVideoFormats: {
        'channel-b': 'shorts',
        'channel-a': 'videos',
        invalid: 'all'
      },
      removedDefaultChannelIds: ['removed-default', 'removed-default'],
      removedChannelIds: ['removed-channel', 'removed-channel'],
      theme: 'dark',
      historyView: 'heatmap',
      studyInsights: {
        collapsed: true,
        history: [{ key: 'derived-insight', score: 999 }]
      },
      apiKey: 'youtube-secret',
      ankiDisabledAt: '2026-08-15T12:00:00.000Z',
      ankiResumeBaselines: { private: true },
      ankiPendingResumeBaseline: { private: true }
    },
    learnerProfile: {
      languages: ['french', 'japanese', 'french'],
      level: 'intermediate',
      selectedChannelCatalogIds: ['catalog-b', 'catalog-a', 'catalog-b'],
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-15T12:00:00.000Z',
      accountId: 'owner-must-not-travel'
    },
    videos: {
      retained: {
        id: 'retained',
        title: 'Durable lesson',
        channelId: 'channel-b',
        channelTitle: 'Second channel',
        channelImageUrl: 'https://example.com/channel-b.jpg',
        thumbnail: 'https://example.com/video.jpg',
        publishedAt: '2026-08-10T12:00:00.000Z',
        duration: 900,
        aspectRatio: 16 / 9,
        isShort: false,
        status: 'watched',
        watchedAt: '2026-08-15T12:30:00.000Z',
        watchedConfirmationUnlockedAt: '2026-08-15T12:31:00.000Z',
        favorite: true,
        watchLater: false,
        removedFromFeedAt: '2026-08-16T12:00:00.000Z',
        resumeAtSeconds: 42,
        pausedAt: '2026-08-15T12:10:00.000Z',
        source: 'manual',
        manuallyAdded: true,
        hiddenFromGrid: false,
        hiddenFromGridAt: null,
        watchProgress: [{
          watchedAt: '2026-08-15T12:30:00.000Z',
          seconds: 600
        }, {
          watchedAt: '2026-08-14T12:30:00.000Z',
          seconds: 300
        }],
        watchCycleCoverage: [{ start: 0, end: 42 }],
        shortsCheckedAt: '2026-08-16T12:00:00.000Z',
        privateCredential: 'video-secret'
      },
      replaceable: {
        id: 'replaceable',
        title: 'Fetched but untouched',
        channelId: 'channel-a',
        duration: 300,
        status: 'unwatched',
        favorite: false,
        watchLater: false,
        watchProgress: [],
        generatedCache: 'replaceable-cache'
      }
    },
    anki: {
      '2026-08-15': {
        reviewed: '12.9',
        created: 3.8,
        loggedAt: '2026-08-15T13:00:00.000Z',
        source: 'ankiconnect',
        dueCards: 999,
        connectionUrl: 'http://127.0.0.1:8765'
      }
    },
    cityProgress: {
      maxLevelIndex: 4,
      pendingLevelIndex: 7,
      scoringVersion: 999,
      score: 12345
    },
    onboarding: {
      version: 2,
      introSeenAt: '2026-08-01T12:00:00.000Z',
      accountStepReachedAt: '2026-08-01T12:10:00.000Z',
      setupCompleted: true,
      setupCompletedAt: '2026-08-01T12:20:00.000Z',
      walkthroughCompleted: true,
      walkthroughCompletedAt: '2026-08-01T12:30:00.000Z',
      levelUpGuidanceShownAt: '2026-08-02T12:00:00.000Z',
      recommendationsAppliedAt: '2026-08-01T12:25:00.000Z',
      starterFeed: {
        status: 'running',
        queuedAt: '2026-08-01T12:00:00.000Z'
      }
    },
    noAnkiFrequentUserPrompt: {
      watchedVideoDateKeys: ['2026-08-14', '2026-08-15'],
      response: 'not-interested',
      respondedAt: '2026-08-15T12:00:00.000Z'
    },
    activityLog: [{
      id: 'meaningful-history',
      createdAt: '2026-08-15T12:30:00.000Z',
      actor: 'user',
      type: 'video-status',
      status: 'success',
      title: 'Video updated',
      detail: 'Durable lesson watched',
      meta: {
        videoId: 'retained',
        status: 'watched',
        accessToken: 'activity-secret'
      }
    }],
    streak: { current: 99, longest: 100, lastActivityDate: '2026-08-15' },
    score: 999999,
    studyInsights: { score: 888 },
    undoStack: [{ token: 'undo-secret' }],
    redoStack: [{ token: 'redo-secret' }],
    channelRefreshes: { 'channel-a': { cache: true } },
    pendingOperations: [{ id: 'pending' }],
    authSession: { accessToken: 'auth-secret' },
    credentials: { password: 'credential-secret' },
    analyticsId: 'analytics-secret',
    layout: { selectedTab: 'device-only' },
    totalRewatchCount: 42,
    lastVideoOpenedAt: '2026-08-15T12:00:00.000Z'
  }
}

test('a durable sync candidate includes its integrity before async verification', async () => {
  const source = durableState()
  const before = structuredClone(source)
  const prepared = preparePortableLearnerProfileEnvelope(source, {
    now: () => new Date('2026-08-17T00:00:00.000Z')
  })
  const serializedPrepared = JSON.stringify(prepared)

  assert.deepEqual(source, before)
  assert.equal(prepared.exportedAt, '2026-08-17T00:00:00.000Z')
  assert.equal(prepared.schema, PORTABLE_LEARNER_PROFILE_SCHEMA)
  assert.equal(prepared.version, PORTABLE_LEARNER_PROFILE_VERSION)
  assert.equal(prepared.integrity.algorithm, 'SHA-256')
  assert.match(prepared.integrity.payloadSha256, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(
    new TextEncoder().encode(serializedPrepared).byteLength,
    prepared.integrity.byteLength
  )
  assert.equal(serializedPrepared.includes('youtube-secret'), false)
  assert.equal(serializedPrepared.includes('auth-secret'), false)

  const finalized = await finalizePortableLearnerProfileEnvelope(prepared)
  assert.deepEqual(
    await verifyPortableLearnerProfileEnvelope(finalized.serialized),
    finalized.envelope
  )
})

test('portable envelope preserves durable learner data and excludes browser authority', async () => {
  const source = durableState()
  const before = structuredClone(source)
  const created = await createPortableLearnerProfileEnvelope(source, {
    now: () => new Date('2026-08-17T00:00:00.000Z')
  })

  assert.deepEqual(source, before)
  assert.equal(created.envelope.schema, PORTABLE_LEARNER_PROFILE_SCHEMA)
  assert.equal(created.envelope.version, PORTABLE_LEARNER_PROFILE_VERSION)
  assert.equal(created.envelope.exportedAt, '2026-08-17T00:00:00.000Z')
  assert.equal(created.envelope.integrity.algorithm, 'SHA-256')
  assert.equal(created.envelope.integrity.byteLength, created.byteLength)
  assert.equal(
    new TextEncoder().encode(created.serialized).byteLength,
    created.byteLength
  )
  assert.equal(created.serialized, JSON.stringify(created.envelope))
  assert.deepEqual(
    await verifyPortableLearnerProfileEnvelope(created.serialized),
    created.envelope
  )

  const { profile } = created.envelope
  assert.deepEqual(Object.keys(profile).sort(), [
    'activityLog',
    'anki',
    'cityProgress',
    'config',
    'learnerProfile',
    'noAnkiFrequentUserPrompt',
    'onboarding',
    'videos'
  ])
  assert.deepEqual(profile.learnerProfile, {
    languages: ['french', 'japanese'],
    level: 'intermediate',
    selectedChannelCatalogIds: ['catalog-a', 'catalog-b'],
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-15T12:00:00.000Z'
  })
  assert.deepEqual(profile.config, {
    weeklyGoalHours: 6,
    locale: 'fr',
    includeShorts: false,
    ankiEnabled: false,
    channels: [{
      id: 'channel-a',
      name: 'First channel',
      imageUrl: 'https://example.com/channel-a.jpg',
      catalogId: null
    }, {
      id: 'channel-b',
      name: 'Second channel',
      imageUrl: 'https://example.com/channel-b.jpg',
      catalogId: 'catalog-b'
    }],
    channelShelfOrder: ['channel-b', 'channel-a'],
    channelVideoFormats: {
      'channel-a': 'videos',
      'channel-b': 'shorts'
    },
    removedDefaultChannelIds: ['removed-default'],
    removedChannelIds: ['removed-channel']
  })
  assert.deepEqual(profile.anki, {
    '2026-08-15': {
      reviewed: 12,
      created: 3,
      observedAt: '2026-08-15T13:00:00.000Z'
    }
  })
  assert.deepEqual(profile.cityProgress, { maxLevelIndex: 4 })
  assert.deepEqual(profile.onboarding, {
    introSeenAt: '2026-08-01T12:00:00.000Z',
    setupCompleted: true,
    setupCompletedAt: '2026-08-01T12:20:00.000Z',
    walkthroughCompleted: true,
    walkthroughCompletedAt: '2026-08-01T12:30:00.000Z',
    levelUpGuidanceShownAt: '2026-08-02T12:00:00.000Z',
    recommendationsAppliedAt: '2026-08-01T12:25:00.000Z'
  })
  assert.deepEqual(profile.noAnkiFrequentUserPrompt, {
    response: 'not-interested',
    respondedAt: '2026-08-15T12:00:00.000Z'
  })
  assert.equal(Object.hasOwn(profile.videos, 'replaceable'), false)
  assert.equal(profile.videos.retained.watchProgress.length, 2)
  assert.deepEqual(
    profile.videos.retained.watchProgress.map(entry => entry.studyDay),
    ['2026-08-14', '2026-08-15']
  )
  assert.equal(
    new Set(profile.videos.retained.watchProgress.map(entry => entry.id)).size,
    2
  )
  assert.deepEqual(profile.activityLog, [{
    id: 'meaningful-history',
    createdAt: '2026-08-15T12:30:00.000Z',
    actor: 'user',
    type: 'video-status',
    status: 'success',
    title: 'Video updated',
    detail: 'Durable lesson watched',
    meta: {
      videoId: 'retained',
      status: 'watched'
    }
  }])

  const portableJson = created.serialized
  for (const excluded of [
    'youtube-secret',
    'channel-secret',
    'video-secret',
    'activity-secret',
    'undo-secret',
    'redo-secret',
    'auth-secret',
    'credential-secret',
    'analytics-secret',
    'replaceable-cache',
    'derived-insight',
    'watchCycleCoverage',
    'pendingLevelIndex',
    'scoringVersion',
    'theme',
    'streak'
  ]) {
    assert.equal(portableJson.includes(excluded), false, excluded)
  }
})

test('same-day Anki reconciliation takes independent highest observations', () => {
  const first = {
    '2026-08-15': {
      reviewed: 20,
      created: 2,
      loggedAt: '2026-08-15T12:00:00.000Z'
    }
  }
  const second = [{
    studyDay: '2026-08-15',
    reviewed: 8,
    created: 7,
    observedAt: '2026-08-15T13:00:00.000Z'
  }, {
    studyDay: '2026-08-16',
    reviewed: 4,
    created: 1,
    observedAt: null
  }]
  const before = structuredClone([first, second])

  assert.deepEqual(reconcilePortableAnkiDays(first, second), {
    '2026-08-15': {
      reviewed: 20,
      created: 7,
      observedAt: '2026-08-15T13:00:00.000Z'
    },
    '2026-08-16': {
      reviewed: 4,
      created: 1,
      observedAt: null
    }
  })
  assert.deepEqual([first, second], before)
})

test('portable normalization is deterministic across nonsemantic source order', async () => {
  const left = durableState()
  const right = structuredClone(left)
  right.config = Object.fromEntries(Object.entries(right.config).reverse())
  right.config.channels.reverse()
  right.learnerProfile.languages.reverse()
  right.learnerProfile.selectedChannelCatalogIds.reverse()
  right.videos = Object.fromEntries(Object.entries(right.videos).reverse())
  right.videos.retained.watchProgress.reverse()

  const options = {
    now: () => new Date('2026-08-17T00:00:00.000Z')
  }
  const leftExport = await createPortableLearnerProfileEnvelope(left, options)
  const rightExport = await createPortableLearnerProfileEnvelope(right, options)

  assert.equal(rightExport.serialized, leftExport.serialized)
  assert.equal(
    rightExport.envelope.integrity.payloadSha256,
    leftExport.envelope.integrity.payloadSha256
  )
})

test('verification rejects noncanonical, tampered, unsupported, or oversized data losslessly', async () => {
  const created = await createPortableLearnerProfileEnvelope(durableState(), {
    now: () => new Date('2026-08-17T00:00:00.000Z')
  })
  const tampered = structuredClone(created.envelope)
  tampered.profile.anki['2026-08-15'].reviewed = 999
  const exportedAtTampered = structuredClone(created.envelope)
  exportedAtTampered.exportedAt = '2026-08-18T00:00:00.000Z'
  const unsupported = structuredClone(created.envelope)
  unsupported.version += 1
  const widened = { ...created.envelope, unexpected: true }
  const before = structuredClone({
    exportedAtTampered,
    tampered,
    unsupported,
    widened
  })

  assert.equal(await verifyPortableLearnerProfileEnvelope(tampered), null)
  assert.equal(
    await verifyPortableLearnerProfileEnvelope(exportedAtTampered),
    null
  )
  assert.equal(await verifyPortableLearnerProfileEnvelope(unsupported), null)
  assert.equal(await verifyPortableLearnerProfileEnvelope(widened), null)
  assert.equal(
    await verifyPortableLearnerProfileEnvelope(
      JSON.stringify(created.envelope, null, 2)
    ),
    null
  )
  assert.equal(
    await verifyPortableLearnerProfileEnvelope(created.serialized, {
      maxBytes: 1
    }),
    null
  )
  assert.deepEqual({
    exportedAtTampered,
    tampered,
    unsupported,
    widened
  }, before)

  const source = durableState()
  const sourceBefore = structuredClone(source)
  await assert.rejects(
    createPortableLearnerProfileEnvelope(source, { maxBytes: 1 }),
    /too large/
  )
  assert.deepEqual(source, sourceBefore)
})
