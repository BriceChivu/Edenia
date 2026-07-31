const YOUTUBE_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/

export const COMMUNITY_MAX_PROMOTIONS_HARD_LIMIT = 10

export const ALLOWED_COMMUNITY_CANDIDATE_SOURCES = Object.freeze([
  'direct_input',
  'youtube_search'
])

export const COMMUNITY_PROMOTION_STABLE_FIELDS = Object.freeze([
  'catalogId',
  'channelId',
  'handle',
  'name',
  'languages',
  'levels',
  'style',
  'description',
  'promotedAt'
])

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function normalizeHandle(value) {
  return String(value || '').trim().replace(/^@+/, '').toLocaleLowerCase('en')
}

export function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean)))
}

export function parseBoolean(value) {
  if (typeof value === 'boolean') return value
  return ['1', 'true', 'yes'].includes(String(value || '').toLocaleLowerCase('en'))
}

export function isYoutubeChannelId(value) {
  return YOUTUBE_CHANNEL_ID_RE.test(String(value || '').trim())
}

export function parseCommunityMaximumPromotions(value, fallback = COMMUNITY_MAX_PROMOTIONS_HARD_LIMIT) {
  const parsed = String(value ?? '').trim() ? Number(value) : Number(fallback)
  if (
    !Number.isInteger(parsed)
    || parsed < 1
    || parsed > COMMUNITY_MAX_PROMOTIONS_HARD_LIMIT
  ) {
    throw new Error(
      `Community promotion limit must be an integer from 1 to ${COMMUNITY_MAX_PROMOTIONS_HARD_LIMIT}.`
    )
  }
  return parsed
}

export function collectCatalogIdentities(catalogs = []) {
  const channelIds = new Map()
  const handles = new Map()
  const names = new Map()

  catalogs.forEach(catalog => {
    ;(Array.isArray(catalog?.channels) ? catalog.channels : []).forEach(channel => {
      const identity = {
        catalogId: String(channel.catalogId || '').trim(),
        channelId: String(channel.channelId || '').trim(),
        handle: String(channel.handle || channel.youtubeInput || '').trim(),
        name: String(channel.name || '').trim()
      }
      if (identity.channelId) channelIds.set(identity.channelId, identity)
      const handle = normalizeHandle(identity.handle)
      if (handle) handles.set(handle, identity)
      const name = normalizeText(identity.name)
      if (name) names.set(name, identity)
    })
  })

  return { channelIds, handles, names }
}

export function findCatalogIdentityMatch(channel, identities, options = {}) {
  const channelId = String(channel?.channelId || '').trim()
  if (channelId && identities.channelIds.has(channelId)) {
    return { field: 'channelId', identity: identities.channelIds.get(channelId) }
  }
  const handle = normalizeHandle(channel?.handle || channel?.youtubeInput)
  if (handle && identities.handles.has(handle)) {
    return { field: 'handle', identity: identities.handles.get(handle) }
  }
  if (options.includeName === true) {
    const name = normalizeText(channel?.name)
    if (name && identities.names.has(name)) {
      return { field: 'name', identity: identities.names.get(name) }
    }
  }
  return null
}

export function collectSupportedLanguages(catalogs = []) {
  const languages = new Set()
  catalogs.forEach(catalog => {
    ;(Array.isArray(catalog?.channels) ? catalog.channels : []).forEach(channel => {
      normalizeStringArray(channel.languages).forEach(language => languages.add(language))
    })
  })
  return languages
}

export function getCommunityPromotionBlockers(candidate, options = {}) {
  const minimumDistinctUsers = Math.max(1, Number(options.minimumDistinctUsers) || 2)
  const supportedLanguages = options.supportedLanguages instanceof Set
    ? options.supportedLanguages
    : new Set(normalizeStringArray(options.supportedLanguages))
  const blockers = []

  if (!isYoutubeChannelId(candidate?.channelId)) blockers.push('invalid_channel_id')
  if (candidate?.available !== true || candidate?.privacyStatus !== 'public') {
    blockers.push('not_publicly_available')
  }
  if (!String(candidate?.name || '').trim()) blockers.push('missing_name')
  if (!String(candidate?.thumbnailUrl || '').trim()) blockers.push('missing_thumbnail')
  if (!String(candidate?.publishedAt || '').trim()) blockers.push('missing_published_at')
  if (Number(candidate?.distinctUserCount || 0) < minimumDistinctUsers) {
    blockers.push('below_distinct_user_threshold')
  }

  const languages = normalizeStringArray(candidate?.languages)
  if (!languages.length) blockers.push('missing_learning_language')
  if (languages.some(language => supportedLanguages.size && !supportedLanguages.has(language))) {
    blockers.push('unsupported_learning_language')
  }

  const sources = normalizeStringArray(candidate?.sources)
  if (
    !sources.length
    || sources.some(source => !ALLOWED_COMMUNITY_CANDIDATE_SOURCES.includes(source))
  ) {
    blockers.push('invalid_candidate_source')
  }
  if (normalizeStringArray(candidate?.reviewReasons).length) blockers.push('review_required')

  return Array.from(new Set(blockers))
}

export function buildCommunityCatalog(candidates, previousCommunity, options = {}) {
  const minimumDistinctUsers = Math.max(1, Number(options.minimumDistinctUsers) || 2)
  const maximumPromotions = parseCommunityMaximumPromotions(options.maximumPromotions)
  const now = String(options.now || new Date().toISOString())
  const previousChannels = Array.isArray(previousCommunity?.channels)
    ? previousCommunity.channels
    : []
  const byChannelId = new Map(previousChannels.map(channel => [channel.channelId, channel]))
  const promotions = []
  const blockedPromotions = []

  candidates.forEach(candidate => {
    const previous = byChannelId.get(candidate.channelId)
    if (previous) {
      byChannelId.set(candidate.channelId, {
        ...previous,
        addCount: candidate.addCount,
        distinctUserCount: candidate.distinctUserCount,
        firstSeenAt: previous.firstSeenAt || candidate.firstSeenAt,
        lastSeenAt: candidate.lastSeenAt,
        sources: candidate.sources,
        metadataRefreshedAt: candidate.metadataRefreshedAt
      })
      return
    }

    const blockers = getCommunityPromotionBlockers(candidate, {
      minimumDistinctUsers,
      supportedLanguages: options.supportedLanguages
    })
    if (Number(candidate.distinctUserCount || 0) >= minimumDistinctUsers && blockers.length) {
      blockedPromotions.push({
        catalogId: candidate.catalogId,
        channelId: candidate.channelId,
        handle: candidate.handle,
        name: candidate.name,
        blockers
      })
      return
    }
    if (blockers.length) return

    const promoted = {
      ...candidate,
      promotedAt: now
    }
    byChannelId.set(candidate.channelId, promoted)
    promotions.push(promoted)
  })

  if (promotions.length > maximumPromotions) {
    throw new Error(
      `Community import promoted ${promotions.length} channels, exceeding the limit of ${maximumPromotions}.`
    )
  }

  return {
    channels: Array.from(byChannelId.values())
      .sort((left, right) => left.name.localeCompare(right.name, 'en')),
    promotions,
    blockedPromotions
  }
}
