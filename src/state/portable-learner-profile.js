import { isValidTimestamp, toDateKey } from '../core/date-keys.js'
import {
  isFavoriteVideo,
  isVideoRemovedFromFeed,
  isVideoWatchLater,
  normalizeResumeAtSeconds,
  normalizeVideoStatus
} from '../domain/video-state.js'
import { normalizeLocale } from '../i18n/runtime.js'
import {
  normalizeChannelVideoFormatPreferences
} from '../features/channels/video-format-actions.js'
import { normalizeChannelShelfOrder } from '../features/videos/feed-selectors.js'
import {
  normalizeAnkiCount,
  normalizeAnkiEnabled,
  normalizeIncludeShorts,
  normalizeWeeklyGoalHours
} from './config-normalization.js'
import {
  canonicalizeJson,
  sha256Base64Url
} from './portable-state.js'
import { isValidStateShape } from './persistence-contract.js'

export const PORTABLE_LEARNER_PROFILE_SCHEMA =
  'edenia-portable-learner-profile'
export const PORTABLE_LEARNER_PROFILE_VERSION = 1
export const PORTABLE_LEARNER_PROFILE_MAX_BYTES = 2 * 1024 * 1024

const SHA256_BASE64URL_PATTERN = /^[A-Za-z0-9_-]{43}$/
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ACTIVITY_LOG_LIMIT = 500
const VIDEO_STATUSES = new Set([
  'watch-later',
  'unwatched',
  'partial',
  'watched'
])
const ACTIVITY_META_STRING_KEYS = new Set([
  'channelId',
  'operation',
  'status',
  'videoId'
])
const ACTIVITY_META_NUMBER_KEYS = new Set([
  'fetchedCount',
  'levelIndex',
  'mergedCount',
  'pointsDelta',
  'seconds',
  'skippedShorts'
])

function isPlainRecord(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
  )
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainRecord(value)) return false
  const actualKeys = Object.keys(value).sort()
  const sortedExpected = [...expectedKeys].sort()
  return actualKeys.length === sortedExpected.length
    && actualKeys.every((key, index) => key === sortedExpected[index])
}

function cloneJson(value) {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) {
    throw new TypeError('Portable learner profile must be JSON serializable')
  }
  return JSON.parse(serialized)
}

function getUtf8ByteLength(value) {
  return new TextEncoder().encode(String(value)).byteLength
}

function normalizeTimestamp(value) {
  return isValidTimestamp(value) ? new Date(value).toISOString() : null
}

function isValidDateKey(value) {
  if (!DATE_KEY_PATTERN.test(String(value || ''))) return false
  const [year, month, day] = String(value).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function normalizeOptionalString(value) {
  const normalized = normalizeString(value).trim()
  return normalized || null
}

function normalizeStringList(value) {
  const seen = new Set()
  return (Array.isArray(value) ? value : [])
    .map(item => String(item || '').trim())
    .filter(item => item && !seen.has(item) && seen.add(item))
    .sort()
}

function normalizeChannel(channel) {
  const id = normalizeOptionalString(channel?.id)
  if (!id) return null
  return {
    catalogId: normalizeOptionalString(channel.catalogId),
    id,
    imageUrl: normalizeString(channel.imageUrl),
    name: normalizeString(channel.name, id)
  }
}

function normalizeChannels(value) {
  const channels = (Array.isArray(value) ? value : [])
    .map(normalizeChannel)
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id))
  const byId = new Map()
  for (const channel of channels) {
    const existing = byId.get(channel.id)
    if (existing && canonicalizeJson(existing) !== canonicalizeJson(channel)) {
      throw new TypeError('Portable learner profile has conflicting channels')
    }
    byId.set(channel.id, channel)
  }
  return [...byId.values()]
}

