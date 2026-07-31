import { readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const SOURCE_PATH = new URL('../data/channel-catalog.source.json', import.meta.url)
const GENERATED_PATH = new URL('../data/channel-catalog.json', import.meta.url)
const COMMUNITY_PATH = new URL('../data/channel-catalog.community.json', import.meta.url)
const DISCOVERED_PATH = new URL('../data/channel-catalog.discovered.json', import.meta.url)
const DISCOVERED_TEMP_PATH = new URL('../data/channel-catalog.discovered.json.tmp', import.meta.url)
const YOUTUBE_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/
const SEARCH_RESULTS_PER_QUERY = 50
const CHANNEL_BATCH_SIZE = 50
const METADATA_MAX_AGE_MS = 30 * 24 * 60 * 60_000
export const DISCOVERY_LANGUAGE_BATCH_SIZE = 2
export const DISCOVERY_MAX_SEARCH_REQUESTS = 7
const MAX_ADDITIONS_PER_LANGUAGE_LIMIT = 6
const MIN_SUBSCRIBERS = Math.max(
  0,
  Number(process.env.DISCOVERY_MIN_SUBSCRIBERS) || 100
)
const MIN_VIDEOS = Math.max(
  1,
  Number(process.env.DISCOVERY_MIN_VIDEOS) || 10
)

const GENERAL_EDUCATION_TERMS = [
  'academy',
  'beginner',
  'class',
  'comprehensible input',
  'course',
  'fluent',
  'grammar',
  'language',
  'learn',
  'learning',
  'lesson',
  'pronunciation',
  'school',
  'speak',
  'teacher',
  'tutor',
  'vocabulary'
]

const LANGUAGE_DISCOVERY_CONFIG = [
  {
    id: 'french',
    queryGroups: [
      ['learn French', 'French comprehensible input', 'apprendre le français'],
      ['French listening practice', 'French stories for learners', 'compréhension orale français'],
      ['French grammar lessons', 'French vocabulary lessons', 'cours de français débutant'],
      ['intermediate French podcast', 'French conversation practice', 'français niveau intermédiaire']
    ],
    languageTerms: ['french', 'francais', 'français'],
    educationTerms: ['apprendre', 'cours', 'grammaire', 'lecon', 'leçon', 'vocabulaire']
  },
  {
    id: 'english',
    queryGroups: [
      ['learn English', 'English comprehensible input', 'English lessons for beginners'],
      ['English listening practice', 'English stories for learners', 'English conversation lessons'],
      ['English grammar lessons', 'English vocabulary lessons', 'spoken English teacher'],
      ['intermediate English podcast', 'advanced English listening', 'ESL lessons']
    ],
    languageTerms: ['english'],
    educationTerms: ['esl', 'ielts', 'toefl']
  },
  {
    id: 'german',
    queryGroups: [
      ['learn German', 'German comprehensible input', 'Deutsch lernen für Anfänger'],
      ['German listening practice', 'German stories for learners', 'Deutsch Hörverstehen'],
      ['German grammar lessons', 'German vocabulary lessons', 'Deutsch Grammatik'],
      ['intermediate German podcast', 'German conversation practice', 'Deutsch lernen Mittelstufe']
    ],
    languageTerms: ['german', 'deutsch'],
    educationTerms: ['deutsch lernen', 'deutschunterricht', 'grammatik', 'wortschatz']
  },
  {
    id: 'mandarin',
    queryGroups: [
      ['learn Mandarin Chinese', 'Mandarin comprehensible input', '学中文 初学者'],
      ['Mandarin listening practice', 'Chinese stories for learners', '中文听力'],
      ['Chinese grammar lessons', 'Mandarin vocabulary lessons', '汉语课'],
      ['intermediate Mandarin podcast', 'Mandarin conversation practice', '中文播客']
    ],
    languageTerms: ['mandarin', 'chinese', '中文', '汉语', '漢語', '普通话', '普通話', '华语', '華語'],
    educationTerms: ['学中文', '學中文', '中文学习', '中文學習', '中文听力', '中文聽力', '汉语课', '漢語課']
  },
  {
    id: 'russian',
    queryGroups: [
      ['learn Russian', 'Russian comprehensible input', 'русский язык для начинающих'],
      ['Russian listening practice', 'Russian stories for learners', 'русский на слух'],
      ['Russian grammar lessons', 'Russian vocabulary lessons', 'уроки русского языка'],
      ['intermediate Russian podcast', 'Russian conversation practice', 'русский средний уровень']
    ],
    languageTerms: ['russian', 'русский'],
    educationTerms: ['учить русский', 'русский язык', 'уроки русского']
  },
  {
    id: 'spanish',
    queryGroups: [
      ['learn Spanish', 'Spanish comprehensible input', 'aprender español principiantes'],
      ['Spanish listening practice', 'Spanish stories for learners', 'comprensión auditiva español'],
      ['Spanish grammar lessons', 'Spanish vocabulary lessons', 'curso de español'],
      ['intermediate Spanish podcast', 'Spanish conversation practice', 'español nivel intermedio']
    ],
    languageTerms: ['spanish', 'espanol', 'español'],
    educationTerms: ['aprender español', 'curso', 'gramatica', 'gramática', 'lecciones', 'vocabulario']
  },
  {
    id: 'japanese',
    queryGroups: [
      ['learn Japanese', 'Japanese comprehensible input', '日本語 初心者'],
      ['Japanese listening practice', 'Japanese stories for learners', '日本語 リスニング'],
      ['Japanese grammar lessons', 'Japanese vocabulary lessons', '日本語 文法'],
      ['intermediate Japanese podcast', 'Japanese conversation practice', '日本語 中級']
    ],
    languageTerms: ['japanese', 'nihongo', '日本語'],
    educationTerms: ['初心者', '中級', '文法', '日本語学習', '日本語レッスン', '日本語講座', 'リスニング']
  },
  {
    id: 'portuguese',
    queryGroups: [
      ['learn Portuguese', 'Portuguese comprehensible input', 'aprender português iniciantes'],
      ['Portuguese listening practice', 'Portuguese stories for learners', 'compreensão oral português'],
      ['Portuguese grammar lessons', 'Portuguese vocabulary lessons', 'aulas de português'],
      ['intermediate Portuguese podcast', 'Portuguese conversation practice', 'português nível intermediário']
    ],
    languageTerms: ['portuguese', 'portugues', 'português'],
    educationTerms: ['aprender português', 'aulas', 'curso', 'gramatica', 'gramática', 'vocabulario', 'vocabulário']
  }
]
const QUERY_ROTATION_COUNT = Math.min(
  ...LANGUAGE_DISCOVERY_CONFIG.map(language => language.queryGroups.length)
)
const LANGUAGE_BATCH_COUNT = Math.ceil(
  LANGUAGE_DISCOVERY_CONFIG.length / DISCOVERY_LANGUAGE_BATCH_SIZE
)

let channelRequestCount = 0

function configuredSearchRequestLimit() {
  const configured = String(process.env.DISCOVERY_MAX_SEARCH_REQUESTS || '').trim()
  const limit = configured ? Number(configured) : DISCOVERY_MAX_SEARCH_REQUESTS
  if (
    !Number.isInteger(limit)
    || limit < 1
    || limit > DISCOVERY_MAX_SEARCH_REQUESTS
  ) {
    throw new Error(
      `DISCOVERY_MAX_SEARCH_REQUESTS must be an integer from 1 to ${DISCOVERY_MAX_SEARCH_REQUESTS}.`
    )
  }
  return limit
}

function configuredMaximumAdditionsPerLanguage() {
  const configured = String(process.env.DISCOVERY_MAX_PER_LANGUAGE || '').trim()
  const maximum = configured ? Number(configured) : MAX_ADDITIONS_PER_LANGUAGE_LIMIT
  if (
    !Number.isInteger(maximum)
    || maximum < 1
    || maximum > MAX_ADDITIONS_PER_LANGUAGE_LIMIT
  ) {
    throw new Error(
      `DISCOVERY_MAX_PER_LANGUAGE must be an integer from 1 to ${MAX_ADDITIONS_PER_LANGUAGE_LIMIT}.`
    )
  }
  return maximum
}

export function createSearchRequestBudget(limit = DISCOVERY_MAX_SEARCH_REQUESTS) {
  if (
    !Number.isInteger(limit)
    || limit < 1
    || limit > DISCOVERY_MAX_SEARCH_REQUESTS
  ) {
    throw new Error(
      `Search request limit must be an integer from 1 to ${DISCOVERY_MAX_SEARCH_REQUESTS}.`
    )
  }
  let used = 0
  return {
    consume() {
      if (used >= limit) {
        throw new Error(`YouTube discovery search budget exhausted after ${used} requests.`)
      }
      used += 1
    },
    get limit() {
      return limit
    },
    get remaining() {
      return limit - used
    },
    get used() {
      return used
    }
  }
}

function quotaDateFromParts(parts) {
  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  )
  return `${values.year}-${values.month}-${values.day}`
}

