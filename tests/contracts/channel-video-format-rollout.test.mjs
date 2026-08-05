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
const analyticsStyleSource = await readFile(
  new URL('../../src/styles/50-analytics.css', import.meta.url),
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

test('channel video format rollout has one internal-test or explicit release boundary', () => {
  assert.match(
    runtimeSource,
    /function deriveChannelVideoFormatToggleEnabled\([\s\S]*?releaseEnabled = false[\s\S]*?runtimeEnvironment\?\.isInternalTest === true \|\| releaseEnabled === true/
  )
  assert.match(
    appSource,
    /const CHANNEL_VIDEO_FORMAT_TOGGLE_ENABLED =\s*deriveChannelVideoFormatToggleEnabled\(\s*RUNTIME_ENVIRONMENT,\s*getChannelVideoFormatToggleEnabled\(\)\s*\)/
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

test('internal rollout includes every duration without migrating the saved preference', () => {
  assert.match(
    appSource,
    /function getEffectiveIncludeShorts\(state\) \{\s*return CHANNEL_VIDEO_FORMAT_TOGGLE_ENABLED\s*\|\| normalizeIncludeShorts\(state\?\.config\?\.includeShorts\)\s*\}/
  )
  assert.match(
    appSource,
    /function applyChannelVideoFormatExperimentUi\(\) \{[\s\S]*?'channel-video-format-toggle-enabled',[\s\S]*?CHANNEL_VIDEO_FORMAT_TOGGLE_ENABLED[\s\S]*?document\.querySelector\('\.settings-shorts-group'\)\?\.classList\.toggle\(\s*'hidden',\s*CHANNEL_VIDEO_FORMAT_TOGGLE_ENABLED/
  )
  assert.match(
    appSource,
    /function init\(\) \{\s*reportMissingI18nKeys\(\)\s*applyVideoOrganizationVisibility\(\)\s*applyChannelVideoFormatExperimentUi\(\)/
  )
  assert.equal(
    appSource.match(/const includeShorts = getEffectiveIncludeShorts\((?:s|state)\)/g)?.length,
    5
  )
  assert.match(
    appSource,
    /includeShortVideos: getEffectiveIncludeShorts\(state\)/
  )
  assert.match(
    appSource,
    /state\.config\.includeShorts = includeShorts/
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

test('experiment controls align with arrows and share the Insights tab design', () => {
  assert.match(
    videoFeedStyleSource,
    /\.status-tabs,\s*\.channel-shelf-format-switcher \{[\s\S]*?background: var\(--surface-hi\);[\s\S]*?border: 1\.5px solid var\(--border\);[\s\S]*?border-radius: 999px;/
  )
  assert.match(
    videoFeedStyleSource,
    /body\.channel-video-format-toggle-enabled \.status-tabs,\s*body\.channel-video-format-toggle-enabled \.channel-shelf-format-switcher \{\s*background: transparent;\s*border: 0;\s*border-radius: 0;\s*padding: 0;\s*\}/
  )
  assert.match(
    videoFeedStyleSource,
    /body\.channel-video-format-toggle-enabled \.status-tab\.active,\s*body\.channel-video-format-toggle-enabled \.channel-shelf-format-option\[aria-pressed="true"\] \{\s*box-shadow: 0 1px 3px rgba\(5,5,5,0\.12\);\s*\}/
  )
  assert.match(
    videoFeedStyleSource,
    /body\.channel-video-format-toggle-enabled \.status-tab:not\(\.active\):not\(:disabled\):hover,\s*body\.channel-video-format-toggle-enabled \.channel-shelf-format-option:hover:not\(\[aria-pressed="true"\]\) \{\s*background: rgba\(5,5,5,0\.08\);\s*\}/
  )
  assert.match(
    analyticsStyleSource,
    /\.study-insight-tab\.active \{\s*background: var\(--surface\);\s*box-shadow: 0 1px 3px rgba\(5,5,5,0\.12\);\s*color: var\(--text\);\s*\}/
  )
  assert.match(
    analyticsStyleSource,
    /\.study-insight-tab:not\(\.active\):not\(:disabled\):hover \{\s*background: rgba\(5,5,5,0\.08\);\s*color: var\(--text\);\s*\}/
  )
  assert.match(
    videoFeedStyleSource,
    /\.channel-shelf-format-switcher \{[\s\S]*?height: 30px;[\s\S]*?padding: 0 2px;/
  )
  assert.match(
    phoneStyleSource,
    /body\.channel-video-format-toggle-enabled \.channel-shelf-header\.has-video-format-toggle \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: 36px minmax\(0, 1fr\) auto;[\s\S]*?body\.channel-video-format-toggle-enabled \.channel-shelf-format-switcher \{[\s\S]*?grid-column: 3;[\s\S]*?height: 40px;[\s\S]*?body\.channel-video-format-toggle-enabled \.channel-shelf-format-option \{[\s\S]*?width: var\(--mobile-channel-format-option-width, 56px\);/
  )
})

test('mobile Shorts cards use gated portrait geometry and the measured Add width', () => {
  assert.match(
    appSource,
    /if \(CHANNEL_VIDEO_FORMAT_TOGGLE_ENABLED && usesPhoneComposition\(\)\) \{\s*mainApp\?\.style\.setProperty\(\s*'--mobile-channel-format-option-width'/
  )
  assert.match(
    phoneStyleSource,
    /body\.channel-video-format-toggle-enabled \.channel-shelf-slot\[data-channel-video-format="shorts"\] \{\s*--shorts-thumbnail-crop-scale: 1\.4;\s*aspect-ratio: 3 \/ 4;\s*flex-basis: 156px;/
  )
  assert.match(
    phoneStyleSource,
    /body\.channel-video-format-toggle-enabled \.channel-shelf-slot\[data-channel-video-format="shorts"\] > \.channel-shelf-card \.thumb \{\s*object-fit: cover;\s*transform: scale\(var\(--shorts-thumbnail-crop-scale\)\);\s*transition: none;/
  )
  assert.match(
    phoneStyleSource,
    /body\.channel-video-format-toggle-enabled \.channel-shelf-slot\[data-channel-video-format="shorts"\] > \.channel-shelf-card \.card-copy \{\s*display: none;/
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