function normalizeLearnerProfile(value) {
  const profile = isPlainRecord(value) ? value : {}
  return {
    createdAt: normalizeTimestamp(profile.createdAt),
    languages: normalizeStringList(profile.languages),
    level: normalizeOptionalString(profile.level),
    selectedChannelCatalogIds: normalizeStringList(
      profile.selectedChannelCatalogIds
    ),
    updatedAt: normalizeTimestamp(profile.updatedAt)
  }
}

function normalizeConfig(value) {
  const config = isPlainRecord(value) ? value : {}
  const channelVideoFormats = normalizeChannelVideoFormatPreferences(
    config.channelVideoFormats
  )
  return {
    ankiEnabled: normalizeAnkiEnabled(config.ankiEnabled),
    channelShelfOrder: normalizeChannelShelfOrder(config.channelShelfOrder),
    channelVideoFormats: Object.fromEntries(
      Object.entries(channelVideoFormats)
        .sort(([left], [right]) => left.localeCompare(right))
    ),
    channels: normalizeChannels(config.channels),
    includeShorts: normalizeIncludeShorts(config.includeShorts),
    locale: normalizeLocale(config.locale),
    removedChannelIds: normalizeStringList(config.removedChannelIds),
    removedDefaultChannelIds: normalizeStringList(
      config.removedDefaultChannelIds
    ),
    weeklyGoalHours: normalizeWeeklyGoalHours(config.weeklyGoalHours)
  }
}

function normalizeWatchProgress(videoId, progress, duration, options = {}) {
  const maxSeconds = Number.isFinite(Number(duration)) && Number(duration) > 0
    ? Math.floor(Number(duration))
    : null
  const entries = (Array.isArray(progress) ? progress : [])
    .filter(isPlainRecord)
    .map(entry => {
      const watchedAt = normalizeTimestamp(entry.watchedAt)
      const rawSeconds = Math.floor(Number(entry.seconds) || 0)
      const seconds = maxSeconds === null
        ? Math.max(0, rawSeconds)
        : Math.min(maxSeconds, Math.max(0, rawSeconds))
      if (!watchedAt || seconds < 1) return null
      const studyDay = isValidDateKey(entry.studyDay)
        ? entry.studyDay
        : toDateKey(new Date(watchedAt))
      return { seconds, studyDay, watchedAt }
    })
    .filter(Boolean)

  if (
    !entries.length
    && options.watchProgressTracked !== true
    && options.status === 'watched'
    && options.watchedAt
    && maxSeconds > 0
  ) {
    entries.push({
      seconds: maxSeconds,
      studyDay: toDateKey(new Date(options.watchedAt)),
      watchedAt: options.watchedAt
    })
  }

  return entries
    .sort((left, right) => (
      left.watchedAt.localeCompare(right.watchedAt)
      || left.studyDay.localeCompare(right.studyDay)
      || left.seconds - right.seconds
    ))
    .map((entry, index) => ({
      id: `video:${encodeURIComponent(videoId)}:${entry.watchedAt}:${entry.seconds}:${index + 1}`,
      seconds: entry.seconds,
      studyDay: entry.studyDay,
      watchedAt: entry.watchedAt
    }))
}

