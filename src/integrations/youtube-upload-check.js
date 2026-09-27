// Coverage belongs to successful upload checks, never to individually added videos.
// Persist the result only alongside the corresponding merged video records.
export async function checkNewUploads({ fetchPage, coverage = null, legacyIds = [], maxPages = 3 }) {
  const boundary = new Set(coverage?.headIds || legacyIds)
  const pending = coverage?.pending
  let token = pending?.pageToken || ''
  let anchors = pending?.anchorIds || []
  let headIds = pending?.headIds || []
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
      if (token && /invalidPageToken/.test(String(error?.message))) {
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
    if (!token) headIds = ids
    let reachedBoundary = false
    for (const video of page.videos) {
      if (!video.id) continue
      if (boundary.has(video.id)) { reachedBoundary = true; break }
      videos.set(video.id, video)
    }
    lastPage = { pageToken: token, anchorIds: ids, headIds }
    // Initial onboarding intentionally takes one page, irrespective of known manual IDs.
    if (!coverage && !legacyIds.length || reachedBoundary || !page.nextPageToken) {
      if (!history) history = { pageToken: token, anchorIds: ids, nextPageToken: page.nextPageToken || null }
      return { videos: [...videos.values()], coverage: { headIds, history, pending: null } }
    }
    token = page.nextPageToken
  }
  return {
    videos: [...videos.values()],
    coverage: { headIds: coverage?.headIds || legacyIds, history, pending: lastPage || { pageToken: '', anchorIds: [], headIds: [] } }
  }
}
