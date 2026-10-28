const ID = /^UC[A-Za-z0-9_-]{22}$/

// Channel IDs are intent, never trusted names/metadata. Resolve them against the
// current reviewed catalogs after the active learner profile has opened.
export function consumeEmailChannelDestination({ enabled, location, history }) {
  const url = new URL(location.href)
  if (url.searchParams.get('reminder') !== 'discovery' || url.searchParams.has('video')) return null
  const single = url.searchParams.getAll('channel')
  const multiple = url.searchParams.getAll('channels')
  if (!single.length && !multiple.length) return null
  for (const key of ['reminder', 'channel', 'channels']) url.searchParams.delete(key)
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`)
  if (!enabled || single.length + multiple.length !== 1) return null
  const ids = (multiple[0] || single[0]).split(',')
  if (ids.length < 1 || ids.length > 6 || ids.some(id => !ID.test(id)) || new Set(ids).size !== ids.length
    || (single.length && ids.length !== 1)) return null
  return Object.freeze({ mode: multiple.length ? 'all' : 'single', channelIds: Object.freeze(ids) })
}

export async function addRecommendedChannels({ channels, read, isCurrent, add, progress }) {
  let added = 0
  let skipped = 0
  for (const [index, channel] of channels.entries()) {
    if (!isCurrent()) return { added, skipped, stopped: true }
    const exists = () => read()?.config?.channels?.some(entry => entry.id === channel.channelId)
    if (exists() || read()?.config?.removedChannelIds?.includes(channel.channelId)) { skipped++; continue }
    await progress(channel, index + 1, channels.length)
    if (!isCurrent()) return { added, skipped, stopped: true }
    await add(channel)
    if (!isCurrent()) return { added, skipped, stopped: true }
    if (!exists()) return { added, skipped, stopped: true }
    added++
  }
  return { added, skipped, stopped: false }
}
