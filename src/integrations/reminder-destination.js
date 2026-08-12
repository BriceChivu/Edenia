const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{20,}$/
const DESTINATION_KEYS = ['reminder', 'video', 'channel']

function consumeDestinationParameters(url, historyLike) {
  DESTINATION_KEYS.forEach(key => url.searchParams.delete(key))
  historyLike.replaceState(
    historyLike.state,
    '',
    `${url.pathname}${url.search}${url.hash}`
  )
}

export function consumeReminderDestination({
  enabled,
  location: locationLike,
  history: historyLike
}) {
  let url
  try {
    url = new URL(locationLike?.href)
  } catch {
    return null
  }

  const hasDestinationParameter = DESTINATION_KEYS.some(
    key => url.searchParams.has(key)
  )
  if (!hasDestinationParameter) return null

  const values = Object.fromEntries(DESTINATION_KEYS.map(key => [
    key,
    url.searchParams.getAll(key)
  ]))
  consumeDestinationParameters(url, historyLike)
  if (!enabled || values.reminder.length !== 1) return null

  const emailType = values.reminder[0]
  const videoId = values.video.length === 1 ? values.video[0] : null
  const channelId = values.channel.length === 1 ? values.channel[0] : null
  const noVideo = values.video.length === 0 && values.channel.length === 0
  const completeVideo = values.video.length === 1
    && values.channel.length === 1
    && VIDEO_ID_PATTERN.test(videoId)
    && CHANNEL_ID_PATTERN.test(channelId)

  if (
    (emailType === 'streak' && !noVideo && !completeVideo)
    || (emailType === 'discovery' && !completeVideo)
    || (emailType !== 'streak' && emailType !== 'discovery')
  ) return null

  return Object.freeze({
    emailType,
    videoId,
    channelId
  })
}
