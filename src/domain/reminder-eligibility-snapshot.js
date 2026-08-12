import { getVideoStatus } from './video-state.js'
import {
  compareActiveVideos,
  isHiddenFromVideoGrid,
  isHiddenShortVideo
} from '../features/videos/feed-selectors.js'
import {
  isYoutubeVideoId,
  YOUTUBE_CHANNEL_ID_RE
} from '../integrations/youtube-parsing.js'

export const MAX_REMINDER_SNAPSHOT_CHANNELS = 250

const SUPPORTED_LANGUAGES = new Set([
  'mandarin',
  'japanese',
  'korean',
  'spanish',
  'french',
  'german',
  'english',
  'other'
])

function boundedText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeVideoCandidate(video) {
  if (
    !video
    || isHiddenFromVideoGrid(video)
    || !isYoutubeVideoId(video.id)
  ) return null

  const title = boundedText(video.title, 300)
  const publishedAt = new Date(video.publishedAt || '')
  if (!title || Number.isNaN(publishedAt.getTime())) return null
  return {
    latestVideoId: String(video.id),
    latestVideoTitle: title,
    latestVideoPublishedAt: publishedAt.toISOString()
  }
}

export function createReminderEligibilitySnapshot({
  state,
  timezone,
  locale,
  studyDate,
  pointsToday,
  lastQualifiedStudyDate = null,
  currentStreakDays = 0,
  includeShorts = true
}) {
  const configuredChannels = Array.isArray(state?.config?.channels)
    ? state.config.channels
    : []
  const channels = Array.from(new Map(
    configuredChannels
      .map(channel => ({
        channelId: String(channel?.id || '').trim(),
        channelName: boundedText(channel?.name || channel?.id, 200)
      }))
      .filter(channel => (
        YOUTUBE_CHANNEL_ID_RE.test(channel.channelId)
        && channel.channelName
      ))
      .map(channel => [channel.channelId, channel])
  ).values()).slice(0, MAX_REMINDER_SNAPSHOT_CHANNELS)
  const trackedIds = new Set(channels.map(channel => channel.channelId))
  const latestByChannel = new Map()
  const streakByChannel = new Map()

  Object.values(state?.videos || {})
    .filter(video => trackedIds.has(String(video?.channelId || '')))
    .filter(video => includeShorts || !isHiddenShortVideo(video, false))
    .sort(compareActiveVideos)
    .forEach(video => {
      const candidate = normalizeVideoCandidate(video)
      if (!candidate) return
      if (!latestByChannel.has(video.channelId)) {
        latestByChannel.set(video.channelId, candidate)
      }
      if (
        getVideoStatus(video) === 'unwatched'
        && !streakByChannel.has(video.channelId)
      ) {
        streakByChannel.set(video.channelId, {
          streakVideoId: candidate.latestVideoId,
          streakVideoTitle: candidate.latestVideoTitle,
          streakVideoPublishedAt: candidate.latestVideoPublishedAt
        })
      }
    })

  const learningLanguage = Array.isArray(state?.learnerProfile?.languages)
    && SUPPORTED_LANGUAGES.has(state.learnerProfile.languages[0])
    ? state.learnerProfile.languages[0]
    : null

  return {
    timezone,
    locale,
    learningLanguage,
    studyDate,
    pointsToday: Math.max(0, Math.floor(Number(pointsToday) || 0)),
    lastQualifiedStudyDate: lastQualifiedStudyDate || null,
    currentStreakDays: Math.max(0, Math.floor(Number(currentStreakDays) || 0)),
    channels: channels.map(channel => ({
      ...channel,
      latestVideoId: null,
      latestVideoTitle: null,
      latestVideoPublishedAt: null,
      streakVideoId: null,
      streakVideoTitle: null,
      streakVideoPublishedAt: null,
      ...latestByChannel.get(channel.channelId),
      ...streakByChannel.get(channel.channelId)
    }))
  }
}
