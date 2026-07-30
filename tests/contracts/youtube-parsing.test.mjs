import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getBestYoutubeThumbnail,
  getVideoAspectRatioFromItem,
  getVideoDetailFromItem,
  getYoutubeUploadsPlaylistId,
  isShortDuration,
  isYoutubeVideoId,
  normalizeVideoAspectRatio,
  parseYoutubeChannelInput,
  parseYoutubeDuration,
  parseYoutubeVideoId,
  YOUTUBE_CHANNEL_ID_RE
} from '../../src/integrations/youtube-parsing.js'

const channelId20 = `UC${'a'.repeat(20)}`
const channelId22 = `UC${'b'.repeat(22)}`
const videoId = 'AbCdEf123_-'

test('browser channel identifiers and Unicode handles retain their permissive rules', () => {
  assert.equal(YOUTUBE_CHANNEL_ID_RE.test(channelId20), true)
  assert.equal(YOUTUBE_CHANNEL_ID_RE.test(channelId22), true)
  assert.equal(YOUTUBE_CHANNEL_ID_RE.test(`UC${'a'.repeat(19)}`), false)
  assert.equal(YOUTUBE_CHANNEL_ID_RE.test(`XX${'a'.repeat(22)}`), false)

  assert.deepEqual(parseYoutubeChannelInput('@abc'), {
    kind: 'handle',
    handle: '@abc'
  })
  assert.deepEqual(parseYoutubeChannelInput('@...'), {
    kind: 'handle',
    handle: '@...'
  })
  assert.deepEqual(parseYoutubeChannelInput('@école_du-monde'), {
    kind: 'handle',
    handle: '@école_du-monde'
  })
  assert.equal(parseYoutubeChannelInput('@ab'), null)
  assert.equal(parseYoutubeChannelInput('@has space'), null)
})

test('uploads playlist, duration, aspect ratio, and thumbnail parsing stay exact', () => {
  assert.equal(getYoutubeUploadsPlaylistId(channelId22), `UU${'b'.repeat(22)}`)
  assert.equal(parseYoutubeDuration(null), 0)
  assert.equal(parseYoutubeDuration('PT1H2M3S'), 3723)
  assert.equal(parseYoutubeDuration('PT15M'), 900)
  assert.equal(parseYoutubeDuration('prefixPT7Stail'), 7)
  assert.equal(parseYoutubeDuration('P1D'), 0)
  assert.equal(parseYoutubeDuration('pt2m'), 0)
  assert.equal(parseYoutubeDuration('PT1.5S'), 0)
  assert.throws(() => parseYoutubeDuration(42), /match/)

  assert.equal(isShortDuration(0), false)
  assert.equal(isShortDuration(179.999), true)
  assert.equal(isShortDuration('179.999'), true)
  assert.equal(isShortDuration(180), false)
  assert.equal(isShortDuration(true), true)

  assert.equal(normalizeVideoAspectRatio(0.25), 0.25)
  assert.equal(normalizeVideoAspectRatio('1.777'), 1.777)
  assert.equal(normalizeVideoAspectRatio(4), 4)
  assert.equal(normalizeVideoAspectRatio(0.249), null)
  assert.equal(normalizeVideoAspectRatio(Infinity), null)
  assert.equal(getVideoAspectRatioFromItem({
    player: { embedWidth: '1920', embedHeight: '1080' }
  }), 1920 / 1080)
  assert.equal(getVideoAspectRatioFromItem({
    player: { embedWidth: 500, embedHeight: 100 }
  }), null)
  assert.equal(getVideoAspectRatioFromItem({}), null)
  assert.deepEqual(getVideoDetailFromItem({
    contentDetails: { duration: 'PT2M59S' },
    player: { embedWidth: 900, embedHeight: 1600 }
  }), {
    aspectRatio: 900 / 1600,
    duration: 179,
    isShort: true
  })
  assert.deepEqual(getVideoDetailFromItem({
    contentDetails: { duration: 'PT3M' },
    player: { embedWidth: 900, embedHeight: 1600 }
  }), {
    aspectRatio: 900 / 1600,
    duration: 180,
    isShort: false
  })

  assert.equal(getBestYoutubeThumbnail({
    maxres: { url: '' },
    high: { url: 'high.jpg' },
    medium: { url: 'medium.jpg' },
    default: { url: 'default.jpg' }
  }), 'high.jpg')
  assert.equal(getBestYoutubeThumbnail({ default: { url: 'default.jpg' } }), 'default.jpg')
  assert.equal(getBestYoutubeThumbnail(), '')
})

