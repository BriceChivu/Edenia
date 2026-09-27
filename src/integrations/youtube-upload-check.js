// Coverage belongs to successful upload checks, never to individually added videos.
// Persist the result only alongside the corresponding merged video records.
export async function checkNewUploads({ fetchPage, coverage = null, legacyIds = [], maxPages = 3 }) {
  const boundary = new Set(coverage?.headIds || legacyIds)
  const oldestPublishedMs = Date.parse(coverage?.oldestPublishedAt)
  const pending = coverage?.pending
  let token = pending?.pageToken || ''
  let anchors = pending?.anchorIds || []
  let headIds = pending?.headIds || []
  let headOldestPublishedAt = pending?.headOldestPublishedAt || coverage?.oldestPublishedAt || null
  let history = coverage?.history || null
  const videos = new Map()
  const requested = new Set()
  let lastPage = null
  for (let count = 0; count < maxPages; count += 1) {
    if (requested.has(token)) throw new Error('YouTube returned a repeated uploads page token')
    requested.add(token)
    let page
    try {
      page = await fetchPage(token)
    } catch (error) {
      // A retired cursor is recoverable, but network/provider failures remain retryable.
      if (token && error?.reasons?.includes('invalidPageToken')) {
        token = ''; anchors = []; headIds = []
        continue
      }
      throw error
    }
    const ids = page.videos.map(video => video.id).filter(Boolean)
    if (anchors.length && !ids.some(id => anchors.includes(id))) {
      // Playlist offsets moved past our overlap. Restart within the same allowance.
      token = ''; anchors = []; headIds = []
      continue
    }
    anchors = []
    if (!token) {
      // Publication dates provide a conservative floor if every identity anchor is deleted.
      const head = page.videos.filter(video => !Number.isFinite(oldestPublishedMs) || !Number.isFinite(Date.parse(video.publishedAt)) || Date.parse(video.publishedAt) >= oldestPublishedMs)
      headIds = head.map(video => video.id).filter(Boolean)
      const timestamps = head.map(video => Date.parse(video.publishedAt)).filter(Number.isFinite)
      if (timestamps.length) headOldestPublishedAt = new Date(Math.min(...timestamps)).toISOString()
    }
    let reachedBoundary = false
    for (const video of page.videos) {
      if (!video.id) continue
      if (boundary.has(video.id) || Date.parse(video.publishedAt) < oldestPublishedMs) { reachedBoundary = true; break }
      videos.set(video.id, video)
    }
    lastPage = { pageToken: token, anchorIds: ids, headIds, headOldestPublishedAt }
    // Initial onboarding intentionally takes one page, irrespective of known manual IDs.
    if (!coverage && !legacyIds.length || reachedBoundary || !page.nextPageToken) {
      if (!history) history = { pageToken: token, anchorIds: ids, nextPageToken: page.nextPageToken || null }
      return { videos: [...videos.values()], coverage: { headIds, oldestPublishedAt: headOldestPublishedAt, history, pending: null } }
    }
    token = page.nextPageToken
  }
  return {
    videos: [...videos.values()],
    coverage: { headIds: coverage?.headIds || legacyIds, oldestPublishedAt: coverage?.oldestPublishedAt || null, history, pending: lastPage || { pageToken: '', anchorIds: [], headIds: [] } }
  }
}
