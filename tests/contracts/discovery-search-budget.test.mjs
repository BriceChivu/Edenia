import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSearchRequestBudget,
  DISCOVERY_MAX_SEARCH_REQUESTS,
  getDiscoveryRotationState,
  getYoutubeQuotaDate
} from '../../scripts/discover-language-channels.mjs'

test('discovery search budget stops before an eighth request', () => {
  const budget = createSearchRequestBudget()
  for (let index = 0; index < DISCOVERY_MAX_SEARCH_REQUESTS; index += 1) {
    budget.consume()
  }
  assert.equal(budget.used, 7)
  assert.equal(budget.remaining, 0)
  assert.throws(
    () => budget.consume(),
    /budget exhausted after 7 requests/
  )
})

test('discovery rotates two languages daily and advances queries after all languages', () => {
  const first = getDiscoveryRotationState({
    nextLanguageBatchIndex: 0,
    nextRotationIndex: 0
  })
  assert.deepEqual(
    first.activeLanguages.map(language => language.id),
    ['french', 'english']
  )
  assert.equal(first.nextLanguageBatchIndex, 1)
  assert.equal(first.nextRotationIndex, 0)

  const second = getDiscoveryRotationState({
    nextLanguageBatchIndex: first.nextLanguageBatchIndex,
    nextRotationIndex: first.nextRotationIndex
  })
  assert.deepEqual(
    second.activeLanguages.map(language => language.id),
    ['german', 'mandarin']
  )
  assert.equal(second.nextLanguageBatchIndex, 2)
  assert.equal(second.nextRotationIndex, 0)

  const fourth = getDiscoveryRotationState({
    nextLanguageBatchIndex: 3,
    nextRotationIndex: 0
  })
  assert.deepEqual(
    fourth.activeLanguages.map(language => language.id),
    ['japanese', 'portuguese']
  )
  assert.equal(fourth.nextLanguageBatchIndex, 0)
  assert.equal(fourth.nextRotationIndex, 1)
})

test('YouTube quota date follows Pacific Time', () => {
  assert.equal(
    getYoutubeQuotaDate(new Date('2026-07-31T06:59:59Z')),
    '2026-07-30'
  )
  assert.equal(
    getYoutubeQuotaDate(new Date('2026-07-31T07:00:00Z')),
    '2026-07-31'
  )
})
