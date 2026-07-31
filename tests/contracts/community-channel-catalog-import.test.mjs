import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregateCandidateEvents,
  buildCandidates
} from '../../scripts/import-community-channel-candidates.mjs'
import {
  buildCommunityCatalog,
  collectCatalogIdentities
} from '../../scripts/community-channel-catalog-policy.mjs'

const KNOWN_CHANNEL_ID = 'UCsNTRu6HR-CX8McJGrZX8ZQ'
const CANDIDATE_CHANNEL_ID = 'UCaaaaaaaaaaaaaaaaaaaaaa'
const HANDLE_DUPLICATE_ID = 'UCbbbbbbbbbbbbbbbbbbbbbb'
const NOW = '2026-07-31T06:00:00.000Z'

function candidateEvent(overrides = {}) {
  return {
    distinct_id: 'learner-1',
    timestamp: '2026-07-31T05:00:00.000Z',
    channel_id: CANDIDATE_CHANNEL_ID,
    channel_name: 'New Mandarin Channel',
    channel_thumbnail_url: 'https://example.test/event.jpg',
    source: 'direct_input',
    catalog_source: null,
    catalog_candidate: true,
    learning_languages: ['mandarin'],
    learner_level: 'beginner',
    internal_or_test_user: false,
    ...overrides
  }
}

function youtubeChannel(overrides = {}) {
  return {
    id: CANDIDATE_CHANNEL_ID,
    snippet: {
      title: 'New Mandarin Channel',
      customUrl: '@newmandarinchannel',
      publishedAt: '2024-01-01T00:00:00Z',
      thumbnails: {
        high: { url: 'https://example.test/youtube.jpg' }
      }
    },
    status: { privacyStatus: 'public' },
    ...overrides
  }
}

test('community import positively identifies candidates and excludes known or legacy events', () => {
  const identities = collectCatalogIdentities([{
    channels: [{
      catalogId: 'mandarin-chinese-with-ben',
      channelId: KNOWN_CHANNEL_ID,
      handle: '@chinesewithben',
      name: 'Chinese with Ben'
    }]
  }])
  const result = aggregateCandidateEvents([
    candidateEvent(),
    candidateEvent({
      distinct_id: 'learner-2',
      timestamp: '2026-07-31T05:30:00.000Z',
      source: 'youtube_search'
    }),
    candidateEvent({
      channel_id: KNOWN_CHANNEL_ID,
      channel_name: 'Chinese with Ben'
    }),
    candidateEvent({
      channel_id: 'UCcccccccccccccccccccccc',
      catalog_candidate: null
    }),
    candidateEvent({
      channel_id: 'UCdddddddddddddddddddddd',
      internal_or_test_user: true
    })
  ], { identities })

  assert.equal(result.aggregates.length, 1)
  assert.equal(result.aggregates[0].addCount, 2)
  assert.equal(result.aggregates[0].distinctUsers.size, 2)
  assert.deepEqual(Array.from(result.aggregates[0].sources).sort(), [
    'direct_input',
    'youtube_search'
  ])
  assert.deepEqual(
    result.exclusions.map(entry => [entry.name, entry.reason]),
    [
      ['Chinese with Ben', 'already_in_catalog'],
      ['New Mandarin Channel', 'internal_or_test_event'],
      ['New Mandarin Channel', 'missing_positive_candidate_provenance']
    ]
  )
  assert.equal(JSON.stringify(result.exclusions).includes('learner-'), false)
})