export function getYoutubeQuotaDate(date = new Date()) {
  return quotaDateFromParts(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date))
}

function configuredQuotaDate() {
  const configured = String(process.env.DISCOVERY_QUOTA_DATE || '').trim()
  if (configured && !/^\d{4}-\d{2}-\d{2}$/.test(configured)) {
    throw new Error('DISCOVERY_QUOTA_DATE must use YYYY-MM-DD format.')
  }
  return configured || getYoutubeQuotaDate()
}

export function getDiscoveryRotationState(discovered = {}) {
  const languageBatchIndex = Math.max(
    0,
    Number(discovered?.nextLanguageBatchIndex) || 0
  ) % LANGUAGE_BATCH_COUNT
  const queryRotationIndex = Math.max(
    0,
    Number(discovered?.nextRotationIndex) || 0
  ) % QUERY_ROTATION_COUNT
  const activeLanguages = LANGUAGE_DISCOVERY_CONFIG.slice(
    languageBatchIndex * DISCOVERY_LANGUAGE_BATCH_SIZE,
    (languageBatchIndex + 1) * DISCOVERY_LANGUAGE_BATCH_SIZE
  )
  const nextLanguageBatchIndex = (languageBatchIndex + 1) % LANGUAGE_BATCH_COUNT
  const nextRotationIndex = nextLanguageBatchIndex === 0
    ? (queryRotationIndex + 1) % QUERY_ROTATION_COUNT
    : queryRotationIndex
  return {
    activeLanguages,
    languageBatchIndex,
    nextLanguageBatchIndex,
    nextRotationIndex,
    queryRotationIndex
  }
}