function normalizeVideo(videoKey, value) {
  const video = isPlainRecord(value) ? value : {}
  const id = normalizeOptionalString(video.id) || normalizeOptionalString(videoKey)
  if (!id) return null
  const duration = Math.max(0, Math.floor(Number(video.duration) || 0))
  const status = VIDEO_STATUSES.has(video.status)
    ? normalizeVideoStatus(video.status)
    : 'unwatched'
  const watchedAt = normalizeTimestamp(video.watchedAt)
  const watchProgress = normalizeWatchProgress(
    id,
    video.watchProgress,
    duration,
    {
      status,
      watchedAt,
      watchProgressTracked: video.watchProgressTracked
    }
  )
  const resumeAtSeconds = normalizeResumeAtSeconds(
    video.resumeAtSeconds,
    duration
  )
  const removedFromFeedAt = normalizeTimestamp(video.removedFromFeedAt)
  const manuallyAdded = video.manuallyAdded === true
  const hiddenFromGrid = video.hiddenFromGrid === true
  const retained = status !== 'unwatched'
    || isFavoriteVideo(video)
    || isVideoWatchLater(video)
    || Boolean(removedFromFeedAt)
    || resumeAtSeconds !== null
    || watchProgress.length > 0
    || manuallyAdded
    || hiddenFromGrid
    || Boolean(normalizeTimestamp(video.watchedConfirmationUnlockedAt))
  if (!retained) return null

  const aspectRatio = Number(video.aspectRatio)
  return {
    aspectRatio: Number.isFinite(aspectRatio) && aspectRatio > 0
      ? aspectRatio
      : null,
    channelId: normalizeOptionalString(video.channelId),
    channelImageUrl: normalizeString(video.channelImageUrl),
    channelTitle: normalizeString(video.channelTitle),
    duration,
    favorite: isFavoriteVideo(video),
    hiddenFromGrid,
    hiddenFromGridAt: hiddenFromGrid
      ? normalizeTimestamp(video.hiddenFromGridAt)
      : null,
    id,
    isShort: video.isShort === true,
    manuallyAdded,
    pausedAt: resumeAtSeconds !== null
      ? normalizeTimestamp(video.pausedAt)
      : null,
    publishedAt: normalizeTimestamp(video.publishedAt),
    removedFromFeedAt,
    resumeAtSeconds,
    source: normalizeOptionalString(video.source),
    status,
    thumbnail: normalizeString(video.thumbnail),
    title: normalizeString(video.title, id),
    watchLater: isVideoWatchLater(video),
    watchProgress,
    watchProgressTracked: true,
    watchedAt,
    watchedConfirmationUnlockedAt: normalizeTimestamp(
      video.watchedConfirmationUnlockedAt
    )
  }
}

function normalizeVideos(value) {
  const videos = isPlainRecord(value) ? value : {}
  const normalized = Object.entries(videos)
    .map(([videoKey, video]) => normalizeVideo(videoKey, video))
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id))
  const byId = new Map()
  for (const video of normalized) {
    const existing = byId.get(video.id)
    if (existing && canonicalizeJson(existing) !== canonicalizeJson(video)) {
      throw new TypeError('Portable learner profile has conflicting videos')
    }
    byId.set(video.id, video)
  }
  return Object.fromEntries([...byId.entries()])
}

function readAnkiObservations(source) {
  if (Array.isArray(source)) {
    return source.map(day => [day?.studyDay, day])
  }
  if (isPlainRecord(source)) return Object.entries(source)
  return []
}

export function reconcilePortableAnkiDays(...sources) {
  const byDate = new Map()
  for (const source of sources) {
    for (const [sourceDateKey, value] of readAnkiObservations(source)) {
      if (!isPlainRecord(value)) continue
      const studyDay = isValidDateKey(value.studyDay)
        ? value.studyDay
        : sourceDateKey
      if (!isValidDateKey(studyDay)) continue
      const observedAt = normalizeTimestamp(value.observedAt || value.loggedAt)
      const existing = byDate.get(studyDay)
      const next = {
        created: Math.max(
          existing?.created || 0,
          normalizeAnkiCount(value.created)
        ),
        observedAt: [existing?.observedAt, observedAt]
          .filter(Boolean)
          .sort()
          .at(-1) || null,
        reviewed: Math.max(
          existing?.reviewed || 0,
          normalizeAnkiCount(value.reviewed)
        )
      }
      byDate.set(studyDay, next)
    }
  }
  return Object.fromEntries(
    [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right))
  )
}

function normalizeCityProgress(value) {
  const cityProgress = isPlainRecord(value) ? value : {}
  return {
    maxLevelIndex: Math.max(
      0,
      Math.floor(Number(cityProgress.maxLevelIndex) || 0)
    )
  }
}

