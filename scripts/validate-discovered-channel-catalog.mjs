import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DISCOVERED_PATH = 'data/channel-catalog.discovered.json'
const OTHER_CATALOG_PATHS = [
  'data/channel-catalog.source.json',
  'data/channel-catalog.json',
  'data/channel-catalog.community.json'
]
const YOUTUBE_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/
const DEFAULT_MAX_ADDITIONS = 48
const DEFAULT_MIN_SUBSCRIBERS = 100
const DEFAULT_MIN_VIDEOS = 10
const STABLE_DISCOVERY_FIELDS = [
  'catalogId',
  'channelId',
  'youtubeInput',
  'languages',
  'levels',
  'style',
  'aliases',
  'discoveryScore',
  'discoveredByQueries',
  'discoveredAt'
]

function requiredInteger(value, fallback, label, minimum = 0) {
  const candidate = String(value ?? '').trim()
  const parsed = candidate ? Number(candidate) : fallback
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer greater than or equal to ${minimum}.`)
  }
  return parsed
}

function requiredText(value, label) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${label} is required.`)
  return text
}

function normalizedText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizedHandle(value) {
  return normalizedText(String(value || '').trim().replace(/^@/, ''))
}

function assertUniqueStrings(value, label, options = {}) {
  if (!Array.isArray(value) || (options.allowEmpty !== true && !value.length)) {
    throw new Error(`${label} must be ${options.allowEmpty === true ? 'an' : 'a non-empty'} array.`)
  }
  const normalized = value.map((item, index) => (
    requiredText(item, `${label} item ${index + 1}`).toLocaleLowerCase('en')
  ))
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} must not contain duplicates.`)
  }
}

function assertIsoTimestamp(value, label) {
  const text = requiredText(value, label)
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp.`)
}

function assertNonNegativeCount(value, label) {
  const text = String(value ?? '').trim()
  if (!/^\d+$/.test(text)) throw new Error(`${label} must be a non-negative integer string.`)
  return Number(text)
}

export function validateDiscoveredCatalogShape(catalog) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new Error('Discovered catalog must contain a JSON object.')
  }
  if (catalog.schemaVersion !== 1) {
    throw new Error('Discovered catalog must use schemaVersion 1.')
  }
  assertIsoTimestamp(catalog.generatedAt, 'generatedAt')
  const rotationCount = requiredInteger(catalog.rotationCount, NaN, 'rotationCount', 1)
  const lastRotationIndex = requiredInteger(
    catalog.lastRotationIndex,
    NaN,
    'lastRotationIndex'
  )
  const nextRotationIndex = requiredInteger(
    catalog.nextRotationIndex,
    NaN,
    'nextRotationIndex'
  )
  if (lastRotationIndex >= rotationCount || nextRotationIndex >= rotationCount) {
    throw new Error('Discovery rotation indexes must be smaller than rotationCount.')
  }
  assertUniqueStrings(catalog.languages, 'languages')
  if (!Array.isArray(catalog.channels)) throw new Error('channels must be an array.')

  const allowedLanguages = new Set(catalog.languages)
  const catalogIds = new Set()
  const channelIds = new Set()
  const handles = new Set()
  catalog.channels.forEach((channel, index) => {
    const prefix = `Discovered channel ${index + 1}`
    if (!channel || typeof channel !== 'object' || Array.isArray(channel)) {
      throw new Error(`${prefix} must be an object.`)
    }
    const channelId = requiredText(channel.channelId, `${prefix} channelId`)
    if (!YOUTUBE_CHANNEL_ID_RE.test(channelId)) {
      throw new Error(`${prefix} has an invalid YouTube channelId.`)
    }
    const catalogId = requiredText(channel.catalogId, `${prefix} catalogId`)
    if (catalogId !== `discovered-${channelId}`) {
      throw new Error(`${prefix} catalogId must be derived from its channelId.`)
    }
    requiredText(channel.youtubeInput, `${prefix} youtubeInput`)
    requiredText(channel.name, `${prefix} name`)
    requiredText(channel.style, `${prefix} style`)
    requiredText(channel.searchText, `${prefix} searchText`)
    if (typeof channel.available !== 'boolean') {
      throw new Error(`${prefix} available must be a boolean.`)
    }
    requiredText(channel.privacyStatus, `${prefix} privacyStatus`)
    if (!/^https:\/\//i.test(String(channel.thumbnailUrl || ''))) {
      throw new Error(`${prefix} must contain an HTTPS thumbnailUrl.`)
    }
    assertUniqueStrings(channel.languages, `${prefix} languages`)
    channel.languages.forEach(language => {
      if (!allowedLanguages.has(language)) {
        throw new Error(`${prefix} contains unsupported language ${language}.`)
      }
    })
    assertUniqueStrings(channel.levels, `${prefix} levels`, { allowEmpty: true })
    assertUniqueStrings(channel.aliases, `${prefix} aliases`, { allowEmpty: true })
    assertUniqueStrings(
      channel.discoveredByQueries,
      `${prefix} discoveredByQueries`
    )
    assertIsoTimestamp(channel.discoveredAt, `${prefix} discoveredAt`)
    assertIsoTimestamp(channel.refreshedAt, `${prefix} refreshedAt`)
    assertNonNegativeCount(channel.videoCount, `${prefix} videoCount`)
    if (String(channel.subscriberCount ?? '').trim()) {
      assertNonNegativeCount(channel.subscriberCount, `${prefix} subscriberCount`)
    }
    if (!Number.isFinite(channel.discoveryScore) || channel.discoveryScore < 0) {
      throw new Error(`${prefix} discoveryScore must be a non-negative number.`)
    }

    const normalizedCatalogId = catalogId.toLocaleLowerCase('en')
    if (catalogIds.has(normalizedCatalogId)) {
      throw new Error(`Discovered catalog contains duplicate catalogId ${catalogId}.`)
    }
    if (channelIds.has(channelId)) {
      throw new Error(`Discovered catalog contains duplicate channelId ${channelId}.`)
    }
    const handle = normalizedHandle(channel.handle)
    if (handle && handles.has(handle)) {
      throw new Error(`Discovered catalog contains duplicate handle ${channel.handle}.`)
    }
    catalogIds.add(normalizedCatalogId)
    channelIds.add(channelId)
    if (handle) handles.add(handle)
  })

  return catalog
}

