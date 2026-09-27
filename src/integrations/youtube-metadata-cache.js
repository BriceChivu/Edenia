const DAY = 86_400_000
export function isYoutubeMetadataFresh(record, now = Date.now()) {
  const age = now - Date.parse(record?.metadataFetchedAt)
  return Number.isFinite(age) && age >= 0 && age < 29 * DAY
}

export function clearYoutubeVideoMetadata(video) {
  Object.assign(video, {
    title: '', thumbnail: '', channelTitle: '', channelImageUrl: '', publishedAt: null,
    duration: 0, aspectRatio: null, isShort: false, shortsCheckedAt: null,
    shortsDetectionVersion: null, metadataUnavailable: true
  })
}

export function expireYoutubeMetadata(state, now = Date.now(), includeUndated = false) {
  let changed = false
  const expired = record => {
    const timestamp = Date.parse(record?.metadataFetchedAt)
    return Number.isFinite(timestamp) ? now - timestamp >= 30 * DAY : includeUndated
  }
  Object.values(state?.videos || {}).forEach(video => {
    if (expired({ metadataFetchedAt: video.channelMetadataFetchedAt }) && video.channelImageUrl) {
      video.channelImageUrl = ''
      changed = true
    }
    if (!expired(video)) return
    if (![video.title, video.thumbnail, video.channelTitle, video.channelImageUrl, video.publishedAt, video.duration, video.aspectRatio, video.isShort, video.shortsCheckedAt, video.shortsDetectionVersion].some(Boolean)) return
    clearYoutubeVideoMetadata(video)
    changed = true
  })
  const trackedChannels = state?.config?.channels || []
  trackedChannels.forEach(channel => {
    if (!expired(channel) || (channel.name === channel.id && !channel.imageUrl)) return
    channel.name = channel.id
    channel.imageUrl = ''
    changed = true
  })
  return changed
}

// Separate from playlist coverage. A manual-only library needs the same cache lifecycle.
export async function refreshSavedYoutubeMetadata({ state, fetchVideos, fetchChannels, isCurrent, readCurrent = () => state, now = Date.now() }) {
  if (!isCurrent()) return false
  let changed = expireYoutubeMetadata(state, now)
  if (now - Date.parse(state.youtubeMetadataFailedAt) < 30 * 60_000) return changed
  const stale = Object.values(state.videos || {}).filter(video => !isYoutubeMetadataFresh(video, now))
  const channels = new Map((state.config?.channels || []).map(channel => [channel.id, { ...channel }]))
  Object.values(state.videos || {}).forEach(video => {
    if (video.channelId?.startsWith('UC') && !channels.has(video.channelId)) channels.set(video.channelId, {
      id: video.channelId, name: video.channelTitle, imageUrl: video.channelImageUrl,
      metadataFetchedAt: video.channelMetadataFetchedAt
    })
  })
  const staleChannels = [...channels.values()].filter(channel => !isYoutubeMetadataFresh(channel, now))
  if (!stale.length && !staleChannels.length) return changed
  try {
    const details = await fetchVideos(stale.map(video => video.id))
    if (!isCurrent()) return false
    await fetchChannels(staleChannels)
    if (!isCurrent()) return false
    Object.assign(state, readCurrent())
    stale.forEach(candidate => {
      const video = state.videos?.[candidate.id]
      if (!video) return
      const detail = details[video.id]
      if (!detail || detail.metadataUnavailable) clearYoutubeVideoMetadata(video)
      if (detail) Object.assign(video, detail)
      video.metadataFetchedAt = new Date(now).toISOString()
    })
    staleChannels.forEach(channel => {
      const tracked = state.config?.channels?.find(record => record.id === channel.id)
      if (tracked) Object.assign(tracked, channel)
      Object.values(state.videos || {}).filter(video => video.channelId === channel.id).forEach(video => {
        video.channelImageUrl = channel.imageUrl || ''
        video.channelMetadataFetchedAt = channel.metadataFetchedAt
      })
    })
    state.youtubeMetadataFailedAt = null
    return true
  } catch {
    if (!isCurrent()) return false
    Object.assign(state, readCurrent())
    expireYoutubeMetadata(state, now, true)
    state.youtubeMetadataFailedAt = new Date(now).toISOString()
    return true
  }
}
