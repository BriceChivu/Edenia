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
const wideStyleSource = await readFile(
  new URL('../../src/styles/99-responsive-wide.css', import.meta.url),
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

test('channel video format controls are permanent with no runtime release boundary', () => {
  assert.doesNotMatch(runtimeSource, /deriveChannelVideoFormatToggleEnabled/)
  assert.doesNotMatch(
    appSource,
    /CHANNEL_VIDEO_FORMAT_TOGGLE_ENABLED|channelVideoFormatEnabled|getChannelVideoFormatToggleEnabled/
  )
  assert.match(
    appSource,
    /bindChannelVideoFormatActions\(grid, \{\s*select: selectChannelVideoFormat\s*\}\)/
  )
})

test('permanent format views include every duration without migrating the saved preference', () => {
  assert.match(
    appSource,
    /function getEffectiveIncludeShorts\(\) \{\s*return true\s*\}/
  )
  assert.match(
    appSource,
    /function applyPermanentChannelVideoFormatUi\(\) \{[\s\S]*?document\.body\.classList\.add\('channel-video-format-toggle-enabled'\)[\s\S]*?document\.querySelector\('\.settings-shorts-group'\)\?\.classList\.add\('hidden'\)/
  )
  assert.match(
    appSource,
    /function init\(\) \{\s*reportMissingI18nKeys\(\)\s*applyPermanentChannelVideoFormatUi\(\)/
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
  const saveSettingsStart = appSource.indexOf('async function saveSettingsOnTheFly')
  const saveSettingsEnd = appSource.indexOf('\nfunction saveLocaleFromSettings', saveSettingsStart)
  assert.notEqual(saveSettingsStart, -1)
  assert.notEqual(saveSettingsEnd, -1)
  assert.doesNotMatch(
    appSource.slice(saveSettingsStart, saveSettingsEnd),
    /includeShorts|short-videos|refetchAllChannelsAfterShortsEnabled/
  )
})

test('shelf rendering groups before applying independent format visibility', () => {
  const renderStart = appSource.indexOf('function renderChannelVideoGroups')
  const renderEnd = appSource.indexOf('\nfunction renderChannelShelfAvatar', renderStart)
  const renderSource = appSource.slice(renderStart, renderEnd)
  assert.match(
    renderSource,
    /groupActiveVideosByChannel\([\s\S]*?group\.videos\.forEach\(video => \{\s*formatCounts\[getChannelVideoFormat\(video\)\] \+= 1/
  )
  assert.doesNotMatch(renderSource, /formatEnabled|channelVideoFormatEnabled/)
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

test('permanent controls align with arrows and share the Insights tab design', () => {
  assert.match(
    videoFeedStyleSource,
    /\.status-tabs,\s*\.channel-shelf-format-switcher \{[\s\S]*?background: var\(--surface-hi\);[\s\S]*?border: 1\.5px solid var\(--border\);[\s\S]*?border-radius: 999px;/
  )
  assert.match(
    videoFeedStyleSource,
    /\.status-tabs,\s*\.channel-shelf-format-switcher \{\s*background: transparent;\s*border: 0;\s*border-radius: 0;\s*padding: 0;\s*\}/
  )
  assert.match(
    videoFeedStyleSource,
    /\.status-tab\.active,\s*\.channel-shelf-format-option\[aria-pressed="true"\] \{\s*box-shadow: 0 1px 3px rgba\(5,5,5,0\.12\);\s*\}/
  )
  assert.match(
    videoFeedStyleSource,
    /\.status-tab:not\(\.active\):not\(:disabled\):hover,\s*\.channel-shelf-format-option:hover:not\(\[aria-pressed="true"\]\) \{\s*background: rgba\(5,5,5,0\.08\);\s*\}/
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
    /\.channel-shelf-format-switcher \{[\s\S]*?height: 30px;[\s\S]*?padding: 0;/
  )
  assert.match(
    phoneStyleSource,
    /\.channel-shelf-header\.has-video-format-toggle \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: 36px minmax\(0, 1fr\) auto;[\s\S]*?\.channel-shelf-format-switcher \{[\s\S]*?grid-column: 3;[\s\S]*?height: 40px;[\s\S]*?\.channel-shelf-format-option \{[\s\S]*?width: var\(--mobile-channel-format-option-width, 56px\);/
  )
  ;[videoFeedStyleSource, phoneStyleSource, wideStyleSource].forEach(source => {
    assert.doesNotMatch(source, /body\.channel-video-format-toggle-enabled/)
  })
})

test('mobile Shorts cards use permanent portrait geometry and the measured Add width', () => {
  assert.match(
    appSource,
    /if \(usesPhoneComposition\(\)\) \{\s*mainApp\?\.style\.setProperty\(\s*'--mobile-channel-format-option-width'/
  )
  assert.match(
    phoneStyleSource,
    /\.channel-shelf-slot\[data-channel-video-format="shorts"\] \{\s*--shorts-thumbnail-crop-scale: 1\.4;\s*aspect-ratio: 3 \/ 4;\s*flex-basis: 156px;/
  )
  assert.match(
    phoneStyleSource,
    /\.channel-shelf-slot\[data-channel-video-format="shorts"\] > \.channel-shelf-card \.thumb \{\s*object-fit: cover;\s*transform: scale\(var\(--shorts-thumbnail-crop-scale\)\);\s*transition: none;/
  )
  assert.match(
    phoneStyleSource,
    /\.channel-shelf-slot\[data-channel-video-format="shorts"\] > \.channel-shelf-card \.card-copy \{\s*display: none;/
  )
})

test('format changes stay shelf-local while persisting the explicit channel preference', () => {
  const applyStart = appSource.indexOf('function applyChannelVideoFormatSelection')
  const selectEnd = appSource.indexOf('function renderChannelVideoGroups', applyStart)
  assert.notEqual(applyStart, -1)
  assert.notEqual(selectEnd, -1)
  const actionSource = appSource.slice(applyStart, selectEnd)

  assert.match(actionSource, /setChannelVideoFormatPreference\(\s*state,\s*channelKey,\s*selectedFormat/)
  assert.match(actionSource, /saveState\(state, \{ backup: false, syncAnalytics: false \}\)/)
  assert.match(actionSource, /slot\.hidden = !isVisible/)
  assert.match(actionSource, /track\.scrollLeft = 0/)
  assert.match(actionSource, /trackEdeniaEvent\('channel_video_format_viewed', \{/)
  assert.doesNotMatch(actionSource, /fetchVideo|refreshFeed/)
})