const searchRequestBudget = createSearchRequestBudget(configuredSearchRequestLimit())
const MAX_ADDITIONS_PER_LANGUAGE = configuredMaximumAdditionsPerLanguage()

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeHandle(value) {
  const input = String(value || '').trim()
  if (!input) return ''
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`)
    const pathPart = decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] || '')
    if (pathPart.startsWith('@')) return normalizeText(pathPart.slice(1))
  } catch {
    // Continue with a plain handle.
  }
  return normalizeText(input.replace(/^@/, ''))
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean)))
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
  return normalizeText(values.filter(Boolean).join(' '))
}

function descriptionExcerpt(value) {
  const description = String(value || '').replace(/\s+/g, ' ').trim()
  return description.length > 320 ? `${description.slice(0, 317).trim()}...` : description
}

function parseCount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function isMetadataStale(channel) {
  const refreshedAt = new Date(channel?.refreshedAt || 0).getTime()
  return !Number.isFinite(refreshedAt) || Date.now() - refreshedAt >= METADATA_MAX_AGE_MS
}

async function fetchYoutube(resource, parameters) {
  const apiKey = String(process.env.YOUTUBE_CATALOG_API_KEY || '').trim()
  if (!apiKey) throw new Error('Missing required environment variable: YOUTUBE_CATALOG_API_KEY')
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`)
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, String(value)))
  url.searchParams.set('key', apiKey)
  if (resource === 'search') searchRequestBudget.consume()
  if (resource === 'channels') channelRequestCount += 1

  const response = await fetch(url)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error?.message || `YouTube API returned HTTP ${response.status}`)
  }
  return data
}

