import { readFile, rename, writeFile } from 'node:fs/promises'

const SOURCE_PATH = new URL('../data/channel-catalog.source.json', import.meta.url)
const GENERATED_PATH = new URL('../data/channel-catalog.json', import.meta.url)
const COMMUNITY_PATH = new URL('../data/channel-catalog.community.json', import.meta.url)
const DISCOVERED_PATH = new URL('../data/channel-catalog.discovered.json', import.meta.url)
const DISCOVERED_TEMP_PATH = new URL('../data/channel-catalog.discovered.json.tmp', import.meta.url)
const YOUTUBE_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/
const SEARCH_RESULTS_PER_QUERY = 25
const CHANNEL_BATCH_SIZE = 50
const METADATA_MAX_AGE_MS = 30 * 24 * 60 * 60_000
const MAX_ADDITIONS_PER_LANGUAGE = Math.max(
  1,
  Number(process.env.DISCOVERY_MAX_PER_LANGUAGE) || 6
)
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
    queries: ['learn French', 'French comprehensible input', 'French lessons for beginners'],
    languageTerms: ['french', 'francais', 'français'],
    educationTerms: ['apprendre', 'cours', 'grammaire', 'lecon', 'leçon', 'vocabulaire']
  },
  {
    id: 'english',
    queries: ['learn English', 'English comprehensible input', 'English lessons for beginners'],
    languageTerms: ['english'],
    educationTerms: ['esl', 'ielts', 'toefl']
  },
  {
    id: 'german',
    queries: ['learn German', 'German comprehensible input', 'German lessons for beginners'],
    languageTerms: ['german', 'deutsch'],
    educationTerms: ['deutsch lernen', 'deutschunterricht', 'grammatik', 'wortschatz']
  },
  {
    id: 'mandarin',
    queries: ['learn Mandarin Chinese', 'Mandarin comprehensible input', 'Chinese lessons for beginners'],
    languageTerms: ['mandarin', 'chinese', '中文', '汉语', '漢語', '普通话', '普通話', '华语', '華語'],
    educationTerms: ['学中文', '學中文', '中文学习', '中文學習', '汉语课', '漢語課']
  },
  {
    id: 'russian',
    queries: ['learn Russian', 'Russian comprehensible input', 'Russian lessons for beginners'],
    languageTerms: ['russian', 'русский'],
    educationTerms: ['учить русский', 'русский язык', 'уроки русского']
  },
  {
    id: 'spanish',
    queries: ['learn Spanish', 'Spanish comprehensible input', 'Spanish lessons for beginners'],
    languageTerms: ['spanish', 'espanol', 'español'],
    educationTerms: ['aprender español', 'curso', 'gramatica', 'gramática', 'lecciones', 'vocabulario']
  },
  {
    id: 'japanese',
    queries: ['learn Japanese', 'Japanese comprehensible input', 'Japanese lessons for beginners'],
    languageTerms: ['japanese', 'nihongo', '日本語'],
    educationTerms: ['日本語学習', '日本語レッスン', '日本語講座']
  },
  {
    id: 'portuguese',
    queries: ['learn Portuguese', 'Portuguese comprehensible input', 'Portuguese lessons for beginners'],
    languageTerms: ['portuguese', 'portugues', 'português'],
    educationTerms: ['aprender português', 'aulas', 'curso', 'gramatica', 'gramática', 'vocabulario', 'vocabulário']
  }
]

let searchRequestCount = 0
let channelRequestCount = 0

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
  if (resource === 'search') searchRequestCount += 1
  if (resource === 'channels') channelRequestCount += 1

  const response = await fetch(url)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error?.message || `YouTube API returned HTTP ${response.status}`)
  }
  return data
}

async function searchLanguageChannels() {
  const discoveriesById = new Map()

  for (const language of LANGUAGE_DISCOVERY_CONFIG) {
    for (let queryIndex = 0; queryIndex < language.queries.length; queryIndex += 1) {
      const query = language.queries[queryIndex]
      const data = await fetchYoutube('search', {
        part: 'snippet',
        type: 'channel',
        maxResults: SEARCH_RESULTS_PER_QUERY,
        order: queryIndex === language.queries.length - 1 ? 'date' : 'relevance',
        safeSearch: 'strict',
        q: query
      })

      ;(data.items || []).forEach((item, resultIndex) => {
        const channelId = String(item?.id?.channelId || '')
        if (!YOUTUBE_CHANNEL_ID_RE.test(channelId)) return
        const discovery = discoveriesById.get(channelId) || {
          channelId,
          byLanguage: new Map()
        }
        const languageMatch = discovery.byLanguage.get(language.id) || {
          bestRank: Number.POSITIVE_INFINITY,
          queries: new Set()
        }
        languageMatch.bestRank = Math.min(languageMatch.bestRank, resultIndex)
        languageMatch.queries.add(query)
        discovery.byLanguage.set(language.id, languageMatch)
        discoveriesById.set(channelId, discovery)
      })
    }
  }

  return discoveriesById
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

function withStableGeneratedAt(previous, channels) {
  const sortedChannels = channels.sort((left, right) => left.name.localeCompare(right.name, 'en'))
  const previousChannels = JSON.stringify(previous?.channels || [])
  const nextChannels = JSON.stringify(sortedChannels)
  return {
    schemaVersion: 1,
    generatedAt: previousChannels === nextChannels
      ? previous?.generatedAt || null
      : new Date().toISOString(),
    languages: LANGUAGE_DISCOVERY_CONFIG.map(language => language.id),
    channels: sortedChannels
  }
}

async function main() {
  const [source, generated, community, discovered] = await Promise.all([
    readJson(SOURCE_PATH, { channels: [] }),
    readJson(GENERATED_PATH, { channels: [] }),
    readJson(COMMUNITY_PATH, { channels: [] }),
    readJson(DISCOVERED_PATH, { channels: [] })
  ])
  const existingChannels = Array.isArray(discovered?.channels) ? discovered.channels : []
  const known = buildKnownCatalog(source, generated, community, discovered)
  const discoveriesById = await searchLanguageChannels()
  const staleExistingIds = existingChannels
    .filter(isMetadataStale)
    .map(channel => channel.channelId)
    .filter(channelId => YOUTUBE_CHANNEL_ID_RE.test(channelId))
  const channelIdsToFetch = Array.from(new Set([
    ...discoveriesById.keys(),
    ...staleExistingIds
  ]))
  const youtubeById = await fetchChannels(channelIdsToFetch)
  const selectedById = selectNewChannels(discoveriesById, youtubeById, known)
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
  ])

  await writeFile(DISCOVERED_TEMP_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  await rename(DISCOVERED_TEMP_PATH, DISCOVERED_PATH)

  console.log(
    `Discovered ${newChannels.length} new channels with ${searchRequestCount} search requests `
    + `and ${channelRequestCount} channels.list requests`
  )
  LANGUAGE_DISCOVERY_CONFIG.forEach(language => {
    const count = newChannels.filter(channel => channel.languages.includes(language.id)).length
    console.log(`${language.id}: ${count} new channels`)
  })
}

main().catch(error => {
  console.error(`Language channel discovery failed: ${error.message}`)
  process.exitCode = 1
})
