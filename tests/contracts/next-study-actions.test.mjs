import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindNextStudyActions
} from '../../src/features/videos/next-study-actions.js'

const controlSelector = '[data-next-study-action]'

function createControl(actionName, videoId) {
  const control = new EventTarget()
  control.dataset = {
    nextStudyAction: actionName,
    videoId
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
    }
  }
}

test('Next Study binding forwards exact click events and live video IDs', () => {
  const open = createControl('open', 'open-before')
  const focus = createControl('focus', 'focus-before')
  const { root } = createHarness([open, focus])
  const calls = []

  assert.equal(bindNextStudyActions(root, createActions(calls)), 2)

  open.dataset.videoId = 'open-live'
  focus.dataset.videoId = 'focus-live'
  const openEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const focusEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(open.dispatchEvent(openEvent), true)
  assert.equal(focus.dispatchEvent(focusEvent), true)
  assert.deepEqual(calls, [
    ['open', [openEvent, 'open-live']],
    ['focus', [focusEvent, 'focus-live']]
  ])
  ;[openEvent, focusEvent].forEach(event => {
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

  const replacementFocus = createControl('focus', 'replacement-focus')
  harness.replaceControls([originalOpen, replacementFocus])

  assert.equal(bindNextStudyActions(harness.root, actions), 1)
  assert.equal(bindNextStudyActions(harness.root, actions), 0)
  replacementFocus.dispatchEvent(new Event('click'))

  assert.deepEqual(calls.map(([name, args]) => [name, args[1]]), [
    ['open', 'original-open'],
    ['focus', 'replacement-focus']
  ])
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
    { ...validActions, focus: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindNextStudyActions(root, actions),
      /open and focus callbacks/
    )
  })
  assert.throws(
    () => bindNextStudyActions(null, null),
    /open and focus callbacks/
  )
})