function collectKnownIdentities(catalogs) {
  const known = {
    channelIds: new Set(),
    handles: new Set(),
    names: new Set()
  }
  catalogs.forEach(catalog => {
    ;(catalog?.channels || []).forEach(channel => {
      const channelId = String(channel?.channelId || '').trim()
      const youtubeInput = String(channel?.youtubeInput || '').trim()
      if (YOUTUBE_CHANNEL_ID_RE.test(channelId)) known.channelIds.add(channelId)
      if (YOUTUBE_CHANNEL_ID_RE.test(youtubeInput)) known.channelIds.add(youtubeInput)
      const urlChannelId = youtubeInput.match(
        /youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/i
      )?.[1]
      if (urlChannelId) known.channelIds.add(urlChannelId)
      const handle = normalizedHandle(channel?.handle || youtubeInput)
      const name = normalizedText(channel?.name)
      if (handle) known.handles.add(handle)
      if (name) known.names.add(name)
    })
  })
  return known
}

export function validateDiscoveredCatalogDelta({
  baseCatalog,
  currentCatalog,
  otherCatalogs = [],
  maxAdditions = DEFAULT_MAX_ADDITIONS,
  minSubscribers = DEFAULT_MIN_SUBSCRIBERS,
  minVideos = DEFAULT_MIN_VIDEOS
}) {
  validateDiscoveredCatalogShape(baseCatalog)
  validateDiscoveredCatalogShape(currentCatalog)
  const maximum = requiredInteger(maxAdditions, DEFAULT_MAX_ADDITIONS, 'maxAdditions')
  const subscriberMinimum = requiredInteger(
    minSubscribers,
    DEFAULT_MIN_SUBSCRIBERS,
    'minSubscribers'
  )
  const videoMinimum = requiredInteger(minVideos, DEFAULT_MIN_VIDEOS, 'minVideos', 1)

  if (currentCatalog.rotationCount !== baseCatalog.rotationCount) {
    throw new Error('Automated discovery may not change rotationCount.')
  }
  if (JSON.stringify(currentCatalog.languages) !== JSON.stringify(baseCatalog.languages)) {
    throw new Error('Automated discovery may not change the configured languages.')
  }
  if (currentCatalog.lastRotationIndex !== baseCatalog.nextRotationIndex) {
    throw new Error('lastRotationIndex must continue from the previous nextRotationIndex.')
  }
  const expectedNext = (baseCatalog.nextRotationIndex + 1) % baseCatalog.rotationCount
  if (currentCatalog.nextRotationIndex !== expectedNext) {
    throw new Error(`nextRotationIndex must advance to ${expectedNext}.`)
  }

  const baseById = new Map(baseCatalog.channels.map(channel => [channel.channelId, channel]))
  const currentById = new Map(
    currentCatalog.channels.map(channel => [channel.channelId, channel])
  )
  const removed = baseCatalog.channels.filter(channel => !currentById.has(channel.channelId))
  if (removed.length) {
    throw new Error(
      `Automated discovery may not remove channels: ${removed.map(channel => channel.channelId).join(', ')}`
    )
  }

  baseById.forEach((baseChannel, channelId) => {
    const currentChannel = currentById.get(channelId)
    STABLE_DISCOVERY_FIELDS.forEach(field => {
      if (JSON.stringify(currentChannel[field]) !== JSON.stringify(baseChannel[field])) {
        throw new Error(
          `Automated discovery may not change ${field} for existing channel ${channelId}.`
        )
      }
    })
  })

  const additions = currentCatalog.channels.filter(channel => !baseById.has(channel.channelId))
  if (additions.length > maximum) {
    throw new Error(
      `Discovery added ${additions.length} channels, exceeding the limit of ${maximum}.`
    )
  }

  const known = collectKnownIdentities(otherCatalogs)
  additions.forEach(channel => {
    if (channel.available !== true || channel.privacyStatus !== 'public') {
      throw new Error(`New discovered channel ${channel.channelId} must be publicly available.`)
    }
    const handle = normalizedHandle(channel.handle || channel.youtubeInput)
    const name = normalizedText(channel.name)
    if (known.channelIds.has(channel.channelId)) {
      throw new Error(`New discovered channel ${channel.channelId} already exists in another catalog.`)
    }
    if (handle && known.handles.has(handle)) {
      throw new Error(`New discovered handle ${channel.handle || channel.youtubeInput} already exists in another catalog.`)
    }
    if (name && known.names.has(name)) {
      throw new Error(`New discovered channel name ${channel.name} already exists in another catalog.`)
    }
    const videos = assertNonNegativeCount(
      channel.videoCount,
      `New discovered channel ${channel.channelId} videoCount`
    )
    if (videos < videoMinimum) {
      throw new Error(`New discovered channel ${channel.channelId} has fewer than ${videoMinimum} videos.`)
    }
    const subscribers = String(channel.subscriberCount ?? '').trim()
    if (subscribers && Number(subscribers) < subscriberMinimum) {
      throw new Error(
        `New discovered channel ${channel.channelId} has fewer than ${subscriberMinimum} subscribers.`
      )
    }
  })

  return {
    additions: additions.length,
    existing: baseCatalog.channels.length,
    total: currentCatalog.channels.length
  }
}

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(String(result.stderr || '').trim() || `git ${args[0]} failed.`)
  }
  return String(result.stdout || '').trim()
}

