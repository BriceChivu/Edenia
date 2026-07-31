import { readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ALLOWED_COMMUNITY_CANDIDATE_SOURCES,
  buildCommunityCatalog,
  collectCatalogIdentities,
  collectSupportedLanguages,
  findCatalogIdentityMatch,
  isYoutubeChannelId,
  normalizeStringArray,
  normalizeText,
  parseCommunityMaximumPromotions,
  parseBoolean
} from './community-channel-catalog-policy.mjs'

const SOURCE_PATH = new URL('../data/channel-catalog.source.json', import.meta.url)
const GENERATED_PATH = new URL('../data/channel-catalog.json', import.meta.url)
const DISCOVERED_PATH = new URL('../data/channel-catalog.discovered.json', import.meta.url)
const CANDIDATES_PATH = new URL('../data/channel-catalog.candidates.json', import.meta.url)
const CANDIDATES_TEMP_PATH = new URL('../data/channel-catalog.candidates.json.tmp', import.meta.url)
const COMMUNITY_PATH = new URL('../data/channel-catalog.community.json', import.meta.url)
const COMMUNITY_TEMP_PATH = new URL('../data/channel-catalog.community.json.tmp', import.meta.url)
const LOOKBACK_DAYS = Math.max(1, Number(process.env.COMMUNITY_CATALOG_LOOKBACK_DAYS) || 180)
const MINIMUM_DISTINCT_USERS = Math.max(
  1,
  Number(process.env.COMMUNITY_CATALOG_MIN_DISTINCT_USERS) || 2
)
const MAXIMUM_PROMOTIONS = parseCommunityMaximumPromotions(
  process.env.COMMUNITY_CATALOG_MAX_PROMOTIONS
)
const QUERY_LIMIT = 10000
const YOUTUBE_BATCH_SIZE = 50
const YOUTUBE_METADATA_MAX_AGE_MS = 30 * 24 * 60 * 60_000
let youtubeRequestCount = 0

