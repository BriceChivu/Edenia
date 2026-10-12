// Capture public YouTube metadata for a realistic, repeatable local benchmark.
import { readFile, writeFile } from 'node:fs/promises'
import vm from 'node:vm'
const configPath = process.env.EDENIA_BENCHMARK_CONFIG || 'config.local.js'
const context = { window: {} }
let key = process.env.YOUTUBE_API_KEY
if (!key) {
  vm.runInNewContext(await readFile(configPath, 'utf8'), context)
  key = context.window.EDENIA_CONFIG?.youtubeApiKey
}
if (!key) throw new Error('A configured YouTube API key is required')
async function api(endpoint, parameters) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`)
  for (const [name, value] of Object.entries({ ...parameters, key })) url.searchParams.set(name, value)
  const response = await fetch(url, { headers: { Referer: 'https://www.edenia.study/' } })
  if (!response.ok) throw new Error(`YouTube ${endpoint} returned HTTP ${response.status}`)
  return response.json()
}
const catalog = JSON.parse(await readFile('data/channel-catalog.json', 'utf8'))
const selected = catalog.channels.filter(channel => channel.available && channel.languages.includes('mandarin')).slice(0, 25)
const channels = []
const ids = new Set()
const records = []
const fetchedAt = new Date().toISOString()
for (const selectedChannel of selected) {
  const details = await api('channels', { part: 'contentDetails,snippet', id: selectedChannel.channelId })
  const channel = details.items?.[0]
  if (!channel) continue
  channels.push({ id: channel.id, name: channel.snippet.title, thumbnailUrl: channel.snippet.thumbnails?.default?.url, metadataFetchedAt: fetchedAt })
  let pageToken = ''
  for (let page = 0; page < 2 && records.length < 1000; page++) {
    const uploads = await api('playlistItems', { part: 'contentDetails', playlistId: channel.contentDetails.relatedPlaylists.uploads, maxResults: '50', ...(pageToken ? { pageToken } : {}) })
    const batch = (uploads.items || []).map(item => item.contentDetails.videoId).filter(id => !ids.has(id))
    if (batch.length) {
      const videos = await api('videos', { part: 'snippet,contentDetails,status', id: batch.join(',') })
      for (const video of videos.items || []) {
        if (video.status.privacyStatus !== 'public' || records.length >= 1000) continue
        const match = video.contentDetails.duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
        if (!match) continue
        const duration = Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)
        if (!duration) continue
        ids.add(video.id)
        records.push({ id: video.id, title: video.snippet.title, channelId: video.snippet.channelId, channelTitle: video.snippet.channelTitle,
          duration, aspectRatio: 16 / 9, publishedAt: video.snippet.publishedAt,
          thumbnailUrl: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url, metadataFetchedAt: fetchedAt })
      }
    }
    pageToken = uploads.nextPageToken
    if (!pageToken) break
  }
  console.log(`Captured ${records.length} real public video records`)
  if (records.length >= 1000) break
}
if (records.length !== 1000) throw new Error(`Expected 1000 real videos; received ${records.length}`)
await writeFile('tests/fixtures/tiny-swords-fps-videos.json', JSON.stringify({ fetchedAt, source: 'YouTube Data API: public uploads from Edenia Mandarin catalog', channels, videos: records }, null, 2) + '\n')
