import {
  getVideoStatus,
  hasVideoResumePriority,
  isVideoRemovedFromFeed,
  isVideoWatchLater
} from '../../domain/video-state.js'
import { isShortDuration } from '../../integrations/youtube-parsing.js'

export const ACTIVE_VIDEOS_PER_CHANNEL = 5

export function getVideoPausedTimestamp(video) {
  const timestamp = Date.parse(video?.pausedAt || '')
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function getVideoPublishedTimestamp(video) {
  const timestamp = Date.parse(video?.publishedAt || '')
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function compareActiveVideos(a, b) {
  return getVideoPublishedTimestamp(b) - getVideoPublishedTimestamp(a)
}

export function comparePausedVideos(a, b) {
  return getVideoPausedTimestamp(b) - getVideoPausedTimestamp(a)
    || compareActiveVideos(a, b)
}

export function getVideoDisplayChannelKey(video) {
  return video?.channelId || video?.channelTitle || `video:${video?.id || 'unknown'}`
}

export function compareChannelTimelineVideos(a, b) {
  const getPriority = video => hasVideoResumePriority(video)
    ? 0
    : isVideoWatchLater(video)
    ? 1
    : 2
  const priorityDifference = getPriority(a) - getPriority(b)
  return priorityDifference || compareActiveVideos(a, b)
}

export function normalizeChannelShelfOrder(order) {
  if (!Array.isArray(order)) return []
  return Array.from(new Set(
    order
      .map(key => String(key || '').trim())
      .filter(Boolean)
  ))
}

export function groupActiveVideosByChannel(
  videos,
  channelOrder = [],
  configuredChannels = [],
  chronologicalOnly = false,
  fallbackChannelTitle = ''
) {
  const groups = new Map()
  const configuredChannelsById = new Map(
    configuredChannels
      .filter(channel => channel?.id)
      .map(channel => [channel.id, channel])
  )
  videos.forEach(video => {
    const key = getVideoDisplayChannelKey(video)
    const configuredChannel = configuredChannelsById.get(key)
    const group = groups.get(key) || {
      key,
      title: video.channelTitle || fallbackChannelTitle,
      imageUrl: video.channelImageUrl || configuredChannel?.imageUrl || '',
      catalogId: configuredChannel?.catalogId || '',
      videos: []
    }
    if (!group.imageUrl && video.channelImageUrl) group.imageUrl = video.channelImageUrl
    group.videos.push(video)
    groups.set(key, group)
  })
  const orderedChannelIndexes = new Map(
    normalizeChannelShelfOrder(channelOrder).map((key, index) => [key, index])
  )
  return Array.from(groups.values())
    .map(group => ({
      ...group,
      videos: group.videos.sort(chronologicalOnly ? compareActiveVideos : compareChannelTimelineVideos)
    }))
    .sort((a, b) => {
      const aIndex = orderedChannelIndexes.get(a.key)
      const bIndex = orderedChannelIndexes.get(b.key)
      if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex
      if (aIndex !== undefined) return -1
      if (bIndex !== undefined) return 1
      const latestB = Math.max(...b.videos.map(getVideoPublishedTimestamp))
      const latestA = Math.max(...a.videos.map(getVideoPublishedTimestamp))
      return latestB - latestA
    })
}

export function matchesChannelFilter(video, selectedChannelIds) {
  return selectedChannelIds.has(video.channelId) || selectedChannelIds.has(video.channelTitle)
}

export function isSavedActiveVideo(video) {
  return ['partial', 'watch-later'].includes(getVideoStatus(video))
}

export function matchesActiveChannelFilter(video, selectedChannelIds, removedChannelIds) {
  return matchesChannelFilter(video, selectedChannelIds)
    || (
      isSavedActiveVideo(video)
      && (
        removedChannelIds.has(video.channelId)
        || removedChannelIds.has(video.channelTitle)
      )
    )
}

export function matchesWatchedChannelFilter(video, selectedChannelIds, removedChannelIds) {
  return matchesChannelFilter(video, selectedChannelIds)
    || removedChannelIds.has(video.channelId)
    || removedChannelIds.has(video.channelTitle)
}

export function isHiddenShortVideo(video, includeShorts) {
  return !includeShorts && isShortDuration(video?.duration)
}

export function getVisibleActiveVideos(videos, includeShorts = true, options = {}) {
  const limitPerChannel = options.limitPerChannel !== false
  const videoOrganizationEnabled = options.videoOrganizationEnabled !== false
  const byChannel = new Map()

  const visibleVideos = videos
    .filter(video => getVideoStatus(video) !== 'watched')
    .filter(video => !isHiddenFromVideoGrid(video, videoOrganizationEnabled))
    .filter(video => !isHiddenShortVideo(video, includeShorts))
    .sort(compareActiveVideos)

  if (!limitPerChannel) return visibleVideos

  visibleVideos.forEach(video => {
    const key = getActiveVideoGroupKey(video)
    const channelVideos = byChannel.get(key) || []
    if (channelVideos.length < ACTIVE_VIDEOS_PER_CHANNEL) {
      channelVideos.push(video)
      byChannel.set(key, channelVideos)
    }
  })

  return Array.from(byChannel.values())
    .flat()
    .sort(compareActiveVideos)
}

export function getActiveVideoGroupKey(video) {
  if (video?.manuallyAdded && video?.source === 'manual') {
    return `manual:${video.id || video.title || 'unknown'}`
  }
  return video?.channelId || video?.channelTitle || 'unknown'
}

export function isHiddenFromVideoGrid(video, videoOrganizationEnabled = true) {
  return Boolean(video?.hiddenFromGrid)
    || (videoOrganizationEnabled === true && isVideoRemovedFromFeed(video))
}

export function getRemovedFromFeedVideos(videos, includeShorts = true) {
  return videos
    .filter(video => isVideoRemovedFromFeed(video))
    .filter(video => !video?.hiddenFromGrid)
    .filter(video => !isHiddenShortVideo(video, includeShorts))
    .sort((left, right) => (
      Date.parse(right.removedFromFeedAt) - Date.parse(left.removedFromFeedAt)
    ))
}
