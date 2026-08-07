import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

function getFunctionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `Missing ${name}`)
  const end = [
    appSource.indexOf(`\nfunction ${nextName}(`, start),
    appSource.indexOf(`\nasync function ${nextName}(`, start)
  ].filter(index => index !== -1).sort((a, b) => a - b)[0] ?? -1
  assert.notEqual(end, -1, `Missing ${nextName}`)
  return appSource.slice(start, end)
}

test('rendered manual video reveal owns scrolling, highlighting, and measurement', () => {
  const source = getFunctionSource(
    'revealRenderedAddedVideoCard',
    'revealAddedVideoCard'
  )
  assert.match(
    source,
    /if \(card\) \{\s*flashVideoCard\(card, \{\s*duration: 1800,\s*highlightTarget: 'spotlight'\s*\}\)\s*\}/
  )
  assert.match(source, /trackAddedVideoRevealResult\(targetVideoId, card\)/)
})

test('immediate manual video reveal renders once and delegates to the owner', () => {
  const source = getFunctionSource(
    'revealAddedVideoCard',
    'usesTabletAddedVideoReveal'
  )
  assert.match(source, /renderAll\(state\)/)
  assert.match(source, /revealRenderedAddedVideoCard\(targetVideoId\)/)
})

test('newly tracked channels defer reveal until their final refresh render', () => {
  const addSource = getFunctionSource('addVideoFromUrl', 'normalizeCuratedChannelSearchText')
  assert.match(
    addSource,
    /if \(channelWasAdded\) \{\s*renderAll\(s\)\s*\} else \{\s*revealAddedVideoCard\(videoId, s\)\s*\}/
  )

  const refreshSource = getFunctionSource('refreshAddedChannel', 'getBaseDocumentTitle')
  assert.match(refreshSource, /revealRenderedAddedVideoCard\(focusVideoId\)/)
  assert.match(
    refreshSource,
    /if \(focusVideoId && !focusRevealScheduled\) \{\s*revealAddedVideoCard\(focusVideoId, loadState\(\)\)\s*\}/
  )
})

test('manual video reveal reports a measured PostHog outcome', () => {
  const source = getFunctionSource(
    'trackAddedVideoRevealResult',
    'addVideoFromUrl'
  )
  assert.match(source, /manual_video_reveal_completed/)
  for (const property of [
    'video_url',
    'result',
    'card_found',
    'scroll_requested',
    'highlight_started',
    'card_visible_after_reveal',
    'reveal_mode'
  ]) {
    assert.match(source, new RegExp(`\\b${property}:`))
  }
  assert.match(source, /result: 'card_not_found'/)
  assert.match(source, /result: visible \? 'visible' : 'not_visible'/)
  assert.match(source, /isVideoCardFullyVisibleInViewport\(card\)/)
})