function addSearchResults(discoveriesById, languageId, query, items, rankOffset = 0) {
  ;(items || []).forEach((item, resultIndex) => {
    const channelId = String(item?.id?.channelId || '')
    if (!YOUTUBE_CHANNEL_ID_RE.test(channelId)) return
    const discovery = discoveriesById.get(channelId) || {
      channelId,
      byLanguage: new Map()
    }
    const languageMatch = discovery.byLanguage.get(languageId) || {
      bestRank: Number.POSITIVE_INFINITY,
      queries: new Set()
    }
    languageMatch.bestRank = Math.min(languageMatch.bestRank, rankOffset + resultIndex)
    languageMatch.queries.add(query)
    discovery.byLanguage.set(languageId, languageMatch)
    discoveriesById.set(channelId, discovery)
  })
}

async function searchLanguageChannels(rotationIndex, activeLanguages) {
  const discoveriesById = new Map()
  const nextPages = []

  for (const language of activeLanguages) {
    const queries = language.queryGroups[rotationIndex] || language.queryGroups[0]
    for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
      const query = queries[queryIndex]
      const order = queryIndex === queries.length - 1 ? 'date' : 'relevance'
      const data = await fetchYoutube('search', {
        part: 'snippet',
        type: 'channel',
        maxResults: SEARCH_RESULTS_PER_QUERY,
        order,
        safeSearch: 'strict',
        q: query
      })
      addSearchResults(discoveriesById, language.id, query, data.items)
      if (data.nextPageToken) {
        nextPages.push({
          languageId: language.id,
          query,
          order,
          pageToken: data.nextPageToken
        })
      }
    }
  }

  return { discoveriesById, nextPages }
}

async function searchAdditionalPages(discoveriesById, nextPages) {
  for (const nextPage of nextPages) {
    if (searchRequestBudget.remaining < 1) break
    const data = await fetchYoutube('search', {
      part: 'snippet',
      type: 'channel',
      maxResults: SEARCH_RESULTS_PER_QUERY,
      order: nextPage.order,
      safeSearch: 'strict',
      q: nextPage.query,
      pageToken: nextPage.pageToken
    })
    addSearchResults(
      discoveriesById,
      nextPage.languageId,
      nextPage.query,
      data.items,
      SEARCH_RESULTS_PER_QUERY
    )
  }
}

async function fetchChannels(channelIds) {
  const channelsById = new Map()
  for (const ids of chunk(channelIds, CHANNEL_BATCH_SIZE)) {
    const data = await fetchYoutube('channels', {
      part: 'snippet,statistics,status',
      id: ids.join(','),
      maxResults: CHANNEL_BATCH_SIZE
    })
    ;(data.items || []).forEach(item => channelsById.set(String(item.id), item))
  }
  return channelsById
}

function buildKnownCatalog(source, generated, community, discovered) {
  const channelIds = new Set()
  const handles = new Set()
  const names = new Set()

  const addChannel = channel => {
    const channelId = String(channel?.channelId || '')
    const youtubeInput = String(channel?.youtubeInput || '')
    const handle = normalizeHandle(channel?.handle || channel?.youtubeInput)
    const name = normalizeText(channel?.name)
    if (YOUTUBE_CHANNEL_ID_RE.test(channelId)) channelIds.add(channelId)
    if (YOUTUBE_CHANNEL_ID_RE.test(youtubeInput)) channelIds.add(youtubeInput)
    const channelUrlMatch = youtubeInput.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/i)
    if (channelUrlMatch) channelIds.add(channelUrlMatch[1])
    if (handle) handles.add(handle)
    if (name) names.add(name)
  }

  ;(source?.channels || []).forEach(addChannel)
  ;(generated?.channels || []).forEach(addChannel)
  ;(community?.channels || []).forEach(addChannel)
  ;(discovered?.channels || []).forEach(channel => {
    const channelId = String(channel?.channelId || '')
    if (YOUTUBE_CHANNEL_ID_RE.test(channelId)) channelIds.add(channelId)
  })

  return { channelIds, handles, names }
}

