import test from 'node:test'
import assert from 'node:assert/strict'
import { selectDiscoveryRecommendations } from '../../src/features/channels/discovery-recommendations.js'

const channel = (id, languages = ['mandarin']) => ({ channelId: id, languages })
const additions = (id, count) => Array.from({ length: count }, (_, index) => ({ channelId: id, learnerId: `other-${index}` }))
const select = overrides => selectDiscoveryRecommendations({ learnerId: 'recipient', learningLanguages: ['mandarin'], ...overrides })

test('never fills empty slots with another language, owned channels, or previously deleted channels', () => {
  const channels = [channel('owned'), channel('deleted'), channel('english', ['english']), channel('eligible')]
  assert.deepEqual(select({ channels, ownedChannelIds: ['owned'], previouslyDeletedChannelIds: ['deleted'],
    learnerAdditions: [...additions('owned', 100), ...additions('deleted', 99), ...additions('english', 98)] }), [channels[3]])
  assert.deepEqual(select({ channels, learningLanguages: [] }), [])
})

test('non-onboarding channels precede even more popular onboarding channels, which only fill remaining slots', () => {
  const channels = ['starter-popular', 'outside-less-popular', 'outside-popular', 'starter-other'].map(id => channel(id))
  const args = { channels, onboardingChannelIds: ['starter-popular', 'starter-other'], learnerAdditions: [
    ...additions('starter-popular', 100), ...additions('starter-other', 80),
    ...additions('outside-popular', 10), ...additions('outside-less-popular', 2)] }
  assert.deepEqual(select({ ...args, limit: 2 }).map(c => c.channelId), ['outside-popular', 'outside-less-popular'])
  assert.deepEqual(select({ ...args, limit: 3 }).map(c => c.channelId), ['outside-popular', 'outside-less-popular', 'starter-popular'])
})

test('popularity counts distinct other learners, excluding the recipient and repeated adds', () => {
  const channels = [channel('repeated'), channel('two-others')]
  const learnerAdditions = [
    ...Array.from({ length: 30 }, () => ({ channelId: 'repeated', learnerId: 'recipient' })),
    ...Array.from({ length: 20 }, () => ({ channelId: 'repeated', learnerId: 'one-peer' })),
    ...additions('two-others', 2)]
  assert.deepEqual(select({ channels, learnerAdditions }).map(c => c.channelId), ['two-others', 'repeated'])
})

test('duplicates do not occupy slots, multiple selected languages work, and ties are stable', () => {
  const channels = [channel('b'), channel('a'), channel('a'), channel('c', ['spanish']), channel('d', ['english'])]
  assert.deepEqual(select({ channels, learningLanguages: ['mandarin', 'spanish'] }).map(c => c.channelId), ['a', 'b', 'c'])
  assert.deepEqual(select({ channels: [...channels].reverse(), learningLanguages: ['mandarin', 'spanish'] }).map(c => c.channelId), ['a', 'b', 'c'])
})
