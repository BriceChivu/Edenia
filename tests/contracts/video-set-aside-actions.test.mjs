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
    request(...args) { calls.push(['request', args]) },
    cancel(...args) { calls.push(['cancel', args]) },
    confirm(...args) { calls.push(['confirm', args]) },
    handlePromptKeydown(...args) { calls.push(['handlePromptKeydown', args]) }
  }
}

test('Set aside controls preserve live datasets and exact callback contracts', () => {
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
  request.dispatchEvent(new Event('click'))
  cancel.dispatchEvent(new Event('click'))
  confirm.dispatchEvent(new Event('click'))
  const keydownEvent = new Event('keydown')
  prompt.dispatchEvent(keydownEvent)

  assert.deepEqual(calls.slice(0, 3), [
    ['request', ['replacement-video', { surface: 'video_card' }]],
    ['cancel', []],
    ['confirm', []]
  ])
  assert.equal(calls[3][0], 'handlePromptKeydown')
  assert.equal(calls[3][1][0], keydownEvent)
})

test('Set aside binding is idempotent and binds replacement controls', () => {
  const original = createControl('request', {
    videoId: 'original',
    videoSetAsideSurface: 'continue_watching'
  })
  const harness = createHarness([original])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindVideoSetAsideActions(harness.root, actions), 1)
  assert.equal(bindVideoSetAsideActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('click'))

  const replacement = createControl('request', {
    videoId: 'replacement',
    videoSetAsideSurface: 'video_card'
  })
  harness.replaceControls([original, replacement])
  assert.equal(bindVideoSetAsideActions(harness.root, actions), 1)
  replacement.dispatchEvent(new Event('click'))

  assert.deepEqual(calls, [
    ['request', ['original', { surface: 'continue_watching' }]],
    ['request', ['replacement', { surface: 'video_card' }]]
  ])
})

test('Set aside binding ignores unknown controls and validates boundaries', () => {
  const unknown = createControl('unknown')
  const harness = createHarness([unknown])
  const actions = createActions([])
  assert.equal(bindVideoSetAsideActions(harness.root, actions), 0)
  assert.throws(
    () => bindVideoSetAsideActions(null, actions),
    /queryable root/
  )
  for (const callbackName of [
    'request',
    'cancel',
    'confirm',
    'handlePromptKeydown'
  ]) {
    assert.throws(
      () => bindVideoSetAsideActions(createHarness().root, {
        ...actions,
        [callbackName]: null
      }),
      /request, cancel, confirm, and handlePromptKeydown callbacks/
    )
  }
})