function matchingTermCount(text, terms) {
  return terms.reduce((count, term) => (
    text.includes(normalizeText(term)) ? count + 1 : count
  ), 0)
}

function getLanguageQualification(youtubeChannel, language, discovery) {
  const text = normalizeText([
    youtubeChannel?.snippet?.title,
    youtubeChannel?.snippet?.description,
    youtubeChannel?.snippet?.customUrl
  ].filter(Boolean).join(' '))
  const languageMatches = matchingTermCount(text, language.languageTerms)
  const educationMatches = matchingTermCount(text, [
    ...GENERAL_EDUCATION_TERMS,
    ...language.educationTerms
  ])
  if (!languageMatches || !educationMatches) return null

  const subscribers = parseCount(youtubeChannel?.statistics?.subscriberCount)
  const videos = parseCount(youtubeChannel?.statistics?.videoCount)
  const rankScore = Math.max(0, SEARCH_RESULTS_PER_QUERY - discovery.bestRank)
  return {
    languageId: language.id,
    score: (languageMatches * 30)
      + (educationMatches * 18)
      + (discovery.queries.size * 24)
      + rankScore
      + Math.round(Math.log10(Math.max(1, subscribers)) * 8)
      + Math.round(Math.log10(Math.max(1, videos)) * 5),
    queries: Array.from(discovery.queries)
  }
}

function isEligibleYoutubeChannel(youtubeChannel) {
  if (!youtubeChannel || youtubeChannel?.status?.privacyStatus !== 'public') return false
  const videos = parseCount(youtubeChannel?.statistics?.videoCount)
  const subscribers = parseCount(youtubeChannel?.statistics?.subscriberCount)
  const hiddenSubscribers = Boolean(youtubeChannel?.statistics?.hiddenSubscriberCount)
  return videos >= MIN_VIDEOS && (hiddenSubscribers || subscribers >= MIN_SUBSCRIBERS)
}

function isKnownChannel(youtubeChannel, known) {
  const channelId = String(youtubeChannel?.id || '')
  const handle = normalizeHandle(youtubeChannel?.snippet?.customUrl)
  const name = normalizeText(youtubeChannel?.snippet?.title)
  return known.channelIds.has(channelId)
    || Boolean(handle && known.handles.has(handle))
    || Boolean(name && known.names.has(name))
}

function selectNewChannels(discoveriesById, youtubeById, known) {
  const rankedByLanguage = new Map(
    LANGUAGE_DISCOVERY_CONFIG.map(language => [language.id, []])
  )

  discoveriesById.forEach(discovery => {
    const youtubeChannel = youtubeById.get(discovery.channelId)
    if (!isEligibleYoutubeChannel(youtubeChannel) || isKnownChannel(youtubeChannel, known)) return

    LANGUAGE_DISCOVERY_CONFIG.forEach(language => {
      const languageDiscovery = discovery.byLanguage.get(language.id)
      if (!languageDiscovery) return
      const qualification = getLanguageQualification(youtubeChannel, language, languageDiscovery)
      if (!qualification) return
      rankedByLanguage.get(language.id).push({
        youtubeChannel,
        qualification
      })
    })
  })

  const selectedById = new Map()
  rankedByLanguage.forEach((ranked, languageId) => {
    ranked
      .sort((left, right) => right.qualification.score - left.qualification.score)
      .slice(0, MAX_ADDITIONS_PER_LANGUAGE)
      .forEach(result => {
        const channelId = String(result.youtubeChannel.id)
        const selected = selectedById.get(channelId) || {
          youtubeChannel: result.youtubeChannel,
          languages: new Set(),
          queries: new Set(),
          discoveryScore: 0
        }
        selected.languages.add(languageId)
        result.qualification.queries.forEach(query => selected.queries.add(query))
        selected.discoveryScore = Math.max(selected.discoveryScore, result.qualification.score)
        selectedById.set(channelId, selected)
      })
  })
  return selectedById
}

