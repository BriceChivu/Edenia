import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateCommunityCatalogDelta
} from '../../scripts/validate-community-channel-catalog.mjs'

const CHANNEL_ID = 'UCaaaaaaaaaaaaaaaaaaaaaa'
const OTHER_CHANNEL_ID = 'UCbbbbbbbbbbbbbbbbbbbbbb'
const SECOND_CHANNEL_ID = 'UCcccccccccccccccccccccc'

function candidate(overrides = {}) {
  return {
    catalogId: `community-${CHANNEL_ID}`,
    channelId: CHANNEL_ID,
    handle: '@newchannel',
    name: 'New Channel',
    thumbnailUrl: 'https://example.test/channel.jpg',
    languages: ['mandarin'],
    levels: ['beginner'],
    style: '',
    description: '',
    aliases: [],
    available: true,
    privacyStatus: 'public',
    publishedAt: '2024-01-01T00:00:00Z',
    metadataRefreshedAt: '2026-07-31T00:00:00Z',
    addCount: 2,
    distinctUserCount: 2,
    firstSeenAt: '2026-07-30T00:00:00Z',
    lastSeenAt: '2026-07-31T00:00:00Z',
    sources: ['direct_input'],
    reviewReasons: [],
    searchText: 'new channel newchannel mandarin beginner',
    ...overrides
  }
}

function candidatesCatalog(channels = []) {
  return {
    schemaVersion: 1,
    lookbackDays: 180,
    generatedAt: channels.length ? '2026-07-31T00:00:00Z' : null,
    channels
  }
}

function communityCatalog(channels = []) {
  return {
    schemaVersion: 1,
    minimumDistinctUsers: 2,
    generatedAt: channels.length ? '2026-07-31T00:00:00Z' : null,
    channels
  }
}

function otherCatalog(channels = []) {
  return {
    schemaVersion: 1,
    channels
  }
}

function validationInput(overrides = {}) {
  const promoted = {
    ...candidate(),
    promotedAt: '2026-07-31T00:00:00Z'
  }
  return {
    baseCandidates: candidatesCatalog(),
    baseCommunity: communityCatalog(),
    currentCandidates: candidatesCatalog([candidate()]),
    currentCommunity: communityCatalog([promoted]),
    maximumPromotions: 10,
    otherCatalogs: [otherCatalog([{
      catalogId: 'other-channel',
      channelId: OTHER_CHANNEL_ID,
      handle: '@otherchannel',
      name: 'Other Channel',
      languages: ['mandarin']
    }])],
    ...overrides
  }
}

test('community validator accepts bounded promotion and rolling candidate changes', () => {
  const result = validateCommunityCatalogDelta(validationInput())
  assert.deepEqual(result, {
    candidateAdditions: 1,
    candidateRemovals: 0,
    candidateUpdates: 0,
    candidates: 1,
    promotions: 1,
    promotedTotal: 1
  })

  const expired = validateCommunityCatalogDelta(validationInput({
    baseCandidates: candidatesCatalog([candidate()]),
    currentCandidates: candidatesCatalog(),
    currentCommunity: communityCatalog(),
    maximumPromotions: 10
  }))
  assert.equal(expired.candidateRemovals, 1)
  assert.equal(expired.promotions, 0)
})

test('community validator rejects cross-catalog duplicates and private identifiers', () => {
  const duplicate = candidate({
    channelId: OTHER_CHANNEL_ID,
    catalogId: `community-${OTHER_CHANNEL_ID}`
  })
  assert.throws(
    () => validateCommunityCatalogDelta(validationInput({
      currentCandidates: candidatesCatalog([duplicate]),
      currentCommunity: communityCatalog()
    })),
    /duplicates another catalog by channelId/
  )

  assert.throws(
    () => validateCommunityCatalogDelta(validationInput({
      currentCandidates: candidatesCatalog([candidate({ distinct_id: 'private-person' })])
    })),
    /forbidden private identifier/
  )
})

test('community validator rejects ineligible, excessive, removed, or rewritten promotions', () => {
  const missingLanguage = candidate({ languages: [] })
  assert.throws(
    () => validateCommunityCatalogDelta(validationInput({
      currentCandidates: candidatesCatalog([missingLanguage]),
      currentCommunity: communityCatalog([{
        ...missingLanguage,
        promotedAt: '2026-07-31T00:00:00Z'
      }])
    })),
    /not eligible: missing_learning_language/
  )

  const second = candidate({
    catalogId: `community-${SECOND_CHANNEL_ID}`,
    channelId: SECOND_CHANNEL_ID,
    handle: '@secondnewchannel',
    name: 'Second New Channel'
  })
  assert.throws(
    () => validateCommunityCatalogDelta(validationInput({
      currentCandidates: candidatesCatalog([candidate(), second]),
      currentCommunity: communityCatalog([
        { ...candidate(), promotedAt: '2026-07-31T00:00:00Z' },
        { ...second, promotedAt: '2026-07-31T00:00:00Z' }
      ]),
      maximumPromotions: 1
    })),
    /exceeding the limit/
  )
  assert.throws(
    () => validateCommunityCatalogDelta(validationInput({
      maximumPromotions: 11
    })),
    /must be an integer from 1 to 10/
  )

  const promoted = {
    ...candidate(),
    promotedAt: '2026-07-01T00:00:00Z'
  }
  assert.throws(
    () => validateCommunityCatalogDelta(validationInput({
      baseCommunity: communityCatalog([promoted]),
      currentCommunity: communityCatalog()
    })),
    /may not remove promoted channel/
  )
  assert.throws(
    () => validateCommunityCatalogDelta(validationInput({
      baseCommunity: communityCatalog([promoted]),
      currentCommunity: communityCatalog([{
        ...promoted,
        handle: '@rewritten'
      }])
    })),
    /may not change handle/
  )
})
