import { getVideoStatus } from '../../domain/video-state.js'

export const VIDEO_SEARCH_RESULT_LIMIT = 8

export function normalizeVideoSearchText(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function getVideoSearchMatches(query, state) {
  const normalizedQuery = normalizeVideoSearchText(query)
  if (!normalizedQuery || !state?.videos) return []
  const tokens = normalizedQuery.split(' ').filter(Boolean)

  return Object.values(state.videos)
    .filter(video => videoMatchesSearch(video, normalizedQuery, tokens))
    .map(video => ({
      video,
      score: getVideoSearchScore(video, normalizedQuery, tokens)
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return getVideoSearchTimestamp(b.video) - getVideoSearchTimestamp(a.video)
    })
    .slice(0, VIDEO_SEARCH_RESULT_LIMIT)
    .map(entry => entry.video)
}

function videoMatchesSearch(video, query, tokens) {
  const title = normalizeVideoSearchText(video?.title)
  const channel = normalizeVideoSearchText(video?.channelTitle)
  const haystack = `${title} ${channel}`
  return haystack.includes(query) || tokens.every(token => haystack.includes(token))
}

function getVideoSearchScore(video, query, tokens) {
  const title = normalizeVideoSearchText(video?.title)
  const channel = normalizeVideoSearchText(video?.channelTitle)
  const statusPriority = {
    partial: 18,
    'watch-later': 12,
    watched: 8,
    unwatched: 0
  }
  let score = statusPriority[getVideoStatus(video)] || 0

  if (title === query) score += 120
  else if (title.startsWith(query)) score += 95
  else if (title.includes(query)) score += 75
  else score += tokens.filter(token => title.includes(token)).length * 18

  if (channel === query) score += 70
  else if (channel.startsWith(query)) score += 52
  else if (channel.includes(query)) score += 40
  else score += tokens.filter(token => channel.includes(token)).length * 10

  return score
}

function getVideoSearchTimestamp(video) {
  const watchedAt = new Date(video?.watchedAt || 0).getTime()
  const publishedAt = new Date(video?.publishedAt || 0).getTime()
  return Math.max(
    Number.isFinite(watchedAt) ? watchedAt : 0,
    Number.isFinite(publishedAt) ? publishedAt : 0
  )
}