function countSelectedForLanguage(selectedById, languageId) {
  return Array.from(selectedById.values())
    .filter(selected => selected.languages.has(languageId))
    .length
}

function metadataFromYoutube(youtubeChannel) {
  return {
    handle: String(youtubeChannel?.snippet?.customUrl || ''),
    name: String(youtubeChannel?.snippet?.title || youtubeChannel?.id || ''),
    thumbnailUrl: getBestThumbnail(youtubeChannel?.snippet?.thumbnails),
    description: descriptionExcerpt(youtubeChannel?.snippet?.description),
    available: Boolean(youtubeChannel),
    privacyStatus: String(youtubeChannel?.status?.privacyStatus || ''),
    publishedAt: youtubeChannel?.snippet?.publishedAt || null,
    subscriberCount: String(youtubeChannel?.statistics?.subscriberCount || ''),
    videoCount: String(youtubeChannel?.statistics?.videoCount || ''),
    viewCount: String(youtubeChannel?.statistics?.viewCount || '')
  }
}

function refreshExistingChannels(existingChannels, youtubeById, refreshedIds, refreshedAt) {
  return existingChannels.map(channel => {
    if (!refreshedIds.has(channel.channelId)) return channel
    const youtubeChannel = youtubeById.get(channel.channelId)
    if (!youtubeChannel) {
      return {
        ...channel,
        available: false,
        refreshedAt
      }
    }
    const metadata = metadataFromYoutube(youtubeChannel)
    return {
      ...channel,
      ...metadata,
      refreshedAt,
      searchText: normalizeSearchText([
        metadata.name,
        metadata.handle,
        ...(channel.aliases || []),
        ...(channel.languages || []),
        ...(channel.levels || []),
        channel.style
      ])
    }
  })
}

function buildNewChannel(selected, discoveredAt) {
  const youtubeChannel = selected.youtubeChannel
  const metadata = metadataFromYoutube(youtubeChannel)
  const languages = Array.from(selected.languages).sort()
  const aliases = []
  const style = 'YouTube discovery'
  return {
    catalogId: `discovered-${youtubeChannel.id}`,
    channelId: String(youtubeChannel.id),
    youtubeInput: metadata.handle || String(youtubeChannel.id),
    ...metadata,
    languages,
    levels: [],
    style,
    aliases,
    discoveryScore: selected.discoveryScore,
    discoveredByQueries: Array.from(selected.queries).sort(),
    discoveredAt,
    refreshedAt: discoveredAt,
    searchText: normalizeSearchText([
      metadata.name,
      metadata.handle,
      ...languages,
      style
    ])
  }
}

function withStableGeneratedAt(
  previous,
  channels,
  rotationState,
  quotaDate,
  activeLanguageIds
) {
  const sortedChannels = channels.sort((left, right) => left.name.localeCompare(right.name, 'en'))
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    lastRotationIndex: rotationState.queryRotationIndex,
    nextRotationIndex: rotationState.nextRotationIndex,
    rotationCount: QUERY_ROTATION_COUNT,
    lastLanguageBatchIndex: rotationState.languageBatchIndex,
    nextLanguageBatchIndex: rotationState.nextLanguageBatchIndex,
    languageBatchCount: LANGUAGE_BATCH_COUNT,
    languageBatchSize: DISCOVERY_LANGUAGE_BATCH_SIZE,
    lastDiscoveryQuotaDate: quotaDate,
    lastDiscoveryLanguages: activeLanguageIds,
    lastSearchRequestCount: searchRequestBudget.used,
    languages: LANGUAGE_DISCOVERY_CONFIG.map(language => language.id),
    channels: sortedChannels
  }
}

