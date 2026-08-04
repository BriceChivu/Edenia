import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const appSource = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8')
const organizationSource = fs.readFileSync(
  new URL('../../src/features/videos/organization-actions.js', import.meta.url),
  'utf8'
)
const stateActionsSource = fs.readFileSync(
  new URL('../../src/features/videos/video-state-actions.js', import.meta.url),
  'utf8'
)

function functionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, start)
  assert.notEqual(start, -1, `Missing function ${name}`)
  assert.notEqual(end, -1, `Missing function ${nextName}`)
  return appSource.slice(start, end)
}

test('Watched cards use staged Favorite navigation without changing the legacy list', () => {
  assert.match(
    appSource,
    /let watchedVideos =[\s\S]*?\.filter\(v => getVideoStatus\(v\) === 'watched'\)\s*\.filter\(v => !VIDEO_ORGANIZATION_ENABLED \|\| !isFavoriteVideo\(v\)\)/
  )
  assert.match(
    appSource,
    /watchedGrid\.innerHTML =[\s\S]*?hideOrganizationActions: true[\s\S]*?stateActionSurface: VIDEO_ORGANIZATION_ENABLED\s*\? 'watched_card'\s*: 'video_card'/
  )
  assert.doesNotMatch(organizationSource, /return-feed|returnToFeed/)
  assert.doesNotMatch(appSource, /function returnWatchedVideoToFeed\(/)
  assert.doesNotMatch(appSource, /video_returned_to_feed/)
  assert.match(
    appSource,
    /'return-feed': 'videos\.actions\.returnToFeed'/,
    'legacy Undo labels remain readable'
  )
})

test('Favorite actions preserve their live card surface', () => {
  assert.match(
    stateActionsSource,
    /surface: control\.dataset\.videoStateSurface \|\| 'video_card'/
  )
  const renderSource = functionSource('renderCard', 'renderRemovedVideoCard')
  assert.match(renderSource, /data-video-state-surface="\$\{escHtml\(stateActionSurface\)\}"/)
})

test('favoriting from Watched reveals and focuses the active rewatch card', () => {
  const toggleSource = functionSource('toggleVideoFavorite', 'syncVideoWatchPromptFavoriteAction')
  assert.match(toggleSource, /VIDEO_ORGANIZATION_ENABLED/)
  assert.match(toggleSource, /options\.surface === 'watched_card'/)
  assert.match(toggleSource, /getVideoStatus\(video\) === 'watched'/)
  assert.match(toggleSource, /!isFavoriteVideo\(beforeVideo\)/)
  assert.match(toggleSource, /revealFavoritedWatchedVideo\(videoId, s\)/)

  const revealSource = functionSource('revealFavoritedWatchedVideo', 'toggleVideoFavorite')
  assert.match(revealSource, /selectedStatusFilter = 'all'/)
  assert.match(revealSource, /focusNextStudyVideoCard\(null, targetVideoId\)/)
  assert.match(revealSource, /#videoGrid \.channel-shelf-card/)
  assert.match(revealSource, /className: 'next-study-focus-arriving'/)
  assert.match(revealSource, /\.focus\(\{ preventScroll: true \}\)/)
})
