// Re-read the last saved page before following its cursor: playlist offsets move.
// Commit this cursor only together with every returned video and its metadata.
export async function fetchOlderUploads({ fetchPage, history = null, maxPages = 5 }) {
  if (history?.exhausted === true || (history?.exhausted === undefined && history?.nextPageToken === null)) {
    return { videos: [], history: { ...history, exhausted: true }, exhausted: true }
  }
  let token = typeof history?.pageToken === 'string' ? history.pageToken : ''
  let anchors = Array.isArray(history?.anchorIds) ? history.anchorIds : []
  let cursor = history
  const videos = new Map()
  const requested = new Set()
  let previous = null
  for (let count = 0; count < maxPages; count += 1) {
    if (requested.has(token)) throw new Error('YouTube returned a repeated uploads page token')
    requested.add(token)
    let page
    try {
      page = await fetchPage(token)
      if (previous) {
        // A moving offset can skip records even when the saved boundary was valid.
        // Confirm the page that supplied this token has not moved in the meantime.
        if (count + 1 >= maxPages) break
        count += 1
        const validation = await fetchPage(previous.token)
        const unchanged = validation.nextPageToken === previous.page.nextPageToken
          && JSON.stringify(validation.videos.map(video => video.id)) === JSON.stringify(previous.page.videos.map(video => video.id))
        if (!unchanged) {
          token = ''; anchors = []; requested.clear(); previous = null
          cursor = { pageToken: '', anchorIds: [], nextPageToken: null, exhausted: false }
          continue
        }
      }
    } catch (error) {
      if (!token || !error?.reasons?.includes('invalidPageToken')) throw error
      token = ''; anchors = []; requested.clear(); previous = null
      cursor = { pageToken: '', anchorIds: [], nextPageToken: null, exhausted: false }
      continue
    }
    const ids = page.videos.map(video => video.id).filter(Boolean)
    if (anchors.length && !ids.some(id => anchors.includes(id))) {
      // Lost overlap means a possible gap. Rebuild coverage from the head, saving
      // bounded progress so a large playlist can recover over several attempts.
      token = ''; anchors = []; requested.clear(); previous = null
      cursor = { pageToken: '', anchorIds: [], nextPageToken: null, exhausted: false }
      continue
    }
    for (const video of page.videos) if (video.id) videos.set(video.id, video)
    cursor = { pageToken: token, anchorIds: ids, nextPageToken: page.nextPageToken || null, exhausted: !page.nextPageToken }
    if (cursor.exhausted) break
    if (requested.has(page.nextPageToken)) throw new Error('YouTube returned a repeated uploads page token')
    previous = { token, page }
    token = page.nextPageToken
    anchors = []
  }
  return { videos: [...videos.values()], history: cursor, exhausted: cursor?.exhausted === true }
}