export async function main() {
  const [source, generated, community, discovered] = await Promise.all([
    readJson(SOURCE_PATH, { channels: [] }),
    readJson(GENERATED_PATH, { channels: [] }),
    readJson(COMMUNITY_PATH, { channels: [] }),
    readJson(DISCOVERED_PATH, { channels: [] })
  ])
  const quotaDate = configuredQuotaDate()
  const previousQuotaDate = discovered?.schemaVersion >= 2
    ? String(discovered?.lastDiscoveryQuotaDate || '')
    : Number.isFinite(Date.parse(discovered?.generatedAt))
      ? getYoutubeQuotaDate(new Date(discovered.generatedAt))
      : ''
  if (previousQuotaDate === quotaDate) {
    console.log(
      `Discovery already ran for YouTube quota day ${quotaDate}; no API requests were made.`
    )
    return
  }
  const existingChannels = Array.isArray(discovered?.channels) ? discovered.channels : []
  const rotationState = getDiscoveryRotationState(discovered)
  const activeLanguageIds = rotationState.activeLanguages.map(language => language.id)
  const known = buildKnownCatalog(source, generated, community, discovered)
  const { discoveriesById, nextPages } = await searchLanguageChannels(
    rotationState.queryRotationIndex,
    rotationState.activeLanguages
  )
  const staleExistingIds = existingChannels
    .filter(isMetadataStale)
    .map(channel => channel.channelId)
    .filter(channelId => YOUTUBE_CHANNEL_ID_RE.test(channelId))
  const channelIdsToFetch = Array.from(new Set([
    ...discoveriesById.keys(),
    ...staleExistingIds
  ]))
  const youtubeById = await fetchChannels(channelIdsToFetch)
  let selectedById = selectNewChannels(discoveriesById, youtubeById, known)
  const languagesNeedingMore = rotationState.activeLanguages
      .filter(language => (
        countSelectedForLanguage(selectedById, language.id) < MAX_ADDITIONS_PER_LANGUAGE
      ))
      .sort((left, right) => (
        countSelectedForLanguage(selectedById, left.id)
        - countSelectedForLanguage(selectedById, right.id)
      ))
      .map(language => language.id)
  if (languagesNeedingMore.length && searchRequestBudget.remaining > 0) {
    const previouslyHydratedIds = new Set(youtubeById.keys())
    const prioritizedNextPages = languagesNeedingMore.flatMap(languageId => (
      nextPages.filter(nextPage => nextPage.languageId === languageId)
    ))
    await searchAdditionalPages(discoveriesById, prioritizedNextPages)
    const additionalChannelIds = Array.from(discoveriesById.keys())
      .filter(channelId => !previouslyHydratedIds.has(channelId))
    const additionalYoutubeChannels = await fetchChannels(additionalChannelIds)
    additionalYoutubeChannels.forEach((channel, channelId) => youtubeById.set(channelId, channel))
    selectedById = selectNewChannels(discoveriesById, youtubeById, known)
  }
  const refreshedAt = new Date().toISOString()
  const refreshedExisting = refreshExistingChannels(
    existingChannels,
    youtubeById,
    new Set(staleExistingIds),
    refreshedAt
  )
  const newChannels = Array.from(selectedById.values())
    .map(selected => buildNewChannel(selected, refreshedAt))
  const output = withStableGeneratedAt(discovered, [
    ...refreshedExisting,
    ...newChannels
  ], rotationState, quotaDate, activeLanguageIds)

  await writeFile(DISCOVERED_TEMP_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  await rename(DISCOVERED_TEMP_PATH, DISCOVERED_PATH)

  console.log(
    `Discovery language batch ${rotationState.languageBatchIndex + 1}/${LANGUAGE_BATCH_COUNT} `
    + `used query rotation ${rotationState.queryRotationIndex + 1}/${QUERY_ROTATION_COUNT} `
    + `and added ${newChannels.length} channels `
    + `with ${searchRequestBudget.used}/${searchRequestBudget.limit} search requests `
    + `and ${channelRequestCount} channels.list requests`
  )
  rotationState.activeLanguages.forEach(language => {
    const count = newChannels.filter(channel => channel.languages.includes(language.id)).length
    console.log(`${language.id}: ${count} new channels`)
  })
}

function isMainModule() {
  return Boolean(process.argv[1])
    && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  main().catch(error => {
    console.error(`Language channel discovery failed: ${error.message}`)
    process.exitCode = 1
  })
}
