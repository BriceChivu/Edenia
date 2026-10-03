import { storageBytes } from '../state/storage-budget.js'

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
    // Duration can be the source of older watched Study facts.
    duration: video.status === 'watched' || video.status === 'partial' || video.watchProgress?.length
      ? video.duration : 0, shortsCheckedAt: null,
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
  onChange = () => true, onOutcome = () => {}, priorityIds = [], now = Date.now()
}) {
  const reload = () => {
    if (!isCurrent()) return false
    Object.assign(state, readCurrent())
    return true
  }
  if (!reload()) return false
  const changed = expireYoutubeMetadata(state, now)
  if (changed && await onChange(state) === false) return false
  if (now - Date.parse(state.youtubeMetadataFailedAt) < 30 * 60_000) return changed
  const visible = new Set(priorityIds)
  const priority = video => visible.has(video.id) ? 0
    : video.status === 'partial' || video.resumeAtSeconds > 0 ? 1
    : video.watchLater || video.favorite ? 2 : 3
  const stale = Object.values(state.videos || {})
    .filter(video => !isYoutubeMetadataFresh(video, now)
      || (!video.metadataUnavailable && (!video.title && !video.thumbnail)))
    .sort((a, b) => priority(a) - priority(b))
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
        else if (video.metadataUnavailable) video.metadataUnavailable = false
        if (detail) Object.assign(video, detail)
        video.metadataFetchedAt = detail?.metadataFetchedAt || new Date(now).toISOString()
      })
      if (await onChange(state) === false) return false
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
      if (await onChange(state) === false) return false
      outcome.channels += batch.length
    }
    state.youtubeMetadataFailedAt = null
  } catch (error) {
    if (!reload()) return false
    if (error?.kind === 'recovery-budget') {
      if (!outcome.videos && !outcome.channels) return changed
      outcome.status = 'partial'
      outcome.deferred = true
      onOutcome(state, outcome)
      return await onChange(state) !== false
    }
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
  return await onChange(state) !== false
}

export const YOUTUBE_METADATA_BYTE_LIMIT = 2 * 1024 * 1024
const VIDEO_METADATA_FIELDS = [
  'title', 'thumbnail', 'channelTitle', 'channelImageUrl', 'publishedAt',
  'shortsCheckedAt', 'shortsDetectionVersion'
]

export function budgetYoutubeMetadata(state, maxBytes = YOUTUBE_METADATA_BYTE_LIMIT) {
  const candidates = Object.values(state?.videos || {}).map(video => ({
    video,
    bytes: storageBytes(Object.fromEntries(VIDEO_METADATA_FIELDS
      .filter(key => video[key] !== undefined).map(key => [key, video[key]]))) - 4
  })).sort((a, b) => (Date.parse(a.video.metadataFetchedAt) || 0) - (Date.parse(b.video.metadataFetchedAt) || 0))
  let bytes = candidates.reduce((total, entry) => total + entry.bytes, 0)
  if (bytes <= maxBytes) return false
  let changed = false
  for (const { video, bytes: previousBytes } of candidates) {
    if (bytes <= maxBytes * 0.75) break
    VIDEO_METADATA_FIELDS.forEach(key => { delete video[key] })
    // Expired entries must remain fetchable, while learner-owned fields survive.
    delete video.metadataFetchedAt
    bytes -= previousBytes
    changed = true
  }
  return changed
}
