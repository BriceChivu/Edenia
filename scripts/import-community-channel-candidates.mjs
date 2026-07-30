import { readFile, rename, writeFile } from 'node:fs/promises'

const CANDIDATES_PATH = new URL('../data/channel-catalog.candidates.json', import.meta.url)
const CANDIDATES_TEMP_PATH = new URL('../data/channel-catalog.candidates.json.tmp', import.meta.url)
const COMMUNITY_PATH = new URL('../data/channel-catalog.community.json', import.meta.url)
const COMMUNITY_TEMP_PATH = new URL('../data/channel-catalog.community.json.tmp', import.meta.url)
const YOUTUBE_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/
const LOOKBACK_DAYS = Math.max(1, Number(process.env.COMMUNITY_CATALOG_LOOKBACK_DAYS) || 180)
const MINIMUM_DISTINCT_USERS = Math.max(
  1,
  Number(process.env.COMMUNITY_CATALOG_MIN_DISTINCT_USERS) || 2
)
const QUERY_LIMIT = 10000
const YOUTUBE_BATCH_SIZE = 50
const YOUTUBE_METADATA_MAX_AGE_MS = 30 * 24 * 60 * 60_000
let youtubeRequestCount = 0

function requiredEnvironmentValue(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean)))
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value
  return ['1', 'true', 'yes'].includes(String(value || '').toLocaleLowerCase('en'))
}

