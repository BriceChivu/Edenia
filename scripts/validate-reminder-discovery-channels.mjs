import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const SOURCE_URL = new URL('../data/reminder-discovery-channels.json', import.meta.url)
const CATALOG_URL = new URL('../data/channel-catalog.json', import.meta.url)
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{20,}$/
const LANGUAGES = new Set([
  'mandarin',
  'japanese',
  'korean',
  'spanish',
  'french',
  'german',
  'english'
])
const EXACT_FIELDS = [
  'catalogId',
  'channelId',
  'learningLanguage',
  'name',
  'summary'
]

function readText(value, field, index, maximumLength) {
  if (typeof value !== 'string' || value !== value.trim()) {
    throw new Error(`Reminder discovery channel ${index + 1} has an invalid ${field}`)
  }
  if (value.length < 1 || value.length > maximumLength) {
    throw new Error(`Reminder discovery channel ${index + 1} has an invalid ${field}`)
  }
  return value
}

export function validateReminderDiscoveryChannels(source, catalog) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Reminder discovery source must be an object')
  }
  if (source.schemaVersion !== 1 || !Array.isArray(source.channels)) {
    throw new Error('Reminder discovery source must use schemaVersion 1 with channels')
  }
  if (!catalog || !Array.isArray(catalog.channels)) {
    throw new Error('Curated channel catalog is unavailable')
  }

  const curatedById = new Map(catalog.channels.map(channel => [channel.catalogId, channel]))
  const catalogIds = new Set()
  const channelIds = new Set()

  source.channels.forEach((channel, index) => {
    if (!channel || typeof channel !== 'object' || Array.isArray(channel)) {
      throw new Error(`Reminder discovery channel ${index + 1} must be an object`)
    }
    const fields = Object.keys(channel).sort()
    if (JSON.stringify(fields) !== JSON.stringify([...EXACT_FIELDS].sort())) {
      throw new Error(`Reminder discovery channel ${index + 1} has unsupported fields`)
    }
    const catalogId = readText(channel.catalogId, 'catalogId', index, 100)
    const channelId = readText(channel.channelId, 'channelId', index, 100)
    const language = readText(channel.learningLanguage, 'learningLanguage', index, 20)
    const name = readText(channel.name, 'name', index, 200)
    readText(channel.summary, 'summary', index, 300)
    if (!CHANNEL_ID_PATTERN.test(channelId)) {
      throw new Error(`Reminder discovery channel ${index + 1} has an invalid channelId`)
    }
    if (!LANGUAGES.has(language)) {
      throw new Error(`Reminder discovery channel ${index + 1} has an unsupported language`)
    }
    if (catalogIds.has(catalogId) || channelIds.has(channelId)) {
      throw new Error(`Reminder discovery source contains a duplicate channel`)
    }
    catalogIds.add(catalogId)
    channelIds.add(channelId)

    const curated = curatedById.get(catalogId)
    if (
      !curated
      || curated.available === false
      || curated.channelId !== channelId
      || curated.name !== name
      || !curated.languages?.includes(language)
    ) {
      throw new Error(`Reminder discovery channel ${catalogId} does not match the curated catalog`)
    }
  })

  return source
}

export async function main() {
  const [source, catalog] = await Promise.all([
    readFile(SOURCE_URL, 'utf8').then(JSON.parse),
    readFile(CATALOG_URL, 'utf8').then(JSON.parse)
  ])
  validateReminderDiscoveryChannels(source, catalog)
  console.log(`Validated reminder discovery channels (${source.channels.length} channels)`)
}

function isMainModule() {
  return Boolean(process.argv[1])
    && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) await main()
