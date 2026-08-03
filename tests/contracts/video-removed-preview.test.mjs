import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const appSource = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8')

function functionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, start)
  assert.notEqual(start, -1, `Missing function ${name}`)
  assert.notEqual(end, -1, `Missing function ${nextName}`)
  return appSource.slice(start, end)
}

test('Removed cards expose an accessible thumbnail preview action', () => {
  const renderSource = functionSource('renderRemovedVideoCard', 'getFeedbackAssetVersion')
  assert.match(renderSource, /<button type="button" class="thumb-link removed-thumb"/)
  assert.match(renderSource, /data-video-preview-action="removed-thumbnail"/)
  assert.match(renderSource, /data-analytics-action="previewRemovedVideo"/)
  assert.match(renderSource, /aria-label="\$\{escHtml\(video\.title\)\}"/)
  assert.match(
    appSource,
    /removedGrid\.innerHTML =[\s\S]*?bindRenderedVideoShelfPreviewActions\(removedGrid\)/
  )
})

test('Removed previews enter an explicit non-study player mode', () => {
  const thumbnailSource = functionSource('handleVideoThumbnailClick', 'getVideoShelfEmbedUrl')
  assert.match(thumbnailSource, /videoPreviewAction === 'removed-thumbnail'/)
  assert.match(thumbnailSource, /mode: VIDEO_SHELF_PLAYER_MODE_REMOVED_PREVIEW/)

  const openSource = functionSource('openVideoPlayer', 'positionVideoShelfPlayerOverlay')
  assert.match(openSource, /isVideoRemovedFromFeed\(existingVideo\)/)
  assert.match(openSource, /!isRemovedPreview && !wasWatched && !markVideoInProgressOnOpen/)
  assert.match(openSource, /mode,/)
  assert.match(openSource, /analyticsSurface: isRemovedPreview \? 'removed_section' : 'channel_shelf'/)
  assert.match(openSource, /study_credit_eligible: false/)
})

test('Removed previews cannot persist coverage, resume state, or completion', () => {
  const coverageSource = functionSource(
    'trackVideoShelfWatchCoverage',
    'persistVideoShelfWatchCoverage'
  )
  const modeGuard = coverageSource.indexOf('if (!isStudyVideoShelfPlayerSession(session)) return true')
  const coverageWrite = coverageSource.indexOf('addVideoWatchCoverageRange(')
  assert.ok(modeGuard >= 0)
  assert.ok(coverageWrite > modeGuard)

  const syncSource = functionSource('syncActiveVideoShelfPlayer', 'startVideoShelfPlayerSyncTimer')
  const syncGuard = syncSource.indexOf('if (!isStudyVideoShelfPlayerSession(session)) return true')
  const stateRead = syncSource.indexOf('const state = loadState()')
  assert.ok(syncGuard >= 0)
  assert.ok(stateRead > syncGuard)

  const promptSource = functionSource(
    'showVideoShelfCompletionPrompt',
    'trackVideoPlaybackSessionEnded'
  )
  assert.match(promptSource, /!isStudyVideoShelfPlayerSession\(session\)/)

  const completionSource = functionSource(
    'completeVideoShelfPlayer',
    'completeVideoShelfPlayerRewatchConfirmation'
  )
  assert.match(completionSource, /!isStudyVideoShelfPlayerSession\(session\)/)

  const closeSource = functionSource('closeVideoShelfPlayer', 'handleVideoShelfPlayerVisibilityChange')
  const closeGuard = closeSource.indexOf('if (!isStudyVideoShelfPlayerSession(stoppedPlayer)) return')
  const rerender = closeSource.indexOf('renderAll(state)')
  assert.ok(closeGuard >= 0)
  assert.ok(rerender > closeGuard)
})

test('Removed preview metadata hydration remains non-persistent', () => {
  const hydrateSource = functionSource(
    'hydrateVideoShelfPlayerAspectRatio',
    'getVideoShelfPlayerCurrentTime'
  )
  const studyGuard = hydrateSource.indexOf('!isStudyVideoShelfPlayerSession(session)')
  const stateWrite = hydrateSource.indexOf('video.aspectRatio = aspectRatio')
  assert.ok(studyGuard >= 0)
  assert.ok(stateWrite > studyGuard)
})