function normalizeOnboarding(value) {
  const onboardingState = isPlainRecord(value) ? value : {}
  return {
    introSeenAt: normalizeTimestamp(onboardingState.introSeenAt),
    levelUpGuidanceShownAt: normalizeTimestamp(
      onboardingState.levelUpGuidanceShownAt
    ),
    recommendationsAppliedAt: normalizeTimestamp(
      onboardingState.recommendationsAppliedAt
    ),
    setupCompleted: onboardingState.setupCompleted === true,
    setupCompletedAt: onboardingState.setupCompleted === true
      ? normalizeTimestamp(onboardingState.setupCompletedAt)
      : null,
    walkthroughCompleted: onboardingState.walkthroughCompleted === true,
    walkthroughCompletedAt: onboardingState.walkthroughCompleted === true
      ? normalizeTimestamp(onboardingState.walkthroughCompletedAt)
      : null
  }
}

function normalizeNoAnkiPrompt(value) {
  const prompt = isPlainRecord(value) ? value : {}
  const response = ['yes', 'not-interested'].includes(prompt.response)
    ? prompt.response
    : null
  return {
    respondedAt: response ? normalizeTimestamp(prompt.respondedAt) : null,
    response
  }
}

function normalizeActivityMeta(value) {
  if (!isPlainRecord(value)) return null
  const entries = []
  for (const [key, rawValue] of Object.entries(value)) {
    if (ACTIVITY_META_STRING_KEYS.has(key)) {
      const stringValue = normalizeOptionalString(rawValue)
      if (stringValue) entries.push([key, stringValue])
    } else if (ACTIVITY_META_NUMBER_KEYS.has(key)) {
      const numberValue = Number(rawValue)
      if (Number.isFinite(numberValue)) entries.push([key, numberValue])
    }
  }
  return entries.length
    ? Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)))
    : null
}

function normalizeActivityLog(value) {
  const entries = (Array.isArray(value) ? value : [])
    .filter(isPlainRecord)
    .map((entry, index) => {
      const createdAt = normalizeTimestamp(entry.createdAt)
      if (!createdAt) return null
      const type = normalizeOptionalString(entry.type) || 'general'
      const normalized = {
        actor: entry.actor === 'auto' ? 'auto' : 'user',
        createdAt,
        detail: normalizeString(entry.detail),
        id: normalizeOptionalString(entry.id)
          || `activity:${createdAt}:${encodeURIComponent(type)}:${index + 1}`,
        status: ['success', 'warn', 'error', 'info'].includes(entry.status)
          ? entry.status
          : 'info',
        title: normalizeString(entry.title),
        type
      }
      const meta = normalizeActivityMeta(entry.meta)
      return meta ? { ...normalized, meta } : normalized
    })
    .filter(Boolean)
    .sort((left, right) => (
      right.createdAt.localeCompare(left.createdAt)
      || left.id.localeCompare(right.id)
    ))

  const byId = new Map()
  for (const entry of entries) {
    const existing = byId.get(entry.id)
    if (existing && canonicalizeJson(existing) !== canonicalizeJson(entry)) {
      throw new TypeError(
        'Portable learner profile has conflicting activity history'
      )
    }
    byId.set(entry.id, entry)
  }
  return [...byId.values()].slice(0, ACTIVITY_LOG_LIMIT)
}

function createPortableProfile(state) {
  if (!isValidStateShape(state)) {
    throw new TypeError('Portable learner profile source is invalid')
  }
  return {
    activityLog: normalizeActivityLog(state.activityLog),
    anki: reconcilePortableAnkiDays(state.anki),
    cityProgress: normalizeCityProgress(state.cityProgress),
    config: normalizeConfig(state.config),
    learnerProfile: normalizeLearnerProfile(state.learnerProfile),
    noAnkiFrequentUserPrompt: normalizeNoAnkiPrompt(
      state.noAnkiFrequentUserPrompt
    ),
    onboarding: normalizeOnboarding(state.onboarding),
    videos: normalizeVideos(state.videos)
  }
}

