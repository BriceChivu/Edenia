import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindVideoSetAsideActions
} from '../../src/features/videos/set-aside-actions.js'

const controlSelector = '[data-video-set-aside-action]'

function createControl(actionName, dataset = {}) {
  const control = new EventTarget()
  control.dataset = {
    videoSetAsideAction: actionName,
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
    request(...args) {
      calls.push(['request', args])
    },
    cancel(...args) {
      calls.push(['cancel', args])
    },
    confirm(...args) {
      calls.push(['confirm', args])
    },
    handlePromptKeydown(event) {
      calls.push(['handlePromptKeydown', [event], event.currentTarget])
    }
  }
}

test('Video Set aside binding preserves live datasets and exact callback contracts', () => {
  const request = createControl('request', {
    videoId: 'original-video',
    videoSetAsideSurface: 'continue_watching'
  })
  const cancel = createControl('cancel')
  const confirm = createControl('confirm')
  const prompt = createControl('prompt')
  const { root } = createHarness([request, cancel, confirm, prompt])
  const calls = []

  assert.equal(bindVideoSetAsideActions(root, createActions(calls)), 4)

  request.dataset.videoId = 'replacement-video'
  request.dataset.videoSetAsideSurface = 'video_card'
  const requestEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const cancelEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const confirmEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const keydownEvent = new Event('keydown', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(request.dispatchEvent(requestEvent), true)
  assert.equal(cancel.dispatchEvent(cancelEvent), true)
  assert.equal(confirm.dispatchEvent(confirmEvent), true)
  assert.equal(prompt.dispatchEvent(keydownEvent), true)

  assert.deepEqual(calls, [
    ['request', [
      'replacement-video',
      { surface: 'video_card' }
    ]],
    ['cancel', []],
    ['confirm', []],
    ['handlePromptKeydown', [keydownEvent], prompt]
  ])
  ;[
    requestEvent,
    cancelEvent,
    confirmEvent,
    keydownEvent
  ].forEach(event => {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  })
})

test('Video Set aside binding is idempotent and binds replacement controls', () => {
  const originalRequest = createControl('request', {
    videoId: 'original',
    videoSetAsideSurface: 'continue_watching'
  })
  const originalPrompt = createControl('prompt')
  const harness = createHarness([originalRequest, originalPrompt])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindVideoSetAsideActions(harness.root, actions), 2)
  assert.equal(bindVideoSetAsideActions(harness.root, actions), 0)
  originalRequest.dispatchEvent(new Event('click'))
  originalPrompt.dispatchEvent(new Event('keydown'))

  const replacementRequest = createControl('request', {
    videoId: 'replacement',
    videoSetAsideSurface: 'video_card'
  })
  const replacementConfirm = createControl('confirm')
  harness.replaceControls([
    originalRequest,
    replacementRequest,
    replacementConfirm
  ])
  assert.equal(bindVideoSetAsideActions(harness.root, actions), 2)
  replacementRequest.dispatchEvent(new Event('click'))
  replacementConfirm.dispatchEvent(new Event('click'))

  assert.equal(calls.length, 4)
  assert.deepEqual(
    calls[0],
    ['request', ['original', { surface: 'continue_watching' }]]
  )
  assert.equal(calls[1][0], 'handlePromptKeydown')
  assert.equal(calls[1][1].length, 1)
  assert.equal(calls[1][2], originalPrompt)
  assert.deepEqual(
    calls[2],
    ['request', ['replacement', { surface: 'video_card' }]]
  )
  assert.deepEqual(calls[3], ['confirm', []])

  harness.replaceControls([])
  assert.equal(bindVideoSetAsideActions(harness.root, actions), 0)
})

test('Video Set aside binding ignores foreign and unknown controls until supported', () => {
  const foreign = createControl(undefined)
  delete foreign.dataset.videoSetAsideAction
  const unknown = createControl('unknown', {
    videoId: 'unknown-video',
    videoSetAsideSurface: 'video_card'
  })
  const harness = createHarness([foreign, unknown])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindVideoSetAsideActions(harness.root, actions), 0)
  ;['click', 'keydown'].forEach(type => {
    foreign.dispatchEvent(new Event(type))
    unknown.dispatchEvent(new Event(type))
  })
  assert.deepEqual(calls, [])

  unknown.dataset.videoSetAsideAction = 'request'
  unknown.dataset.videoId = 'supported-video'
  unknown.dataset.videoSetAsideSurface = 'continue_watching'
  assert.equal(bindVideoSetAsideActions(harness.root, actions), 1)
  unknown.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [
    ['request', [
      'supported-video',
      { surface: 'continue_watching' }
    ]]
  ])
})

test('Video Set aside binding fails closed on empty and invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = createActions([])

  assert.equal(bindVideoSetAsideActions(root, validActions), 0)
  assert.throws(
    () => bindVideoSetAsideActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindVideoSetAsideActions({}, validActions),
    /queryable root/
  )

  for (const callbackName of [
    'request',
    'cancel',
    'confirm',
    'handlePromptKeydown'
  ]) {
    assert.throws(
      () => bindVideoSetAsideActions(root, {
        ...validActions,
        [callbackName]: null
      }),
      /request, cancel, confirm, and handlePromptKeydown callbacks/
    )
  }
  assert.throws(
    () => bindVideoSetAsideActions(root, null),
    /request, cancel, confirm, and handlePromptKeydown callbacks/
  )
})
