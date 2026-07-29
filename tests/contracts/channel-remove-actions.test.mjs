import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindChannelRemoveActions
} from '../../src/features/channels/remove-actions.js'

const controlSelector = '[data-channel-remove-action="remove"]'

function createControl(actionName, channelId) {
  const control = new EventTarget()
  control.dataset = {
    channelRemoveAction: actionName,
    channelId
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
    remove(...args) {
      calls.push(args)
      return false
    }
  }
}

test('channel removal forwards the exact event and live channel ID', () => {
  const control = createControl('remove', 'before')
  const { root } = createHarness([control])
  const calls = []

  assert.equal(bindChannelRemoveActions(root, createActions(calls)), 1)

  control.dataset.channelId = 'live'
  const event = new Event('click', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(control.dispatchEvent(event), true)
  assert.deepEqual(calls, [[event, 'live']])
  assert.equal(event.defaultPrevented, false)
  assert.equal(event.cancelBubble, false)
})

test('channel removal leaves cancellation to the callback', () => {
  const control = createControl('remove', 'channel')
  const { root } = createHarness([control])
  const calls = []

  assert.equal(bindChannelRemoveActions(root, {
    remove(event, channelId) {
      calls.push([event, channelId])
      event.preventDefault()
      event.stopPropagation()
    }
  }), 1)

  const event = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  assert.equal(control.dispatchEvent(event), false)
  assert.deepEqual(calls, [[event, 'channel']])
  assert.equal(event.defaultPrevented, true)
  assert.equal(event.cancelBubble, true)
})

test('channel removal is idempotent and binds replacement controls', () => {
  const original = createControl('remove', 'original')
  const harness = createHarness([original])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindChannelRemoveActions(harness.root, actions), 1)
  assert.equal(bindChannelRemoveActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('click'))

  const replacement = createControl('remove', 'replacement')
  harness.replaceControls([original, replacement])
  assert.equal(bindChannelRemoveActions(harness.root, actions), 1)
  assert.equal(bindChannelRemoveActions(harness.root, actions), 0)
  replacement.dispatchEvent(new Event('click'))

  assert.deepEqual(calls.map(([, channelId]) => channelId), [
    'original',
    'replacement'
  ])
})

test('channel removal ignores unknown actions until they become supported', () => {
  const control = createControl('archive', 'promoted')
  const { root } = createHarness([control])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindChannelRemoveActions(root, actions), 0)
  control.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [])

  control.dataset.channelRemoveAction = 'remove'
  assert.equal(bindChannelRemoveActions(root, actions), 1)
  assert.equal(bindChannelRemoveActions(root, actions), 0)
  const event = new Event('click')
  control.dispatchEvent(event)
  assert.deepEqual(calls, [[event, 'promoted']])
})

test('channel removal tolerates missing controls', () => {
  const { root } = createHarness([])

  assert.equal(bindChannelRemoveActions(root, createActions([])), 0)
})

test('channel removal fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = createActions([])

  assert.throws(
    () => bindChannelRemoveActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindChannelRemoveActions({}, validActions),
    /queryable root/
  )

  ;[
    null,
    {},
    { remove: null }
  ].forEach(actions => {
    assert.throws(
      () => bindChannelRemoveActions(root, actions),
      /remove callback/
    )
  })
})
