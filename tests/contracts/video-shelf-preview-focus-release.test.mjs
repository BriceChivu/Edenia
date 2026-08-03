import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')

function getFunctionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, start)
  assert.notEqual(start, -1, `Expected ${name}() in src/app.js`)
  assert.notEqual(end, -1, `Expected ${nextName}() after ${name}()`)
  return appSource.slice(start, end)
}

test('pending Next Study focus ignores competing shelf hover previews', () => {
  const ignoreSource = getFunctionSource(
    'shouldIgnoreVideoShelfHoverForPendingFocus',
    'releaseNextStudyFocusForShelfPreview'
  )
  assert.match(ignoreSource, /pointerEvent\?\.type === 'mouseenter'/)
  assert.match(ignoreSource, /requestedVideoId !== focusedVideoId/)
  assert.match(ignoreSource, /!isActiveVideoShelfPreview\(focusedVideoId\)/)

  const releaseSource = getFunctionSource(
    'releaseNextStudyFocusForShelfPreview',
    'pushUndoAction'
  )
  assert.match(
    releaseSource,
    /if \(force \|\| !focusedVideoId \|\| !requestedVideoId \|\| requestedVideoId === focusedVideoId\) return false/
  )
  assert.match(releaseSource, /clearFocusedVideoPreview\(focusedVideoId\)/)

  const openSource = getFunctionSource(
    'openVideoShelfPreview',
    'closeVideoShelfPreview'
  )
  const eligibilityIndex = openSource.indexOf(
    'if (!force && !isVideoShelfCardFullyVisible(card)) return false'
  )
  const ignoreIndex = openSource.indexOf(
    'if (shouldIgnoreVideoShelfHoverForPendingFocus(card, force, pointerEvent)) return false'
  )
  const releaseIndex = openSource.indexOf(
    'releaseNextStudyFocusForShelfPreview(card, force)'
  )
  const activePreviewIndex = openSource.indexOf(
    'if (activeVideoShelfPreview && activeVideoShelfPreview !== card)'
  )

  assert.ok(eligibilityIndex >= 0)
  assert.ok(ignoreIndex > eligibilityIndex)
  assert.ok(releaseIndex > eligibilityIndex)
  assert.ok(releaseIndex > ignoreIndex)
  assert.ok(activePreviewIndex > releaseIndex)
  assert.doesNotMatch(openSource, /activeNextStudyFocusVideoId && !force/)
  assert.doesNotMatch(openSource, /card\.classList\.contains\('next-study-focus-target'\) && !force/)
  assert.doesNotMatch(openSource, /VideoWatchReminder|watch-reminder-target/)
})

test('opening the focused video player completes the Next Study focus lifecycle', () => {
  const source = getFunctionSource('openVideoShelfPlayer', 'openVideoPlayer')
  const clearIndex = source.indexOf('clearFocusedVideoPreview(videoId)')
  const openIndex = source.indexOf('return openVideoPlayer(videoId)')

  assert.ok(clearIndex >= 0)
  assert.ok(openIndex > clearIndex)
})
