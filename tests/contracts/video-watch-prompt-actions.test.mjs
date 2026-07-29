import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindVideoWatchPromptActions
} from '../../src/features/videos/watch-prompt-actions.js'

const controlSelector = '[data-video-watch-prompt-action]'

function createControl(actionName, dataset = {}) {
  const control = new EventTarget()
  control.dataset = {
    videoWatchPromptAction: actionName,
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
    favorite(...args) {
      calls.push(['favorite', args])
      return false
    },
    confirm(...args) {
      calls.push(['confirm', args])
      return false
    },
    dismiss(...args) {
      calls.push(['dismiss', args])
      return false
    }
  }
}

test('watch-prompt binding forwards exact events and live dataset arguments', () => {
  const favorite = createControl('favorite', {
    videoId: 'favorite-before'
  })
  const confirm = createControl('confirm', {
    videoId: 'confirm-before',
    rewatch: 'false',
    playerPrompt: 'false'
  })
  const dismiss = createControl('dismiss', {
    videoId: 'dismiss-before',
    playerPrompt: 'TRUE'
  })
  const { root } = createHarness([favorite, confirm, dismiss])
  const calls = []

  assert.equal(bindVideoWatchPromptActions(root, createActions(calls)), 3)

  favorite.dataset.videoId = 'favorite-live'
  confirm.dataset.videoId = 'confirm-live'
  confirm.dataset.rewatch = 'true'
  confirm.dataset.playerPrompt = 'true'
  dismiss.dataset.videoId = 'dismiss-live'

  const favoriteEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const confirmEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const dismissEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(favorite.dispatchEvent(favoriteEvent), true)
  assert.equal(confirm.dispatchEvent(confirmEvent), true)
  assert.equal(dismiss.dispatchEvent(dismissEvent), true)

  assert.deepEqual(calls, [
    ['favorite', [favoriteEvent, 'favorite-live']],
    ['confirm', [confirmEvent, 'confirm-live', true, true]],
    ['dismiss', [dismissEvent, 'dismiss-live', false]]
  ])
  ;[favoriteEvent, confirmEvent, dismissEvent].forEach(event => {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  })
})

test('watch-prompt binding uses strict true-string boolean conversion', () => {
  const confirm = createControl('confirm', {
    videoId: 'confirm',
    rewatch: 'TRUE',
    playerPrompt: '1'
  })
  const dismiss = createControl('dismiss', {
    videoId: 'dismiss',
    playerPrompt: 'true'
  })
  const { root } = createHarness([confirm, dismiss])
  const calls = []

  assert.equal(bindVideoWatchPromptActions(root, createActions(calls)), 2)

  const confirmEvent = new Event('click')
  const dismissEvent = new Event('click')
  confirm.dispatchEvent(confirmEvent)
  dismiss.dispatchEvent(dismissEvent)

  assert.deepEqual(calls, [
    ['confirm', [confirmEvent, 'confirm', false, false]],
    ['dismiss', [dismissEvent, 'dismiss', true]]
  ])
})

test('watch-prompt binding is idempotent and binds replacement controls', () => {
  const favorite = createControl('favorite', { videoId: 'favorite' })
  const originalConfirm = createControl('confirm', {
    videoId: 'original-confirm',
    rewatch: 'false',
    playerPrompt: 'false'
  })
  const harness = createHarness([favorite, originalConfirm])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindVideoWatchPromptActions(harness.root, actions), 2)
  assert.equal(bindVideoWatchPromptActions(harness.root, actions), 0)

  const favoriteEvent = new Event('click')
  const originalConfirmEvent = new Event('click')
  favorite.dispatchEvent(favoriteEvent)
  originalConfirm.dispatchEvent(originalConfirmEvent)

  const replacementConfirm = createControl('confirm', {
    videoId: 'replacement-confirm',
    rewatch: 'true',
    playerPrompt: 'false'
  })
  const replacementDismiss = createControl('dismiss', {
    videoId: 'replacement-dismiss',
    playerPrompt: 'true'
  })
  harness.replaceControls([favorite, replacementConfirm, replacementDismiss])

  assert.equal(bindVideoWatchPromptActions(harness.root, actions), 2)
  assert.equal(bindVideoWatchPromptActions(harness.root, actions), 0)

  const replacementConfirmEvent = new Event('click')
  const replacementDismissEvent = new Event('click')
  replacementConfirm.dispatchEvent(replacementConfirmEvent)
  replacementDismiss.dispatchEvent(replacementDismissEvent)

  assert.deepEqual(calls, [
    ['favorite', [favoriteEvent, 'favorite']],
    ['confirm', [originalConfirmEvent, 'original-confirm', false, false]],
    ['confirm', [replacementConfirmEvent, 'replacement-confirm', true, false]],
    ['dismiss', [replacementDismissEvent, 'replacement-dismiss', true]]
  ])
})

test('watch-prompt binding ignores unknown controls and tolerates no controls', () => {
  const foreign = createControl(undefined)
  delete foreign.dataset.videoWatchPromptAction
  const unknown = createControl('unknown', { videoId: 'unknown' })
  const harness = createHarness([foreign, unknown])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindVideoWatchPromptActions(harness.root, actions), 0)
  foreign.dispatchEvent(new Event('click'))
  unknown.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [])

  unknown.dataset.videoWatchPromptAction = 'favorite'
  assert.equal(bindVideoWatchPromptActions(harness.root, actions), 1)
  const promotedEvent = new Event('click')
  unknown.dispatchEvent(promotedEvent)
  assert.deepEqual(calls, [
    ['favorite', [promotedEvent, 'unknown']]
  ])

  harness.replaceControls([])
  assert.equal(bindVideoWatchPromptActions(harness.root, actions), 0)
})

test('watch-prompt binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = createActions([])

  assert.throws(
    () => bindVideoWatchPromptActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindVideoWatchPromptActions({}, validActions),
    /queryable root/
  )

  const invalidActionMaps = [
    null,
    {},
    { ...validActions, favorite: null },
    { ...validActions, confirm: null },
    { ...validActions, dismiss: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindVideoWatchPromptActions(root, actions),
      /favorite, confirm, and dismiss callbacks/
    )
  })
})
