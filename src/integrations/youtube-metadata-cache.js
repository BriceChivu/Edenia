const DAY = 86_400_000
export function isYoutubeMetadataFresh(record, now = Date.now()) {
  const age = now - Date.parse(record?.metadataFetchedAt)
  // An unavailable lookup only suppresses automatic retries for one day.
  // Its persisted timestamp must not grant the normal populated-cache lifetime.
  const lifetime = record?.metadataUnavailable ? DAY : 29 * DAY
  return Number.isFinite(age) && age >= 0 && age < lifetime
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
export async function refreshSavedYoutubeMetadata({
  state, fetchVideos, fetchChannels, isCurrent, readCurrent = () => state,
  onChange = () => true, onOutcome = () => {}, now = Date.now()
}) {
  const reload = () => {
    if (!isCurrent()) return false
    Object.assign(state, readCurrent())
    return true
  }
  if (!reload()) return false
  const changed = expireYoutubeMetadata(state, now)
  if (changed && onChange(state) === false) return false
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
  const outcome = { status: 'complete', videos: 0, channels: 0, failure: null }
  let phase = 'videos'
  try {
    for (let index = 0; index < stale.length; index += 50) {
      if (!isCurrent()) return false
      const batch = stale.slice(index, index + 50)
      const details = await fetchVideos(batch.map(video => video.id))
      if (!reload()) return false
      batch.forEach(candidate => {
        const video = state.videos?.[candidate.id]
        if (!video) return
        const detail = details[video.id]
        if (!detail || detail.metadataUnavailable) clearYoutubeVideoMetadata(video)
        if (detail) Object.assign(video, detail)
        video.metadataFetchedAt = new Date(now).toISOString()
      })
      if (onChange(state) === false) return false
      outcome.videos += batch.length
    }
    phase = 'channels'
    for (let index = 0; index < staleChannels.length; index += 50) {
      if (!isCurrent()) return false
      const batch = staleChannels.slice(index, index + 50)
      await fetchChannels(batch)
      if (!reload()) return false
      batch.forEach(channel => {
        const tracked = state.config?.channels?.find(record => record.id === channel.id)
        if (tracked) Object.assign(tracked, {
          name: channel.name, imageUrl: channel.imageUrl, metadataFetchedAt: channel.metadataFetchedAt
        })
        Object.values(state.videos || {}).filter(video => video.channelId === channel.id).forEach(video => {
          video.channelImageUrl = channel.imageUrl || ''
          video.channelMetadataFetchedAt = channel.metadataFetchedAt
        })
      })
      if (onChange(state) === false) return false
      outcome.channels += batch.length
    }
    state.youtubeMetadataFailedAt = null
  } catch (error) {
    if (!reload()) return false
    if (error?.kind !== 'daily-quota') expireYoutubeMetadata(state, now, true)
    state.youtubeMetadataFailedAt = error?.kind === 'daily-quota' ? null : new Date(now).toISOString()
    outcome.status = outcome.videos || outcome.channels ? 'partial' : 'failure'
    // Only allow known classifications into learner-visible logs, never provider text/URLs.
    const kind = ['daily-quota', 'rate-limit', 'credentials', 'unavailable', 'provider', 'timeout'].includes(error?.kind)
      ? error.kind : error?.name === 'AbortError' ? 'timeout' : 'network'
    outcome.failure = { kind, phase }
  }
  if (!isCurrent()) return false
  onOutcome(state, outcome)
  return onChange(state) !== false
}
