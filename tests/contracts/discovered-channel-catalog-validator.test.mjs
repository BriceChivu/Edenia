import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateDiscoveredCatalogDelta
} from '../../scripts/validate-discovered-channel-catalog.mjs'

const CHANNEL_ONE = 'UC1234567890123456789012'
const CHANNEL_TWO = 'UCabcdefghijklmnopqrstuv'

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
    schemaVersion: 1,
    generatedAt: '2026-07-29T00:00:00Z',
    lastRotationIndex: 0,
    nextRotationIndex: 1,
    rotationCount: 4,
    languages: ['english'],
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
      nextRotationIndex: 2
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
      currentCatalog: catalog([], {
        generatedAt: '2026-07-30T00:00:00Z',
        lastRotationIndex: 1,
        nextRotationIndex: 2
      })
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
        languages: ['english', 'french'],
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
        nextRotationIndex: 3
      }
    }),
    /must advance to 2/
  )
})
