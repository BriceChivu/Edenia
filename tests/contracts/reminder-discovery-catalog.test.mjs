import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  validateReminderDiscoveryChannels
} from '../../scripts/validate-reminder-discovery-channels.mjs'

const sourceUrl = new URL('../../data/reminder-discovery-channels.json', import.meta.url)
const catalogUrl = new URL('../../data/channel-catalog.json', import.meta.url)

async function fixtures() {
  return Promise.all([
    readFile(sourceUrl, 'utf8').then(JSON.parse),
    readFile(catalogUrl, 'utf8').then(JSON.parse)
  ])
}

test('reviewed reminder discovery channels match the curated source exactly', async () => {
  const [source, catalog] = await fixtures()
  assert.equal(validateReminderDiscoveryChannels(source, catalog), source)
  assert.deepEqual(
    new Set(source.channels.map(channel => channel.learningLanguage)),
    new Set(['mandarin', 'japanese', 'korean', 'spanish', 'french', 'german', 'english'])
  )
})

test('reviewed discovery source rejects duplicates, drift, and unsupported fields', async () => {
  const [source, catalog] = await fixtures()
  const invalidSources = [
    { ...source, schemaVersion: 2 },
    { ...source, channels: [...source.channels, source.channels[0]] },
    {
      ...source,
      channels: source.channels.map((channel, index) => index === 0
        ? { ...channel, channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa' }
        : channel)
    },
    {
      ...source,
      channels: source.channels.map((channel, index) => index === 0
        ? { ...channel, email: 'unsafe@example.test' }
        : channel)
    }
  ]

  for (const invalid of invalidSources) {
    assert.throws(() => validateReminderDiscoveryChannels(invalid, catalog))
  }
})
