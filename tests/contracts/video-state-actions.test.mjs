import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  bindVideoStateActions
} from '../../src/features/videos/video-state-actions.js'
import {
  GLOBAL_ACTION_NAMES
} from '../../src/core/global-action-contract.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

function createControl(action, data = {}) {
  const listeners = []
  return {
    dataset: { videoStateAction: action, videoId: 'video-1', ...data },
    addEventListener(type, listener) {
      assert.equal(type, 'click')
      listeners.push(listener)
    },
    click() {
      let defaultPrevented = false
      let propagationStopped = false
      const event = {
        preventDefault() { defaultPrevented = true },
        stopPropagation() { propagationStopped = true }
      }
      listeners.forEach(listener => listener(event))
      return { defaultPrevented, propagationStopped }
    },
    listenerCount() {
      return listeners.length
    }
  }
}

test('rendered video-state controls bind after every replacement without globals', () => {
  const expectedMarkup = [
    ['partial-priority-badge', 'clear-paused', 'clearVideoPausedState'],
    ['watch-later-priority-badge', 'remove-watch-later', 'markVideo'],
    ['favorite-priority-badge', 'remove-favorite', 'toggleVideoFavorite'],
    ['watch-later-btn', 'toggle-watch-later', 'markVideo'],
    ['favorite-btn', 'toggle-favorite', 'toggleVideoFavorite']
  ]
  expectedMarkup.forEach(([className, action, analyticsAction]) => {
    assert.match(
      appSource,
      new RegExp(
        `class="[^"]*${className}[^"]*"[\\s\\S]*?`
        + `data-video-state-action="${action}"[\\s\\S]*?`
        + `data-analytics-action="${analyticsAction}"`
      )
    )
  })
  assert.doesNotMatch(
    appSource,
    /onclick="[^"]*\b(clearVideoPausedState|markVideo|toggleVideoFavorite)\s*\(/
  )
  assert.match(
    appSource,
    /bindVideoSetAsideActions\(grid,[\s\S]*?\}\)\s*\}\s*bindRenderedVideoStateActions\(grid\)/
  )
  assert.match(
    appSource,
    /watchedGrid\.innerHTML =[\s\S]*?\.join\(''\)\s*bindRenderedVideoStateActions\(watchedGrid\)/
  )
  assert.match(
    appSource,
    /function refreshVideoActionUiWithoutFeedRerender[\s\S]*?bindRenderedVideoStateActions\(card\)/
  )
  for (const actionName of [
    'clearVideoPausedState',
    'markVideo',
    'toggleVideoFavorite'
  ]) {
    assert.equal(GLOBAL_ACTION_NAMES.includes(actionName), false)
  }
})

function createHarness(controls) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-video-state-action]')
      return controls
    }
  }
}

function createActions(calls) {
  return {
    clearPaused(...args) { calls.push(['clearPaused', args]) },
    mark(...args) { calls.push(['mark', args]) },
    toggleFavorite(...args) { calls.push(['toggleFavorite', args]) }
  }
}

test('video state controls preserve arguments and cancellation boundaries', () => {
  const controls = [
    createControl('clear-paused'),
    createControl('remove-watch-later'),
    createControl('remove-favorite'),
    createControl('toggle-watch-later', {
      status: 'watch-later',
      watchLater: 'true'
    }),
    createControl('toggle-favorite', {
      videoStateSurface: 'watched_card'
    })
  ]
  const calls = []
  assert.equal(
    bindVideoStateActions(createHarness(controls), createActions(calls)),
    5
  )

  const results = controls.map(control => control.click())
  assert.deepEqual(calls, [
    ['clearPaused', ['video-1']],
    ['mark', ['video-1', 'unwatched', { watchLater: false }]],
    ['toggleFavorite', ['video-1', {
      surface: 'channel_shelf_badge'
    }]],
    ['mark', ['video-1', 'watch-later', { watchLater: true }]],
    ['toggleFavorite', ['video-1', { surface: 'watched_card' }]]
  ])
  results.forEach((result, index) => {
    assert.equal(result.defaultPrevented, index < 3)
    assert.equal(result.propagationStopped, index < 3)
  })
})

test('bound controls use live action metadata and replacements bind once', () => {
  const control = createControl('remove-favorite')
  const calls = []
  const actions = createActions(calls)
  const harness = createHarness([control])

  assert.equal(bindVideoStateActions(harness, actions), 1)
  assert.equal(bindVideoStateActions(harness, actions), 0)
  control.dataset.videoStateAction = 'remove-watch-later'
  control.click()
  assert.deepEqual(calls, [
    ['mark', ['video-1', 'unwatched', { watchLater: false }]]
  ])
  assert.equal(control.listenerCount(), 1)

  const replacement = createControl('toggle-favorite', {
    videoId: 'video-2'
  })
  harness.querySelectorAll = selector => {
    assert.equal(selector, '[data-video-state-action]')
    return [control, replacement]
  }
  assert.equal(bindVideoStateActions(harness, actions), 1)
  replacement.click()
  assert.deepEqual(calls.at(-1), [
    'toggleFavorite',
    ['video-2', { surface: 'video_card' }]
  ])
})

test('video state binding ignores unknown actions and validates boundaries', () => {
  const unknown = createControl('unknown')
  const calls = []
  const actions = createActions(calls)
  assert.equal(
    bindVideoStateActions(createHarness([unknown]), actions),
    0
  )
  assert.equal(unknown.listenerCount(), 0)

  assert.throws(
    () => bindVideoStateActions(null, actions),
    /queryable root/
  )
  for (const callback of ['clearPaused', 'mark', 'toggleFavorite']) {
    assert.throws(
      () => bindVideoStateActions(createHarness([]), {
        ...actions,
        [callback]: null
      }),
      /clearPaused, mark, and toggleFavorite callbacks/
    )
  }
})
