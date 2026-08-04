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

  assert.match(controlsSource, /class="channel-shelf-format-icon"/)
  assert.match(controlsSource, /aria-hidden="true"/)
  assert.match(controlsSource, /aria-label="\$\{escHtml\(label\)\}"/)
  assert.match(controlsSource, /title="\$\{escHtml\(label\)\}"/)
  assert.doesNotMatch(controlsSource, /channel-shelf-format-count|counts\[id\]/)
})

test('format controls align with desktop arrows and use subdued theme colors', () => {
  assert.match(
    videoFeedStyleSource,
    /\.channel-shelf-format-switcher \{[\s\S]*?background: var\(--surface\);[\s\S]*?height: 30px;[\s\S]*?padding: 0 2px;/
  )
  assert.match(
    videoFeedStyleSource,
    /\.channel-shelf-format-option\[aria-pressed="true"\] \{\s*background: var\(--soft-blue\);\s*box-shadow: inset 0 0 0 1px var\(--border\);\s*color: var\(--accent-dim\);\s*\}/
  )
  assert.doesNotMatch(
    videoFeedStyleSource,
    /\.channel-shelf-format-option\[aria-pressed="true"\] \{[^}]*var\(--planet-(?:black|white)\)/
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
