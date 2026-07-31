import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateDiscoveredCatalogDelta,
  validateDiscoveredCatalogShape
} from '../../scripts/validate-discovered-channel-catalog.mjs'

const CHANNEL_ONE = 'UC1234567890123456789012'
const CHANNEL_TWO = 'UCabcdefghijklmnopqrstuv'
const LANGUAGES = [
  'french',
  'english',
  'german',
  'mandarin',
  'russian',
  'spanish',
  'japanese',
  'portuguese'
]

function discoveredChannel(overrides = {}) {
  const channelId = overrides.channelId || CHANNEL_ONE
  return {
    catalogId: `discovered-${channelId}`,
    channelId,
    youtubeInput: '@exampleteacher',
    handle: '@exampleteacher',
    name: 'Example Language Teacher',
    thumbnailUrl: 'https://example.com/avatar.jpg',
    description: 'Language lessons',
    available: true,
    privacyStatus: 'public',
    publishedAt: '2020-01-01T00:00:00Z',
    subscriberCount: '500',
    videoCount: '25',
    viewCount: '1000',
    languages: ['english'],
    levels: [],
    style: 'YouTube discovery',
    aliases: [],
    discoveryScore: 200,
    discoveredByQueries: ['learn English'],
    discoveredAt: '2026-07-29T00:00:00Z',
    refreshedAt: '2026-07-29T00:00:00Z',
    searchText: 'example language teacher english youtube discovery',
    ...overrides
  }
}

function catalog(channels, overrides = {}) {
  return {
    schemaVersion: 2,
    generatedAt: '2026-07-29T00:00:00Z',
    lastRotationIndex: 0,
    nextRotationIndex: 1,
    rotationCount: 4,
    lastLanguageBatchIndex: 3,
    nextLanguageBatchIndex: 0,
    languageBatchCount: 4,
    languageBatchSize: 2,
    lastDiscoveryQuotaDate: '2026-07-29',
    lastDiscoveryLanguages: ['japanese', 'portuguese'],
    lastSearchRequestCount: 7,
    languages: LANGUAGES,
    channels,
    ...overrides
  }
}

function legacyCatalog(channels, overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-29T00:00:00Z',
    lastRotationIndex: 0,
    nextRotationIndex: 1,
    rotationCount: 4,
    languages: LANGUAGES,
    channels,
    ...overrides
  }
}

function validDelta(overrides = {}) {
  const existing = discoveredChannel()
  const added = discoveredChannel({
    channelId: CHANNEL_TWO,
    catalogId: `discovered-${CHANNEL_TWO}`,
    youtubeInput: '@secondteacher',
    handle: '@secondteacher',
    name: 'Second Language Teacher'
  })
  return {
    baseCatalog: catalog([existing]),
    currentCatalog: catalog([existing, added], {
      generatedAt: '2026-07-30T00:00:00Z',
      lastRotationIndex: 1,
      nextRotationIndex: 1,
      lastLanguageBatchIndex: 0,
      nextLanguageBatchIndex: 1,
      lastDiscoveryQuotaDate: '2026-07-30',
      lastDiscoveryLanguages: ['french', 'english'],
      lastSearchRequestCount: 7
    }),
    otherCatalogs: [{ channels: [] }],
    ...overrides
  }
}

test('discovery delta accepts bounded additions and rotation progress', () => {
  assert.deepEqual(validateDiscoveredCatalogDelta(validDelta()), {
    additions: 1,
    existing: 1,
    total: 2
  })
})

test('discovery delta rejects removals and stable-field rewrites', () => {
  const input = validDelta()
  assert.throws(
    () => validateDiscoveredCatalogDelta({
      ...input,
      currentCatalog: {
        ...input.currentCatalog,
        channels: []
      }
    }),
    /may not remove channels/
  )

  const changedExisting = {
    ...input.currentCatalog.channels[0],
    languages: ['french']
  }
  assert.throws(
    () => validateDiscoveredCatalogDelta({
      ...input,
      currentCatalog: {
        ...input.currentCatalog,
        languages: [...LANGUAGES].reverse(),
        channels: [changedExisting, input.currentCatalog.channels[1]]
      }
    }),
    /may not change the configured languages/
  )
})

test('discovery delta rejects excessive or cross-catalog additions', () => {
  assert.throws(
    () => validateDiscoveredCatalogDelta(validDelta({ maxAdditions: 0 })),
    /exceeding the limit of 0/
  )

  const input = validDelta()
  assert.throws(
    () => validateDiscoveredCatalogDelta({
      ...input,
      otherCatalogs: [{
        channels: [{
          channelId: CHANNEL_TWO,
          handle: '@different-handle',
          name: 'Different name'
        }]
      }]
    }),
    /already exists in another catalog/
  )
})

test('discovery delta rejects ineligible additions and invalid rotation', () => {
  const input = validDelta()
  const ineligible = {
    ...input.currentCatalog.channels[1],
    videoCount: '2'
  }
  assert.throws(
    () => validateDiscoveredCatalogDelta({
      ...input,
      currentCatalog: {
        ...input.currentCatalog,
        channels: [input.currentCatalog.channels[0], ineligible]
      }
    }),
    /fewer than 10 videos/
  )
  assert.throws(
    () => validateDiscoveredCatalogDelta({
      ...input,
      currentCatalog: {
        ...input.currentCatalog,
        nextRotationIndex: 2
      }
    }),
    /must advance to 1/
  )
})

test('discovery delta accepts the one-time migration to language batches', () => {
  const input = validDelta()
  assert.deepEqual(validateDiscoveredCatalogDelta({
    ...input,
    baseCatalog: legacyCatalog([input.baseCatalog.channels[0]])
  }), {
    additions: 1,
    existing: 1,
    total: 2
  })
})

test('discovery delta rejects same-day retries and out-of-batch additions', () => {
  const input = validDelta()
  assert.throws(
    () => validateDiscoveredCatalogDelta({
      ...input,
      currentCatalog: {
        ...input.currentCatalog,
        lastDiscoveryQuotaDate: input.baseCatalog.lastDiscoveryQuotaDate
      }
    }),
    /later YouTube quota day/
  )

  assert.throws(
    () => validateDiscoveredCatalogDelta({
      ...input,
      currentCatalog: {
        ...input.currentCatalog,
        channels: [
          input.currentCatalog.channels[0],
          {
            ...input.currentCatalog.channels[1],
            languages: ['german']
          }
        ]
      }
    }),
    /outside the active language batch/
  )
})

test('discovered catalog rejects more than seven search requests', () => {
  assert.throws(
    () => validateDiscoveredCatalogShape(catalog([discoveredChannel()], {
      lastSearchRequestCount: 8
    })),
    /may not exceed 7/
  )
})