function requiredEnvironmentValue(name, environment = process.env) {
  const value = String(environment[name] || '').trim()
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

function normalizeTimestamp(value) {
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
}

function getBestThumbnail(thumbnails = {}) {
  return thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || ''
}

function normalizeSearchText(values) {
  return normalizeText(values.filter(Boolean).join(' '))
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export async function queryCandidateEvents(options = {}) {
  const environment = options.environment || process.env
  const request = options.fetch || fetch
  const lookbackDays = Math.max(
    1,
    Number(options.lookbackDays || environment.COMMUNITY_CATALOG_LOOKBACK_DAYS) || LOOKBACK_DAYS
  )
  const posthogHost = String(environment.POSTHOG_HOST || 'https://us.posthog.com').replace(/\/+$/, '')
  const projectId = encodeURIComponent(
    options.projectId || requiredEnvironmentValue('POSTHOG_PROJECT_ID', environment)
  )
  const personalApiKey = options.personalApiKey
    || requiredEnvironmentValue('POSTHOG_PERSONAL_API_KEY', environment)
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
      AND timestamp >= now() - INTERVAL ${lookbackDays} DAY
    ORDER BY timestamp ASC
    LIMIT ${QUERY_LIMIT}
  `
  const response = await request(`${posthogHost}/api/projects/${projectId}/query/`, {
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

function addExclusion(exclusions, input, reason, details = {}) {
  const channelId = String(input?.channel_id || input?.channelId || '').trim()
  const name = String(input?.channel_name || input?.name || channelId || 'Unknown channel').trim()
  const firstTimestamp = normalizeTimestamp(input?.firstSeenAt || input?.timestamp)
  const lastTimestamp = normalizeTimestamp(input?.lastSeenAt || input?.timestamp)
  const key = `${channelId || normalizeText(name) || 'unknown'}:${reason}`
  const exclusion = exclusions.get(key) || {
    channelId,
    name,
    reason,
    eventCount: 0,
    firstSeenAt: firstTimestamp,
    lastSeenAt: lastTimestamp,
    existingCatalogId: String(details.existingCatalogId || '').trim()
  }
  exclusion.eventCount += Math.max(1, Number(input?.eventCount) || 1)
  if (
    firstTimestamp
    && (!exclusion.firstSeenAt || firstTimestamp < exclusion.firstSeenAt)
  ) {
    exclusion.firstSeenAt = firstTimestamp
  }
  if (
    lastTimestamp
    && (!exclusion.lastSeenAt || lastTimestamp > exclusion.lastSeenAt)
  ) {
    exclusion.lastSeenAt = lastTimestamp
  }
  exclusions.set(key, exclusion)
}

function finalizeExclusions(exclusions) {
  return Array.from(exclusions.values()).sort((left, right) => (
    left.name.localeCompare(right.name, 'en') || left.reason.localeCompare(right.reason, 'en')
  ))
}

export function aggregateCandidateEvents(events, options = {}) {
  const identities = options.identities
    || collectCatalogIdentities(options.knownCatalogs || [])
  const byChannelId = new Map()
  const exclusions = new Map()

  events.forEach(event => {
    const channelId = String(event.channel_id || '').trim()
    const source = String(event.source || '').trim()
    const catalogSource = String(event.catalog_source || '').trim()
    const knownMatch = findCatalogIdentityMatch({ channelId }, identities)

    if (!isYoutubeChannelId(channelId)) {
      addExclusion(exclusions, event, 'invalid_channel_id')
      return
    }
    if (parseBoolean(event.internal_or_test_user)) {
      addExclusion(exclusions, event, 'internal_or_test_event')
      return
    }
    if (knownMatch) {
      addExclusion(exclusions, event, 'already_in_catalog', {
        existingCatalogId: knownMatch.identity.catalogId
      })
      return
    }
    if (!parseBoolean(event.catalog_candidate)) {
      addExclusion(exclusions, event, 'missing_positive_candidate_provenance')
      return
    }
    if (catalogSource) {
      addExclusion(exclusions, event, 'catalog_selection')
      return
    }
    if (!ALLOWED_COMMUNITY_CANDIDATE_SOURCES.includes(source)) {
      addExclusion(exclusions, event, 'unsupported_source')
      return
    }

    const distinctId = String(event.distinct_id || '').trim()
    if (!distinctId) {
      addExclusion(exclusions, event, 'missing_distinct_user')
      return
    }

    const timestamp = normalizeTimestamp(event.timestamp)
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
    entry.distinctUsers.add(distinctId)
    if (event.channel_name) entry.names.add(String(event.channel_name).trim())
    if (event.channel_thumbnail_url) entry.thumbnailUrls.add(String(event.channel_thumbnail_url).trim())
    normalizeStringArray(event.learning_languages).forEach(language => entry.languages.add(language))
    if (event.learner_level) entry.levels.add(String(event.learner_level).trim())
    entry.sources.add(source)
    if (timestamp && (!entry.firstSeenAt || timestamp < entry.firstSeenAt)) entry.firstSeenAt = timestamp
    if (timestamp && (!entry.lastSeenAt || timestamp > entry.lastSeenAt)) entry.lastSeenAt = timestamp
    byChannelId.set(channelId, entry)
  })

  return {
    aggregates: Array.from(byChannelId.values()),
    exclusions: finalizeExclusions(exclusions)
  }
}

function needsYoutubeRefresh(previous, nowMs = Date.now()) {
  const refreshedAt = new Date(previous?.metadataRefreshedAt || 0).getTime()
  return !previous?.name
    || !previous?.thumbnailUrl
    || !Number.isFinite(refreshedAt)
    || nowMs - refreshedAt >= YOUTUBE_METADATA_MAX_AGE_MS
}

export async function fetchYoutubeChannels(channelIds, options = {}) {
  if (!channelIds.length) return new Map()
  const environment = options.environment || process.env
  const request = options.fetch || fetch
  const apiKey = options.apiKey || requiredEnvironmentValue('YOUTUBE_CATALOG_API_KEY', environment)
  const channelsById = new Map()

  for (const ids of chunk(channelIds, YOUTUBE_BATCH_SIZE)) {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels')
    url.searchParams.set('part', 'snippet,status')
    url.searchParams.set('id', ids.join(','))
    url.searchParams.set('maxResults', String(YOUTUBE_BATCH_SIZE))
    url.searchParams.set('key', apiKey)
    youtubeRequestCount += 1
    const response = await request(url)
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

export async function buildCandidates(aggregates, previousCandidates, options = {}) {
  const previousById = new Map(
    (Array.isArray(previousCandidates?.channels) ? previousCandidates.channels : [])
      .map(channel => [channel.channelId, channel])
  )
  const now = String(options.now || new Date().toISOString())
  const nowMs = new Date(now).getTime()
  const refreshIds = aggregates
    .filter(candidate => needsYoutubeRefresh(previousById.get(candidate.channelId), nowMs))
    .map(candidate => candidate.channelId)
  const youtubeById = options.youtubeById instanceof Map
    ? options.youtubeById
    : await (options.fetchChannels || fetchYoutubeChannels)(refreshIds, options)
  const identities = options.identities
    || collectCatalogIdentities(options.knownCatalogs || [])
  const exclusions = new Map()
  const candidates = []

  aggregates.forEach(candidate => {
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
    const available = wasRefreshed ? Boolean(youtube) : previous.available === true
    const privacyStatus = String(youtube?.status?.privacyStatus || previous.privacyStatus || '')
    const identityCandidate = {
      channelId: candidate.channelId,
      handle,
      name
    }
    const identityMatch = findCatalogIdentityMatch(identityCandidate, identities)
    if (identityMatch) {
      addExclusion(exclusions, {
        ...identityCandidate,
        eventCount: candidate.addCount,
        firstSeenAt: candidate.firstSeenAt,
        lastSeenAt: candidate.lastSeenAt
      }, 'already_in_catalog', {
        existingCatalogId: identityMatch.identity.catalogId
      })
      return
    }
    if (!available || privacyStatus !== 'public') {
      addExclusion(exclusions, {
        ...identityCandidate,
        eventCount: candidate.addCount,
        firstSeenAt: candidate.firstSeenAt,
        lastSeenAt: candidate.lastSeenAt
      }, 'not_publicly_available')
      return
    }

    const nameMatch = findCatalogIdentityMatch(identityCandidate, identities, {
      includeName: true
    })
    const reviewReasons = nameMatch?.field === 'name'
      ? ['name_matches_existing_catalog']
      : []
    candidates.push({
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
      available,
      privacyStatus,
      publishedAt: youtube?.snippet?.publishedAt || previous.publishedAt || null,
      metadataRefreshedAt: wasRefreshed ? now : previous.metadataRefreshedAt || null,
      addCount: candidate.addCount,
      distinctUserCount: candidate.distinctUsers.size,
      firstSeenAt: candidate.firstSeenAt,
      lastSeenAt: candidate.lastSeenAt,
      sources: Array.from(candidate.sources).sort(),
      reviewReasons,
      searchText: normalizeSearchText([
        name,
        handle,
        ...aliases,
        ...languages,
        ...levels
      ])
    })
  })

  return {
    candidates: candidates.sort((left, right) => left.name.localeCompare(right.name, 'en')),
    exclusions: finalizeExclusions(exclusions)
  }
}

export function withStableGeneratedAt(previous, next, now = new Date().toISOString()) {
  const previousChannels = JSON.stringify(previous?.channels || [])
  const nextChannels = JSON.stringify(next.channels)
  return {
    ...next,
    generatedAt: previousChannels === nextChannels
      ? previous?.generatedAt || null
      : now
  }
}

async function writeJsonAtomically(path, tempPath, value) {
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tempPath, path)
}

export async function importCommunityChannelCandidates(options = {}) {
  youtubeRequestCount = 0
  const now = String(options.now || new Date().toISOString())
  const [
    sourceCatalog,
    generatedCatalog,
    discoveredCatalog,
    previousCandidates,
    previousCommunity
  ] = await Promise.all([
    readJson(SOURCE_PATH, { channels: [] }),
    readJson(GENERATED_PATH, { channels: [] }),
    readJson(DISCOVERED_PATH, { channels: [] }),
    readJson(CANDIDATES_PATH, { channels: [] }),
    readJson(COMMUNITY_PATH, { channels: [] })
  ])
  const knownCatalogs = [sourceCatalog, generatedCatalog, discoveredCatalog]
  const identities = collectCatalogIdentities(knownCatalogs)
  const supportedLanguages = collectSupportedLanguages(knownCatalogs)
  const events = options.events || await queryCandidateEvents(options)
  const aggregated = aggregateCandidateEvents(events, { identities })
  const built = await buildCandidates(aggregated.aggregates, previousCandidates, {
    ...options,
    identities,
    now
  })
  const community = buildCommunityCatalog(built.candidates, previousCommunity, {
    maximumPromotions: options.maximumPromotions || MAXIMUM_PROMOTIONS,
    minimumDistinctUsers: options.minimumDistinctUsers || MINIMUM_DISTINCT_USERS,
    now,
    supportedLanguages
  })
  const candidateOutput = withStableGeneratedAt(previousCandidates, {
    schemaVersion: 1,
    lookbackDays: options.lookbackDays || LOOKBACK_DAYS,
    channels: built.candidates
  }, now)
  const communityOutput = withStableGeneratedAt(previousCommunity, {
    schemaVersion: 1,
    minimumDistinctUsers: options.minimumDistinctUsers || MINIMUM_DISTINCT_USERS,
    channels: community.channels
  }, now)
  const exclusions = [...aggregated.exclusions, ...built.exclusions]
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))

  await writeJsonAtomically(CANDIDATES_PATH, CANDIDATES_TEMP_PATH, candidateOutput)
  await writeJsonAtomically(COMMUNITY_PATH, COMMUNITY_TEMP_PATH, communityOutput)

  const report = {
    schemaVersion: 1,
    generatedAt: now,
    eventCount: events.length,
    candidateCount: built.candidates.length,
    promotedCount: community.promotions.length,
    exclusions,
    blockedPromotions: community.blockedPromotions
  }
  const reportPath = String(
    options.reportPath || process.env.COMMUNITY_CATALOG_REPORT_PATH || ''
  ).trim()
  if (reportPath) {
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }

  console.log(`Processed ${events.length} add events into ${built.candidates.length} eligible candidates`)
  console.log(
    `Promoted ${community.promotions.length} new community channels; ${community.channels.length} total`
  )
  console.log(`Excluded ${exclusions.length} aggregate candidate records`)
  console.log(`Used ${youtubeRequestCount} YouTube requests`)
  return {
    candidateOutput,
    communityOutput,
    report
  }
}

function isMainModule() {
  return Boolean(process.argv[1])
    && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  importCommunityChannelCandidates().catch(error => {
    console.error(`Community catalog import failed: ${error.message}`)
    process.exitCode = 1
  })
}
