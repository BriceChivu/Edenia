export const YOUTUBE_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{20,}$/
const YOUTUBE_HANDLE_RE = /^@[\p{L}\p{N}\p{M}._-]{3,30}$/u
const SHORT_VIDEO_MAX_DURATION_SECONDS = 180

export function getYoutubeUploadsPlaylistId(channelId) {
  return 'UU' + channelId.slice(2)
}

export function parseYoutubeDuration(iso) {
  if (!iso) return 0
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  return match
    ? (
      parseInt(match[1] || 0) * 3600
      + parseInt(match[2] || 0) * 60
      + parseInt(match[3] || 0)
    )
    : 0
}

export function normalizeVideoAspectRatio(value) {
  const ratio = Number(value)
  return Number.isFinite(ratio) && ratio >= 0.25 && ratio <= 4 ? ratio : null
}

export function isShortDuration(seconds) {
  const duration = Number(seconds || 0)
  return duration > 0 && duration < SHORT_VIDEO_MAX_DURATION_SECONDS
}

export function getVideoAspectRatioFromItem(item) {
  const width = Number(item?.player?.embedWidth)
  const height = Number(item?.player?.embedHeight)
  return width > 0 && height > 0
    ? normalizeVideoAspectRatio(width / height)
    : null
}

export function getVideoDetailFromItem(item) {
  const detail = {
    duration: parseYoutubeDuration(item?.contentDetails?.duration),
    aspectRatio: getVideoAspectRatioFromItem(item)
  }
  detail.isShort = isShortDuration(detail.duration)
  return detail
}

export function getBestYoutubeThumbnail(thumbnails = {}) {
  return thumbnails.maxres?.url
    || thumbnails.high?.url
    || thumbnails.medium?.url
    || thumbnails.default?.url
    || ''
}

function normalizeYoutubeUrlHost(hostname = '') {
  return String(hostname || '')
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/^m\./, '')
}

function isYoutubeHost(host) {
  return host === 'youtube.com'
    || host.endsWith('.youtube.com')
    || host === 'youtube-nocookie.com'
}

function decodePathPart(value = '') {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseYoutubeChannelInput(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (YOUTUBE_CHANNEL_ID_RE.test(raw)) return { kind: 'id', channelId: raw }
  if (YOUTUBE_HANDLE_RE.test(raw)) return { kind: 'handle', handle: raw }

  const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
    ? raw
    : `https://${raw}`
  try {
    const url = new URL(normalized)
    const host = normalizeYoutubeUrlHost(url.hostname)
    if (!isYoutubeHost(host)) return null

    const parts = url.pathname.split('/').filter(Boolean).map(decodePathPart)
    const [first, second] = parts
    if (first === 'channel' && YOUTUBE_CHANNEL_ID_RE.test(second || '')) {
      return { kind: 'id', channelId: second }
    }
    if (YOUTUBE_HANDLE_RE.test(first || '')) {
      return { kind: 'handle', handle: first }
    }
    if (first === 'user' && second) {
      return { kind: 'username', username: second }
    }
    if (
      (first === 'c' && second)
      || (
        first
        && !['watch', 'embed', 'shorts', 'live', 'playlist'].includes(first)
      )
    ) {
      return { kind: 'custom-url' }
    }
  } catch {
    return null
  }

  return null
}

export function parseYoutubeVideoId(value) {
  const raw = String(value || '').trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw

  const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
    ? raw
    : `https://${raw}`
  try {
    const url = new URL(normalized)
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      if (/^[A-Za-z0-9_-]{11}$/.test(id || '')) return id
    }
    if (
      host === 'youtube.com'
      || host.endsWith('.youtube.com')
      || host === 'youtube-nocookie.com'
    ) {
      const watchedId = url.searchParams.get('v')
      if (/^[A-Za-z0-9_-]{11}$/.test(watchedId || '')) return watchedId
      const parts = url.pathname.split('/').filter(Boolean)
      if (
        ['embed', 'shorts', 'live', 'v'].includes(parts[0])
        && /^[A-Za-z0-9_-]{11}$/.test(parts[1] || '')
      ) {
        return parts[1]
      }
    }
  } catch {
    // Fall back to pattern matching below.
  }

  const match = raw.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/
  )
  return match?.[1] || ''
}

export function isYoutubeVideoId(id) {
  return /^[\w-]{11}$/.test(String(id || ''))
}
