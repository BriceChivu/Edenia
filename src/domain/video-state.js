import { isValidTimestamp } from '../core/date-keys.js'

export const VIDEO_STATUSES = ['watch-later', 'unwatched', 'partial', 'watched']

export function normalizeVideoStatus(status) {
  return VIDEO_STATUSES.includes(status) ? status : 'unwatched'
}

export function getVideoStatus(video) {
  return normalizeVideoStatus(video?.status)
}

export function isFavoriteVideo(video) {
  return video?.favorite === true
}

export function isVideoSetAside(video) {
  return getVideoStatus(video) === 'watched' && video?.setAside === true
}

export function isVideoRemovedFromFeed(video) {
  return typeof video?.removedFromFeedAt === 'string'
    && isValidTimestamp(video.removedFromFeedAt)
}

export function hasWatchedConfirmationUnlock(video) {
  return isValidTimestamp(video?.watchedConfirmationUnlockedAt)
}

export function normalizeResumeAtSeconds(value, duration = null) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0) return null
  const rounded = Math.floor(seconds)
  if (Number.isFinite(duration) && duration > 0) return Math.min(rounded, Math.max(0, duration - 1))
  return rounded
}

export function hasVideoResumePriority(video) {
  const status = getVideoStatus(video)
  return status === 'partial'
    || (
      status === 'watched'
      && isFavoriteVideo(video)
      && normalizeResumeAtSeconds(video?.resumeAtSeconds, video?.duration) !== null
    )
    || (
      status === 'watch-later'
      && normalizeResumeAtSeconds(video?.resumeAtSeconds, video?.duration) > 0
    )
}

export function isVideoWatchLater(video) {
  return getVideoStatus(video) === 'watch-later' || video?.watchLater === true
}

export function getVideoUrl(video) {
  const videoId = String(video?.id ?? '')
  const url = `https://youtube.com/watch?v=${encodeURIComponent(videoId)}`
  const resumeAtSeconds = hasVideoResumePriority(video)
    ? normalizeResumeAtSeconds(video?.resumeAtSeconds, video?.duration)
    : null
  return resumeAtSeconds !== null ? `${url}&t=${resumeAtSeconds}s` : url
}
