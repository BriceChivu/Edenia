import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const runtimeSource = await readFile(
  new URL('../../src/core/runtime-environment.js', import.meta.url),
  'utf8'
)
const videoFeedStyleSource = await readFile(
  new URL('../../src/styles/70-video-feed.css', import.meta.url),
  'utf8'
)
const phoneStyleSource = await readFile(
  new URL('../../src/styles/98-responsive-phone.css', import.meta.url),
  'utf8'
)
const formatIconAssets = Object.fromEntries(await Promise.all(
  [
    'youtube-black.svg',
    'youtube-white.svg',
    'youtube-shorts-black-logo.svg',
    'youtube-shorts-white-logo.svg'
  ].map(async filename => [
    filename,
    await readFile(new URL(`../../images/brands/${filename}`, import.meta.url), 'utf8')
  ])
))

test('channel video format rollout has one internal-test release boundary', () => {
  assert.match(
    runtimeSource,
    /function deriveChannelVideoFormatToggleEnabled\(runtimeEnvironment\)[\s\S]*?runtimeEnvironment\?\.isInternalTest === true/
  )
  assert.match(
    appSource,
    /const CHANNEL_VIDEO_FORMAT_TOGGLE_ENABLED =\s*deriveChannelVideoFormatToggleEnabled\(RUNTIME_ENVIRONMENT\)/
  )
  assert.match(
    appSource,
    /channelVideoFormatEnabled:\s*CHANNEL_VIDEO_FORMAT_TOGGLE_ENABLED && includeShorts/
  )
  assert.match(
    appSource,
    /if \(cardOptions\.channelVideoFormatEnabled\) \{\s*bindChannelVideoFormatActions\(grid, \{\s*select: selectChannelVideoFormat/
  )
})

test('shelf rendering groups before applying independent format visibility', () => {
  assert.match(
    appSource,
    /groupActiveVideosByChannel\([\s\S]*?const formatEnabled = cardOptions\.channelVideoFormatEnabled === true[\s\S]*?group\.videos\.forEach\(video => \{\s*formatCounts\[getChannelVideoFormat\(video\)\] \+= 1/
  )
  assert.match(
    appSource,
    /data-channel-selected-video-format="\$\{selectedFormat\}"/
  )
  assert.match(
    appSource,
    /data-channel-video-format-empty="\$\{CHANNEL_VIDEO_FORMATS\.SHORTS\}"/
  )
  assert.match(
    appSource,
    /data-channel-video-format="\$\{videoFormat\}"/
  )
})

test('format controls render accessible icons without visible labels or counts', () => {
  const controlsStart = appSource.indexOf('function renderChannelVideoFormatIcon')
  const controlsEnd = appSource.indexOf('function applyChannelVideoFormatSelection', controlsStart)
  assert.notEqual(controlsStart, -1)
  assert.notEqual(controlsEnd, -1)
  const controlsSource = appSource.slice(controlsStart, controlsEnd)

  assert.match(
    controlsSource,
    /class="channel-shelf-format-icon channel-shelf-format-icon-\$\{normalizedFormat\}"/
  )
  assert.match(controlsSource, /aria-hidden="true"/)
  assert.match(controlsSource, /aria-label="\$\{escHtml\(label\)\}"/)
  assert.match(controlsSource, /title="\$\{escHtml\(label\)\}"/)
  assert.doesNotMatch(controlsSource, /<svg|<path/)
  assert.doesNotMatch(controlsSource, /channel-shelf-format-count|counts\[id\]/)
})

test('format controls use the supplied sanitized light and dark assets', () => {
  Object.values(formatIconAssets).forEach(source => {
    assert.match(source, /^<svg[^>]+viewBox="[^"]+">/)
    assert.doesNotMatch(source, /<style|<!--|<title/)
  })
  assert.match(formatIconAssets['youtube-black.svg'], /fill="#212121"/)
  assert.match(formatIconAssets['youtube-shorts-black-logo.svg'], /fill="#212121"/)
  assert.match(formatIconAssets['youtube-white.svg'], /fill="#fff"/)
  assert.match(formatIconAssets['youtube-shorts-white-logo.svg'], /fill="#fff"/)
  Object.keys(formatIconAssets).forEach(filename => {
    assert.match(videoFeedStyleSource, new RegExp(`url\\("images/brands/${filename}"\\)`))
  })
})

test('format controls align with desktop arrows and share the status filter design', () => {
  assert.match(
    videoFeedStyleSource,
    /\.status-tabs,\s*\.channel-shelf-format-switcher \{[\s\S]*?background: var\(--surface-hi\);[\s\S]*?border: 1\.5px solid var\(--border\);[\s\S]*?border-radius: 999px;/
  )
  assert.match(
    videoFeedStyleSource,
    /\.status-tab\.active,\s*\.channel-shelf-format-option\[aria-pressed="true"\] \{\s*background: var\(--surface\);\s*box-shadow: 0 2px 0 rgba\(5,5,5,0\.1\);\s*color: var\(--text\);\s*\}/
  )
  assert.match(
    videoFeedStyleSource,
    /\.channel-shelf-format-switcher \{[\s\S]*?height: 30px;[\s\S]*?padding: 0 2px;/
  )
  assert.match(
    phoneStyleSource,
    /\.channel-shelf-format-switcher \{\s*height: auto;[\s\S]*?padding: 2px;[\s\S]*?\.channel-shelf-format-option \{[\s\S]*?height: auto;\s*min-height: 40px;/
  )
})

test('format changes stay shelf-local and do not persist application state', () => {
  const applyStart = appSource.indexOf('function applyChannelVideoFormatSelection')
  const selectEnd = appSource.indexOf('function renderChannelVideoGroups', applyStart)
  assert.notEqual(applyStart, -1)
  assert.notEqual(selectEnd, -1)
  const actionSource = appSource.slice(applyStart, selectEnd)

  assert.match(actionSource, /selectedChannelVideoFormats\.set\(channelKey, selectedFormat\)/)
  assert.match(actionSource, /slot\.hidden = !isVisible/)
  assert.match(actionSource, /track\.scrollLeft = 0/)
  assert.doesNotMatch(actionSource, /saveState|localStorage|fetchVideo|refreshFeed/)
})