test('verified eligible candidates promote without persisting learner identities', async () => {
  const aggregated = aggregateCandidateEvents([
    candidateEvent(),
    candidateEvent({
      distinct_id: 'learner-2',
      source: 'youtube_search'
    })
  ])
  const built = await buildCandidates(aggregated.aggregates, { channels: [] }, {
    identities: collectCatalogIdentities([]),
    now: NOW,
    youtubeById: new Map([[CANDIDATE_CHANNEL_ID, youtubeChannel()]])
  })

  assert.equal(built.exclusions.length, 0)
  assert.equal(built.candidates.length, 1)
  assert.equal(built.candidates[0].distinctUserCount, 2)
  assert.deepEqual(built.candidates[0].languages, ['mandarin'])
  assert.deepEqual(built.candidates[0].sources, ['direct_input', 'youtube_search'])
  assert.equal(JSON.stringify(built.candidates).includes('learner-'), false)

  const community = buildCommunityCatalog(built.candidates, { channels: [] }, {
    minimumDistinctUsers: 2,
    now: NOW,
    supportedLanguages: new Set(['mandarin'])
  })
  assert.equal(community.promotions.length, 1)
  assert.equal(community.channels[0].promotedAt, NOW)
  assert.deepEqual(community.blockedPromotions, [])
})

test('handle collisions are excluded and threshold candidates with missing language stay unpromoted', async () => {
  const identities = collectCatalogIdentities([{
    channels: [{
      catalogId: 'existing-handle',
      channelId: KNOWN_CHANNEL_ID,
      handle: '@existinghandle',
      name: 'Existing Channel'
    }]
  }])
  const duplicateAggregated = aggregateCandidateEvents([
    candidateEvent({ channel_id: HANDLE_DUPLICATE_ID })
  ])
  const duplicateBuilt = await buildCandidates(
    duplicateAggregated.aggregates,
    { channels: [] },
    {
      identities,
      now: NOW,
      youtubeById: new Map([[
        HANDLE_DUPLICATE_ID,
        youtubeChannel({
          id: HANDLE_DUPLICATE_ID,
          snippet: {
            ...youtubeChannel().snippet,
            customUrl: '@existinghandle'
          }
        })
      ]])
    }
  )
  assert.equal(duplicateBuilt.candidates.length, 0)
  assert.equal(duplicateBuilt.exclusions[0].reason, 'already_in_catalog')

  const candidate = {
    ...(await buildCandidates(
      aggregateCandidateEvents([
        candidateEvent(),
        candidateEvent({ distinct_id: 'learner-2' })
      ]).aggregates,
      { channels: [] },
      {
        identities: collectCatalogIdentities([]),
        now: NOW,
        youtubeById: new Map([[CANDIDATE_CHANNEL_ID, youtubeChannel()]])
      }
    )).candidates[0],
    languages: []
  }
  const community = buildCommunityCatalog([candidate], { channels: [] }, {
    minimumDistinctUsers: 2,
    now: NOW,
    supportedLanguages: new Set(['mandarin'])
  })
  assert.equal(community.promotions.length, 0)
  assert.deepEqual(community.blockedPromotions[0].blockers, ['missing_learning_language'])
})

test('routine imports retain every existing promoted channel and its stable identity', () => {
  const previous = {
    channels: [{
      catalogId: `community-${CANDIDATE_CHANNEL_ID}`,
      channelId: CANDIDATE_CHANNEL_ID,
      handle: '@stablehandle',
      name: 'Stable Name',
      languages: ['mandarin'],
      levels: ['beginner'],
      style: '',
      description: '',
      promotedAt: '2026-07-01T00:00:00.000Z',
      addCount: 2,
      distinctUserCount: 2,
      firstSeenAt: '2026-06-01T00:00:00.000Z',
      lastSeenAt: '2026-06-02T00:00:00.000Z',
      sources: ['direct_input'],
      metadataRefreshedAt: '2026-07-01T00:00:00.000Z'
    }]
  }
  const updatedObservation = {
    ...previous.channels[0],
    handle: '@renamed-by-youtube',
    name: 'Renamed by YouTube',
    addCount: 3,
    distinctUserCount: 3,
    lastSeenAt: NOW,
    sources: ['direct_input', 'youtube_search'],
    metadataRefreshedAt: NOW
  }
  const community = buildCommunityCatalog([updatedObservation], previous, {
    supportedLanguages: new Set(['mandarin'])
  })

  assert.equal(community.channels.length, 1)
  assert.equal(community.channels[0].handle, '@stablehandle')
  assert.equal(community.channels[0].name, 'Stable Name')
  assert.equal(community.channels[0].distinctUserCount, 3)
  assert.equal(community.channels[0].lastSeenAt, NOW)
})
