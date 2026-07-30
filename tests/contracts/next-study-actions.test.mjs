import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindNextStudyActions
} from '../../src/features/videos/next-study-actions.js'

const controlSelector = '[data-next-study-action]'

function createControl(actionName, videoId, dataset = {}) {
  const control = new EventTarget()
  control.dataset = {
    nextStudyAction: actionName,
    videoId,
    ...dataset
  }
  return control
}

function createHarness(initialControls = []) {
  let controls = initialControls
  return {
    root: {
      querySelectorAll(selector) {
        assert.equal(selector, controlSelector)
        return controls
      }
    },
    replaceControls(nextControls) {
      controls = nextControls
    }
  }
}

function createActions(calls) {
  return {
    open(...args) {
      calls.push(['open', args])
      return false
    },
    focus(...args) {
      calls.push(['focus', args])
      return false
    },
    toggleFavorite(...args) {
      calls.push(['toggleFavorite', args])
      return false
    }
  }
}

test('Next Study binding preserves exact events and live datasets', () => {
  const open = createControl('open', 'open-before')
  const focus = createControl('focus', 'focus-before')
  const toggleFavorite = createControl(
    'toggle-favorite',
    'favorite-before',
    { nextStudySurface: 'surface-before' }
  )
  const { root } = createHarness([open, focus, toggleFavorite])
  const calls = []

  assert.equal(bindNextStudyActions(root, createActions(calls)), 3)

  open.dataset.videoId = 'open-live'
  focus.dataset.videoId = 'focus-live'
  toggleFavorite.dataset.videoId = 'favorite-live'
  toggleFavorite.dataset.nextStudySurface = 'next_study'
  const openEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const focusEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const toggleFavoriteEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(open.dispatchEvent(openEvent), true)
  assert.equal(focus.dispatchEvent(focusEvent), true)
  assert.equal(toggleFavorite.dispatchEvent(toggleFavoriteEvent), true)
  assert.deepEqual(calls, [
    ['open', [openEvent, 'open-live']],
    ['focus', [focusEvent, 'focus-live']],
    ['toggleFavorite', [
      'favorite-live',
      { surface: 'next_study' }
    ]]
  ])
  ;[openEvent, focusEvent, toggleFavoriteEvent].forEach(event => {
    assert.equal(event.bubbles, true)
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  })
})

test('Next Study binding is idempotent and binds replacement controls', () => {
  const originalOpen = createControl('open', 'original-open')
  const harness = createHarness([originalOpen])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindNextStudyActions(harness.root, actions), 1)
  assert.equal(bindNextStudyActions(harness.root, actions), 0)
  originalOpen.dispatchEvent(new Event('click'))

  const replacementFavorite = createControl(
    'toggle-favorite',
    'replacement-favorite',
    { nextStudySurface: 'next_study' }
  )
  harness.replaceControls([originalOpen, replacementFavorite])

  assert.equal(bindNextStudyActions(harness.root, actions), 1)
  assert.equal(bindNextStudyActions(harness.root, actions), 0)
  replacementFavorite.dispatchEvent(new Event('click'))

  assert.deepEqual(calls.map(([name, args]) => [name, args[1]]), [
    ['open', 'original-open'],
    ['toggleFavorite', { surface: 'next_study' }]
  ])
  assert.equal(calls[1][1][0], 'replacement-favorite')
})

test('Next Study binding tolerates absent roots and controls', () => {
  const calls = []
  const actions = createActions(calls)
  const unknown = createControl('unknown', 'unknown')
  const harness = createHarness([null, unknown])

  assert.equal(bindNextStudyActions(null, actions), 0)
  assert.equal(bindNextStudyActions(undefined, actions), 0)
  assert.equal(bindNextStudyActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [])

  harness.replaceControls([])
  assert.equal(bindNextStudyActions(harness.root, actions), 0)
})

test('Next Study binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = createActions([])

  assert.throws(
    () => bindNextStudyActions({}, validActions),
    /queryable root/
  )

  const invalidActionMaps = [
    null,
    {},
    { ...validActions, open: null },
    { ...validActions, focus: null },
    { ...validActions, toggleFavorite: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindNextStudyActions(root, actions),
      /open, focus, and toggleFavorite callbacks/
    )
  })
  assert.throws(
    () => bindNextStudyActions(null, null),
    /open, focus, and toggleFavorite callbacks/
  )
})
