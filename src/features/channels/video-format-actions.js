import { normalizeVideoAspectRatio } from '../../integrations/youtube-parsing.js'

export const CHANNEL_VIDEO_FORMATS = Object.freeze({
  VIDEOS: 'videos',
  SHORTS: 'shorts'
})

const boundControls = new WeakSet()
const controlSelector = '[data-channel-video-format-action="select"]'

export function normalizeChannelVideoFormat(value) {
  return value === CHANNEL_VIDEO_FORMATS.SHORTS
    ? CHANNEL_VIDEO_FORMATS.SHORTS
    : CHANNEL_VIDEO_FORMATS.VIDEOS
}

export function getAvailableChannelVideoFormat(value, counts = {}) {
  const selectedFormat = normalizeChannelVideoFormat(value)
  const alternateFormat = selectedFormat === CHANNEL_VIDEO_FORMATS.VIDEOS
    ? CHANNEL_VIDEO_FORMATS.SHORTS
    : CHANNEL_VIDEO_FORMATS.VIDEOS
  const selectedCount = Math.max(0, Number(counts?.[selectedFormat]) || 0)
  const alternateCount = Math.max(0, Number(counts?.[alternateFormat]) || 0)
  return selectedCount === 0 && alternateCount > 0
    ? alternateFormat
    : selectedFormat
}

export function getChannelVideoFormat(video) {
  const aspectRatio = normalizeVideoAspectRatio(video?.aspectRatio)
  return aspectRatio !== null && aspectRatio < 1
    ? CHANNEL_VIDEO_FORMATS.SHORTS
    : CHANNEL_VIDEO_FORMATS.VIDEOS
}

export function bindChannelVideoFormatActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Channel video format actions require a queryable root')
  }
  if (!actions || typeof actions.select !== 'function') {
    throw new TypeError('Channel video format actions require a select callback')
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (!control || boundControls.has(control)) return
    const channelKey = String(control.dataset?.channelKey || '')
    const format = control.dataset?.channelVideoFormat
    if (
      !channelKey.trim()
      || !Object.values(CHANNEL_VIDEO_FORMATS).includes(format)
    ) return

    control.addEventListener('click', () => {
      actions.select(control, channelKey, format)
    })
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
