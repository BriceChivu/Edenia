import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCommunityCatalogPullRequestBody
} from '../../scripts/community-catalog-pr-report.mjs'

const CHANNEL_ID = 'UCaaaaaaaaaaaaaaaaaaaaaa'
const BASE_SHA = '1234567890abcdef1234567890abcdef12345678'
const HEAD_SHA = 'abcdef1234567890abcdef1234567890abcdef12'

function channel(overrides = {}) {
  return {
    catalogId: `community-${CHANNEL_ID}`,
    channelId: CHANNEL_ID,
    handle: '@reportedchannel',
    name: 'Reported Channel',
    languages: ['mandarin'],
    distinctUserCount: 2,
    addCount: 3,
    lastSeenAt: '2026-07-31T00:00:00Z',
    promotedAt: '2026-07-31T00:00:00Z',
    ...overrides
  }
}

test('community PR report lists candidates, promotions, exclusions, and exact revisions', () => {
  const promoted = channel()
  const body = buildCommunityCatalogPullRequestBody({
    baseCandidates: { channels: [] },
    baseCommunity: { channels: [] },
    baseSha: BASE_SHA,
    currentCandidates: { channels: [promoted] },
    currentCommunity: {
      minimumDistinctUsers: 2,
      channels: [promoted]
    },
    headSha: HEAD_SHA,
    importReport: {
      exclusions: [{
        channelId: 'UCsNTRu6HR-CX8McJGrZX8ZQ',
        name: 'Chinese with Ben',
        reason: 'already_in_catalog',
        existingCatalogId: 'mandarin-chinese-with-ben',
        eventCount: 1,
        lastSeenAt: '2026-07-27T22:32:04.605Z'
      }],
      blockedPromotions: []
    }
  })

  assert.match(body, /## Newly promoted channels/)
  assert.match(body, /Reported Channel/)
  assert.match(body, /Eligible candidates/)
  assert.match(body, /Chinese with Ben/)
  assert.match(body, /Already present in a maintained catalog/)
  assert.match(body, /mandarin-chinese-with-ben/)
  assert.match(body, new RegExp(BASE_SHA))
  assert.match(body, new RegExp(HEAD_SHA))
})

test('community PR report explains blocked promotions and excludes private identifiers', () => {
  const blocked = channel({
    distinctUserCount: 2,
    languages: []
  })
  const body = buildCommunityCatalogPullRequestBody({
    baseCandidates: { channels: [] },
    baseCommunity: { channels: [] },
    baseSha: BASE_SHA,
    currentCandidates: { channels: [blocked] },
    currentCommunity: {
      minimumDistinctUsers: 2,
      channels: []
    },
    headSha: HEAD_SHA,
    importReport: {
      blockedPromotions: [{
        channelId: CHANNEL_ID,
        blockers: ['missing_learning_language']
      }],
      exclusions: []
    }
  })

  assert.match(body, /Blocked: missing learning language/)
  assert.doesNotMatch(body, /distinct_id|person_id|learner-secret/)
})