function parseArgs(argv, environment = process.env) {
  const options = {
    maxAdditions: environment.DISCOVERY_MAX_TOTAL_ADDITIONS,
    minSubscribers: environment.DISCOVERY_MIN_SUBSCRIBERS,
    minVideos: environment.DISCOVERY_MIN_VIDEOS
  }
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (value === undefined) throw new Error(`Missing value for ${flag || '(empty argument)'}.`)
    if (flag === '--base-ref') options.baseRef = value
    else if (flag === '--max-additions') options.maxAdditions = value
    else throw new Error(`Unknown argument: ${flag}`)
  }
  options.baseRef = requiredText(options.baseRef, '--base-ref')
  return options
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const changedPaths = runGit(['diff', '--name-only', options.baseRef, '--'])
    .split(/\r?\n/)
    .filter(Boolean)
  if (
    !changedPaths.includes(DISCOVERED_PATH)
    || changedPaths.some(path => path !== DISCOVERED_PATH)
  ) {
    throw new Error(
      `Automated discovery must change only ${DISCOVERED_PATH}; found: ${changedPaths.join(', ') || 'no files'}`
    )
  }

  const baseCatalog = JSON.parse(
    runGit(['show', `${options.baseRef}:${DISCOVERED_PATH}`])
  )
  const [currentCatalog, ...otherCatalogs] = await Promise.all([
    readJson(DISCOVERED_PATH),
    ...OTHER_CATALOG_PATHS.map(readJson)
  ])
  const result = validateDiscoveredCatalogDelta({
    baseCatalog,
    currentCatalog,
    otherCatalogs,
    maxAdditions: options.maxAdditions,
    minSubscribers: options.minSubscribers,
    minVideos: options.minVideos
  })
  console.log(
    `Validated discovery delta (${result.additions} added, ${result.existing} existing, ${result.total} total).`
  )
}

function isMainModule() {
  return Boolean(process.argv[1])
    && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