test('channel input parsing preserves IDs, handles, users, and custom URLs', () => {
  assert.deepEqual(parseYoutubeChannelInput(channelId20), {
    kind: 'id',
    channelId: channelId20
  })
  assert.deepEqual(parseYoutubeChannelInput('@語言學'), {
    kind: 'handle',
    handle: '@語言學'
  })
  assert.deepEqual(
    parseYoutubeChannelInput(`m.youtube.com/channel/${channelId22}`),
    { kind: 'id', channelId: channelId22 }
  )
  assert.deepEqual(
    parseYoutubeChannelInput('https://studio.youtube.com/@école_du-monde'),
    { kind: 'handle', handle: '@école_du-monde' }
  )
  assert.deepEqual(
    parseYoutubeChannelInput('youtube-nocookie.com/user/LegacyUser'),
    { kind: 'username', username: 'LegacyUser' }
  )
  assert.deepEqual(
    parseYoutubeChannelInput('youtube.com/c/CustomName'),
    { kind: 'custom-url' }
  )
  assert.deepEqual(
    parseYoutubeChannelInput('youtube.com/CustomName'),
    { kind: 'custom-url' }
  )
  assert.deepEqual(
    parseYoutubeChannelInput('youtube.com/%40%E8%AA%9E%E8%A8%80%E5%AD%B8'),
    { kind: 'handle', handle: '@語言學' }
  )
  assert.deepEqual(
    parseYoutubeChannelInput('ftp://youtube.com/@abc'),
    { kind: 'handle', handle: '@abc' }
  )
  assert.deepEqual(
    parseYoutubeChannelInput('youtube.com/Watch'),
    { kind: 'custom-url' }
  )
  assert.equal(parseYoutubeChannelInput('youtube.com/watch?v=AbCdEf123_-'), null)
  assert.equal(parseYoutubeChannelInput('youtu.be/AbCdEf123_-'), null)
  assert.equal(parseYoutubeChannelInput('https://example.com/@abc'), null)
  assert.equal(parseYoutubeChannelInput(''), null)
})

test('video ID parsing preserves every accepted URL shape and fallback', () => {
  const accepted = [
    videoId,
    `https://youtu.be/${videoId}?t=3`,
    `youtube.com/watch?foo=1&v=${videoId}`,
    `https://m.youtube.com/embed/${videoId}`,
    `https://www.youtube.com/shorts/${videoId}`,
    `https://youtube.com/live/${videoId}`,
    `https://youtube.com/v/${videoId}`,
    `https://youtube-nocookie.com/embed/${videoId}`
  ]

  accepted.forEach(value => assert.equal(parseYoutubeVideoId(value), videoId))
  assert.equal(
    parseYoutubeVideoId(`https://example.com/youtube.com/embed/${videoId}`),
    videoId
  )
  assert.equal(parseYoutubeVideoId('https://youtube.com/watch?v=too-short'), '')
  assert.equal(
    parseYoutubeVideoId(`https://youtube.com/embed/${videoId}Z`),
    videoId
  )
  assert.equal(
    parseYoutubeVideoId(`https://foo.youtube-nocookie.com/embed/${videoId}`),
    ''
  )
  assert.equal(parseYoutubeVideoId(null), '')
  assert.equal(isYoutubeVideoId(videoId), true)
  assert.equal(isYoutubeVideoId(`${videoId}Z`), false)
  assert.equal(isYoutubeVideoId(null), false)
})
