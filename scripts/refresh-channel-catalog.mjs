import { readFile, rename, writeFile } from 'node:fs/promises'
import vm from 'node:vm'

const SOURCE_PATH = new URL('../data/channel-catalog.source.json', import.meta.url)
const OUTPUT_PATH = new URL('../data/channel-catalog.json', import.meta.url)
const TEMP_OUTPUT_PATH = new URL('../data/channel-catalog.json.tmp', import.meta.url)
const LOCAL_CONFIG_PATH = new URL('../config.local.js', import.meta.url)
const YOUTUBE_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/
const YOUTUBE_HANDLE_RE = /^@[A-Za-z0-9._-]{3,30}$/
const RESOLVE_CONCURRENCY = 5
const CHANNEL_BATCH_SIZE = 50

let requestCount = 0

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT' && fallback !== null) return fallback
    throw error
  }
}

async function getYoutubeApiKey() {
  const environmentKey = String(
    process.env.YOUTUBE_CATALOG_API_KEY
    || process.env.YOUTUBE_API_KEY
    || ''
  ).trim()
  if (environmentKey) return environmentKey

  try {
    const source = await readFile(LOCAL_CONFIG_PATH, 'utf8')
    const sandbox = { window: {} }
    vm.runInNewContext(source, sandbox, { filename: 'config.local.js' })
    return String(sandbox.window?.EDENIA_CONFIG?.youtubeApiKey || '').trim()
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw new Error(`Could not read config.local.js: ${error.message}`)
    }
    return ''
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean)))
}

function normalizeSourceEntry(entry, index) {
  const catalogId = String(entry?.catalogId || '').trim()
  const youtubeInput = String(entry?.youtubeInput || '').trim()
  const name = String(entry?.name || '').trim()
  const languages = normalizeStringArray(entry?.languages)
  const levels = normalizeStringArray(entry?.levels)
  const aliases = normalizeStringArray(entry?.aliases)
  const youtubeChannelId = String(entry?.youtubeChannelId || '').trim()

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(catalogId)) {
    throw new Error(`Channel ${index + 1} has an invalid catalogId: ${catalogId || '(empty)'}`)
  }
  if (!youtubeInput && !YOUTUBE_CHANNEL_ID_RE.test(youtubeChannelId)) {
    throw new Error(`${catalogId} needs youtubeInput or youtubeChannelId`)
  }
  if (!name) throw new Error(`${catalogId} needs a fallback name`)
  if (!languages.length) throw new Error(`${catalogId} needs at least one language`)
  if (!levels.length) throw new Error(`${catalogId} needs at least one level`)

  return {
    catalogId,
    youtubeInput,
    youtubeChannelId: YOUTUBE_CHANNEL_ID_RE.test(youtubeChannelId) ? youtubeChannelId : '',
    name,
    languages,
    levels,
    style: String(entry?.style || '').trim(),
    description: String(entry?.description || '').trim(),
    aliases
  }
}

function validateSource(source) {
  if (source?.schemaVersion !== 1) {
    throw new Error('channel-catalog.source.json must use schemaVersion 1')
  }
  if (!Array.isArray(source.channels) || !source.channels.length) {
    throw new Error('channel-catalog.source.json must contain channels')
  }

  const channels = source.channels.map(normalizeSourceEntry)
  const catalogIds = new Set()
  channels.forEach(channel => {
    if (catalogIds.has(channel.catalogId)) {
      throw new Error(`Duplicate catalogId: ${channel.catalogId}`)
    }
    catalogIds.add(channel.catalogId)
  })
  return channels
}