function isCanonicalProfile(profile) {
  try {
    return canonicalizeJson(createPortableProfile(profile))
      === canonicalizeJson(profile)
  } catch {
    return false
  }
}

function validateMaximumBytes(maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError(
      'Portable learner profile maximum bytes must be positive'
    )
  }
}

function serializeWithByteLength(envelope) {
  let byteLength = 0
  for (let attempt = 0; attempt < 8; attempt += 1) {
    envelope.integrity.byteLength = byteLength
    const serialized = canonicalizeJson(envelope)
    const measuredByteLength = getUtf8ByteLength(serialized)
    if (measuredByteLength === byteLength) {
      return { serialized, byteLength }
    }
    byteLength = measuredByteLength
  }
  throw new TypeError('Portable learner profile byte length did not settle')
}

export async function createPortableLearnerProfileEnvelope(
  state,
  {
    cryptoLike = globalThis.crypto,
    maxBytes = PORTABLE_LEARNER_PROFILE_MAX_BYTES,
    now = () => new Date()
  } = {}
) {
  validateMaximumBytes(maxBytes)
  const profile = createPortableProfile(cloneJson(state))
  const exportedAt = normalizeTimestamp(now())
  if (!exportedAt) {
    throw new TypeError('Portable learner profile export time is invalid')
  }
  const profileSha256 = await sha256Base64Url(
    canonicalizeJson({
      profile,
      schema: PORTABLE_LEARNER_PROFILE_SCHEMA,
      version: PORTABLE_LEARNER_PROFILE_VERSION
    }),
    cryptoLike
  )
  const envelope = {
    exportedAt,
    integrity: {
      algorithm: 'SHA-256',
      byteLength: 0,
      profileSha256
    },
    profile,
    schema: PORTABLE_LEARNER_PROFILE_SCHEMA,
    version: PORTABLE_LEARNER_PROFILE_VERSION
  }
  const { serialized, byteLength } = serializeWithByteLength(envelope)
  if (byteLength > maxBytes) {
    throw new RangeError('Portable learner profile is too large')
  }
  return {
    byteLength,
    envelope: JSON.parse(serialized),
    serialized
  }
}

export async function verifyPortableLearnerProfileEnvelope(
  value,
  {
    cryptoLike = globalThis.crypto,
    maxBytes = PORTABLE_LEARNER_PROFILE_MAX_BYTES
  } = {}
) {
  try {
    validateMaximumBytes(maxBytes)
    const envelope = typeof value === 'string'
      ? JSON.parse(value)
      : cloneJson(value)
    if (
      !hasExactKeys(envelope, [
        'exportedAt',
        'integrity',
        'profile',
        'schema',
        'version'
      ])
      || envelope.schema !== PORTABLE_LEARNER_PROFILE_SCHEMA
      || envelope.version !== PORTABLE_LEARNER_PROFILE_VERSION
      || normalizeTimestamp(envelope.exportedAt) !== envelope.exportedAt
      || !hasExactKeys(envelope.integrity, [
        'algorithm',
        'byteLength',
        'profileSha256'
      ])
      || envelope.integrity.algorithm !== 'SHA-256'
      || !Number.isSafeInteger(envelope.integrity.byteLength)
      || envelope.integrity.byteLength < 1
      || !SHA256_BASE64URL_PATTERN.test(envelope.integrity.profileSha256)
      || !isCanonicalProfile(envelope.profile)
    ) return null

    const serialized = canonicalizeJson(envelope)
    if (typeof value === 'string' && value !== serialized) return null
    const byteLength = getUtf8ByteLength(serialized)
    if (
      byteLength !== envelope.integrity.byteLength
      || byteLength > maxBytes
    ) return null

    const profileSha256 = await sha256Base64Url(
      canonicalizeJson({
        profile: envelope.profile,
        schema: envelope.schema,
        version: envelope.version
      }),
      cryptoLike
    )
    return profileSha256 === envelope.integrity.profileSha256
      ? JSON.parse(serialized)
      : null
  } catch {
    return null
  }
}