function normalizeTimestamp(value) {
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
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

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function queryCandidateEvents() {
  const posthogHost = String(process.env.POSTHOG_HOST || 'https://us.posthog.com').replace(/\/+$/, '')
  const projectId = encodeURIComponent(requiredEnvironmentValue('POSTHOG_PROJECT_ID'))
  const personalApiKey = requiredEnvironmentValue('POSTHOG_PERSONAL_API_KEY')
  const query = `
    SELECT
      distinct_id AS distinct_id,
      timestamp AS timestamp,
      properties.channel_id AS channel_id,
      properties.channel_name AS channel_name,
      properties.channel_thumbnail_url AS channel_thumbnail_url,
      properties.source AS source,
      properties.catalog_source AS catalog_source,
      properties.catalog_candidate AS catalog_candidate,
      properties.learning_languages AS learning_languages,
      properties.learner_level AS learner_level,
      properties.internal_or_test_user AS internal_or_test_user
    FROM events
    WHERE event = 'channel_added_via_add_button'
      AND timestamp >= now() - INTERVAL ${LOOKBACK_DAYS} DAY
    ORDER BY timestamp ASC
    LIMIT ${QUERY_LIMIT}
  `
  const response = await fetch(`${posthogHost}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${personalApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: {
        kind: 'HogQLQuery',
        query
      }
    })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.detail || data?.error || `PostHog API returned HTTP ${response.status}`)
  }

  const columns = Array.isArray(data.columns) ? data.columns.map(String) : []
  const results = Array.isArray(data.results) ? data.results : []
  if (results.length >= QUERY_LIMIT) {
    throw new Error(`PostHog candidate query reached its ${QUERY_LIMIT}-event safety limit`)
  }
  return results.map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]])))
}

function aggregateCandidateEvents(events) {
  const byChannelId = new Map()

  events.forEach(event => {
    const channelId = String(event.channel_id || '').trim()
    const source = String(event.source || '').trim()
    const catalogSource = String(event.catalog_source || '').trim()
    const explicitlyRejected = event.catalog_candidate !== null
      && event.catalog_candidate !== undefined
      && !parseBoolean(event.catalog_candidate)
    if (
      !YOUTUBE_CHANNEL_ID_RE.test(channelId)
      || parseBoolean(event.internal_or_test_user)
      || explicitlyRejected
      || ['curated', 'community', 'discovery'].includes(catalogSource)
      || ['community_catalog', 'youtube_discovery_catalog'].includes(source)
    ) return

    const timestamp = normalizeTimestamp(event.timestamp)
    const distinctId = String(event.distinct_id || '').trim()
    const entry = byChannelId.get(channelId) || {
      channelId,
      names: new Set(),
      thumbnailUrls: new Set(),
      languages: new Set(),
      levels: new Set(),
      sources: new Set(),
      distinctUsers: new Set(),
      addCount: 0,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp
    }
    entry.addCount += 1
    if (distinctId) entry.distinctUsers.add(distinctId)
    if (event.channel_name) entry.names.add(String(event.channel_name).trim())
    if (event.channel_thumbnail_url) entry.thumbnailUrls.add(String(event.channel_thumbnail_url).trim())
    normalizeStringArray(event.learning_languages).forEach(language => entry.languages.add(language))
    if (event.learner_level) entry.levels.add(String(event.learner_level).trim())
    if (source) entry.sources.add(source)
    if (timestamp && (!entry.firstSeenAt || timestamp < entry.firstSeenAt)) entry.firstSeenAt = timestamp
    if (timestamp && (!entry.lastSeenAt || timestamp > entry.lastSeenAt)) entry.lastSeenAt = timestamp
    byChannelId.set(channelId, entry)
  })

  return Array.from(byChannelId.values())
}

function needsYoutubeRefresh(previous) {
  const refreshedAt = new Date(previous?.metadataRefreshedAt || 0).getTime()
  return !previous?.name
    || !previous?.thumbnailUrl
    || !Number.isFinite(refreshedAt)
    || Date.now() - refreshedAt >= YOUTUBE_METADATA_MAX_AGE_MS
}

async function fetchYoutubeChannels(channelIds) {
  if (!channelIds.length) return new Map()
  const apiKey = requiredEnvironmentValue('YOUTUBE_CATALOG_API_KEY')
  const channelsById = new Map()

  for (const ids of chunk(channelIds, YOUTUBE_BATCH_SIZE)) {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels')
    url.searchParams.set('part', 'snippet,status')
    url.searchParams.set('id', ids.join(','))
    url.searchParams.set('maxResults', String(YOUTUBE_BATCH_SIZE))
    url.searchParams.set('key', apiKey)
    youtubeRequestCount += 1
    const response = await fetch(url)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.error?.message || `YouTube API returned HTTP ${response.status}`)
    }
    ;(data.items || []).forEach(item => channelsById.set(String(item.id), item))
  }
  return channelsById
}

function latestValue(values) {
  const items = Array.from(values || []).filter(Boolean)
  return items[items.length - 1] || ''
}

async function buildCandidates(aggregates, previousCandidates) {
  const previousById = new Map(
    (Array.isArray(previousCandidates?.channels) ? previousCandidates.channels : [])
      .map(channel => [channel.channelId, channel])
  )
  const refreshIds = aggregates
    .filter(candidate => needsYoutubeRefresh(previousById.get(candidate.channelId)))
    .map(candidate => candidate.channelId)
  const youtubeById = await fetchYoutubeChannels(refreshIds)
  const refreshedAt = new Date().toISOString()

  return aggregates.map(candidate => {
    const previous = previousById.get(candidate.channelId) || {}
    const youtube = youtubeById.get(candidate.channelId)
    const wasRefreshed = refreshIds.includes(candidate.channelId)
    const name = String(youtube?.snippet?.title || previous.name || latestValue(candidate.names) || candidate.channelId)
    const handle = String(youtube?.snippet?.customUrl || previous.handle || '')
    const thumbnailUrl = getBestThumbnail(youtube?.snippet?.thumbnails)
      || String(previous.thumbnailUrl || latestValue(candidate.thumbnailUrls))
    const aliases = normalizeStringArray([
      ...(previous.aliases || []),
      ...Array.from(candidate.names)
    ]).filter(alias => alias.toLocaleLowerCase('en') !== name.toLocaleLowerCase('en'))
    const languages = normalizeStringArray([
      ...(previous.languages || []),
      ...Array.from(candidate.languages)
    ])
    const levels = normalizeStringArray([
      ...(previous.levels || []),
      ...Array.from(candidate.levels)
    ])

    return {
      catalogId: `community-${candidate.channelId}`,
      channelId: candidate.channelId,
      handle,
      name,
      thumbnailUrl,
      languages,
      levels,
      style: String(previous.style || ''),
      description: String(previous.description || ''),
      aliases,
      available: wasRefreshed ? Boolean(youtube) : previous.available !== false,
      privacyStatus: String(youtube?.status?.privacyStatus || previous.privacyStatus || ''),
      publishedAt: youtube?.snippet?.publishedAt || previous.publishedAt || null,
      metadataRefreshedAt: wasRefreshed ? refreshedAt : previous.metadataRefreshedAt || null,
      addCount: candidate.addCount,
      distinctUserCount: candidate.distinctUsers.size,
      firstSeenAt: candidate.firstSeenAt,
      lastSeenAt: candidate.lastSeenAt,
      sources: Array.from(candidate.sources).sort(),
      searchText: normalizeSearchText([
        name,
        handle,
        ...aliases,
        ...languages,
        ...levels
      ])
    }
  }).sort((left, right) => left.name.localeCompare(right.name, 'en'))
}

function buildCommunityCatalog(candidates, previousCommunity) {
  const previousById = new Map(
    (Array.isArray(previousCommunity?.channels) ? previousCommunity.channels : [])
      .map(channel => [channel.channelId, channel])
  )
  const promotedAt = new Date().toISOString()

  candidates.forEach(candidate => {
    const previous = previousById.get(candidate.channelId)
    if (previous || (candidate.available && candidate.distinctUserCount >= MINIMUM_DISTINCT_USERS)) {
      previousById.set(candidate.channelId, {
        ...previous,
        ...candidate,
        promotedAt: previous?.promotedAt || promotedAt
      })
    }
  })

  return Array.from(previousById.values())
    .filter(channel => channel.available !== false)
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
}

function withStableGeneratedAt(previous, next) {
  const previousChannels = JSON.stringify(previous?.channels || [])
  const nextChannels = JSON.stringify(next.channels)
  return {
    ...next,
    generatedAt: previousChannels === nextChannels
      ? previous?.generatedAt || null
      : new Date().toISOString()
  }
}

async function writeJsonAtomically(path, tempPath, value) {
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tempPath, path)
}

async function main() {
  const previousCandidates = await readJson(CANDIDATES_PATH, { channels: [] })
  const previousCommunity = await readJson(COMMUNITY_PATH, { channels: [] })
  const events = await queryCandidateEvents()
  const aggregates = aggregateCandidateEvents(events)
  const candidates = await buildCandidates(aggregates, previousCandidates)
  const communityChannels = buildCommunityCatalog(candidates, previousCommunity)
  const candidateOutput = withStableGeneratedAt(previousCandidates, {
    schemaVersion: 1,
    lookbackDays: LOOKBACK_DAYS,
    channels: candidates
  })
  const communityOutput = withStableGeneratedAt(previousCommunity, {
    schemaVersion: 1,
    minimumDistinctUsers: MINIMUM_DISTINCT_USERS,
    channels: communityChannels
  })

  await writeJsonAtomically(CANDIDATES_PATH, CANDIDATES_TEMP_PATH, candidateOutput)
  await writeJsonAtomically(COMMUNITY_PATH, COMMUNITY_TEMP_PATH, communityOutput)

  console.log(`Processed ${events.length} add events into ${candidates.length} verified candidates`)
  console.log(`Published ${communityChannels.length} community channels with ${youtubeRequestCount} YouTube requests`)
}

main().catch(error => {
  console.error(`Community catalog import failed: ${error.message}`)
  process.exitCode = 1
})