function parseYoutubeInput(value) {
  const input = String(value || '').trim()
  if (YOUTUBE_CHANNEL_ID_RE.test(input)) return { channelId: input }
  if (YOUTUBE_HANDLE_RE.test(input)) return { handle: input.slice(1) }

  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`)
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '')
    if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return null
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (parts[0] === 'channel' && YOUTUBE_CHANNEL_ID_RE.test(parts[1] || '')) {
      return { channelId: parts[1] }
    }
    if (YOUTUBE_HANDLE_RE.test(parts[0] || '')) return { handle: parts[0].slice(1) }
    if (parts[0] === 'user' && parts[1]) return { username: parts[1] }
    if (parts[0] === 'c' && parts[1]) return { handle: parts[1] }
    if (parts.length === 1 && parts[0]) return { handle: parts[0] }
  } catch {
    return null
  }

  return null
}

async function fetchYoutube(apiKey, parameters) {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels')
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value))
  url.searchParams.set('key', apiKey)
  requestCount += 1

  const response = await fetch(url)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error?.message || `YouTube API returned HTTP ${response.status}`)
  }
  return data
}

async function mapWithConcurrency(items, concurrency, task) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await task(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

async function resolveChannelId(channel, previousByCatalogId, apiKey) {
  if (channel.youtubeChannelId) return { channelId: channel.youtubeChannelId, newlyResolved: false }

  const previousChannelId = String(previousByCatalogId.get(channel.catalogId)?.channelId || '')
  if (YOUTUBE_CHANNEL_ID_RE.test(previousChannelId)) {
    return { channelId: previousChannelId, newlyResolved: false }
  }

  const parsed = parseYoutubeInput(channel.youtubeInput)
  if (parsed?.channelId) return { channelId: parsed.channelId, newlyResolved: true }
  if (!parsed?.handle && !parsed?.username) {
    throw new Error(`${channel.catalogId} has an unsupported youtubeInput: ${channel.youtubeInput}`)
  }

  const data = await fetchYoutube(apiKey, {
    part: 'snippet',
    ...(parsed.username
      ? { forUsername: parsed.username }
      : { forHandle: parsed.handle }),
    maxResults: '1'
  })
  return {
    channelId: String(data.items?.[0]?.id || ''),
    newlyResolved: Boolean(data.items?.[0]?.id)
  }
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function getBestThumbnail(thumbnails = {}) {
  return thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || ''
}

function normalizeSearchText(values) {
  return values
    .filter(Boolean)
    .join(' ')
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function uniqueAliases(sourceChannel, youtubeName) {
  const values = [sourceChannel.name, ...sourceChannel.aliases]
  const seen = new Set([String(youtubeName || '').trim().toLocaleLowerCase('en')])
  return values.filter(value => {
    const normalized = String(value || '').trim().toLocaleLowerCase('en')
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

async function main() {
  const apiKey = await getYoutubeApiKey()
  if (!apiKey) {
    throw new Error(
      'Set YOUTUBE_CATALOG_API_KEY or YOUTUBE_API_KEY, or add youtubeApiKey to config.local.js'
    )
  }

  const source = await readJson(SOURCE_PATH)
  const channels = validateSource(source)
  const previous = await readJson(OUTPUT_PATH, { channels: [] })
  const previousByCatalogId = new Map(
    (Array.isArray(previous?.channels) ? previous.channels : [])
      .map(channel => [channel.catalogId, channel])
  )

  let newlyResolvedCount = 0
  const resolved = await mapWithConcurrency(channels, RESOLVE_CONCURRENCY, async channel => {
    const result = await resolveChannelId(channel, previousByCatalogId, apiKey)
    if (result.newlyResolved) newlyResolvedCount += 1
    return { ...channel, channelId: result.channelId }
  })

  const uniqueChannelIds = Array.from(new Set(
    resolved.map(channel => channel.channelId).filter(channelId => YOUTUBE_CHANNEL_ID_RE.test(channelId))
  ))
  const youtubeChannelsById = new Map()

  for (const ids of chunk(uniqueChannelIds, CHANNEL_BATCH_SIZE)) {
    const data = await fetchYoutube(apiKey, {
      part: 'snippet,status',
      id: ids.join(','),
      maxResults: String(CHANNEL_BATCH_SIZE)
    })
    ;(data.items || []).forEach(item => youtubeChannelsById.set(item.id, item))
  }

  const refreshedAt = new Date().toISOString()
  const generatedChannels = resolved.map(channel => {
    const youtubeChannel = youtubeChannelsById.get(channel.channelId)
    const previousChannel = previousByCatalogId.get(channel.catalogId) || {}
    const name = String(youtubeChannel?.snippet?.title || previousChannel.name || channel.name)
    const handle = String(youtubeChannel?.snippet?.customUrl || previousChannel.handle || '')
    const aliases = uniqueAliases(channel, name)
    const thumbnailUrl = getBestThumbnail(youtubeChannel?.snippet?.thumbnails)
      || String(previousChannel.thumbnailUrl || '')
    const available = Boolean(youtubeChannel)

    return {
      catalogId: channel.catalogId,
      channelId: channel.channelId || null,
      youtubeInput: channel.youtubeInput,
      handle,
      name,
      thumbnailUrl,
      languages: channel.languages,
      levels: channel.levels,
      style: channel.style,
      description: channel.description,
      aliases,
      available,
      privacyStatus: String(youtubeChannel?.status?.privacyStatus || previousChannel.privacyStatus || ''),
      publishedAt: youtubeChannel?.snippet?.publishedAt || previousChannel.publishedAt || null,
      refreshedAt,
      searchText: normalizeSearchText([
        name,
        handle,
        channel.youtubeInput,
        ...aliases,
        ...channel.languages,
        ...channel.levels,
        channel.style
      ])
    }
  })

  const output = {
    schemaVersion: 1,
    generatedAt: refreshedAt,
    sourceChannelCount: channels.length,
    availableChannelCount: generatedChannels.filter(channel => channel.available).length,
    channels: generatedChannels
  }

  await writeFile(TEMP_OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  await rename(TEMP_OUTPUT_PATH, OUTPUT_PATH)

  const unavailable = generatedChannels.filter(channel => !channel.available)
  console.log(
    `Refreshed ${generatedChannels.length} catalog channels with ${requestCount} YouTube API requests`
  )
  console.log(`Resolved ${newlyResolvedCount} new channel IDs; ${unavailable.length} channels unavailable`)
  unavailable.forEach(channel => {
    console.warn(`Unavailable: ${channel.catalogId} (${channel.youtubeInput})`)
  })
}

main().catch(error => {
  console.error(`Channel catalog refresh failed: ${error.message}`)
  process.exitCode = 1
})
