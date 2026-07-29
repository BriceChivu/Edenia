import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindChannelShelfScrollActions
} from '../../src/features/channels/shelf-scroll-actions.js'

const controlSelector = '[data-channel-shelf-scroll-action]'

function createControl(actionName, direction) {
  const control = new EventTarget()
  control.dataset = {
    channelShelfScrollAction: actionName
  }
  if (direction !== undefined) {
    control.dataset.shelfDirection = direction
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
    scroll(...args) {
      calls.push(['scroll', args])
      return false
    },
    sync(...args) {
      calls.push(['sync', args])
      return false
    }
  }
}

test('channel shelf scrolling forwards live controls and numeric directions', () => {
  const previous = createControl('scroll', '-1')
  const next = createControl('scroll', '1')
  const track = createControl('sync')
  const { root } = createHarness([previous, next, track])
  const calls = []

  assert.equal(
    bindChannelShelfScrollActions(root, createActions(calls)),
    3
  )

  previous.dataset.shelfDirection = '1'
  next.dataset.shelfDirection = '-1'
  const previousEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const nextEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const trackEvent = new Event('scroll', {
    cancelable: true
  })

  assert.equal(previous.dispatchEvent(previousEvent), true)
  assert.equal(next.dispatchEvent(nextEvent), true)
  assert.equal(track.dispatchEvent(trackEvent), true)
  assert.deepEqual(calls, [
    ['scroll', [previous, 1]],
    ['scroll', [next, -1]],
    ['sync', [track]]
  ])
  ;[previousEvent, nextEvent, trackEvent].forEach(event => {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  })
})

test('channel shelf scrolling ignores invalid live directions', () => {
  const control = createControl('scroll', '-1')
  const { root } = createHarness([control])
  const calls = []

  assert.equal(
    bindChannelShelfScrollActions(root, createActions(calls)),
    1
  )

  control.dataset.shelfDirection = '0'
  control.dispatchEvent(new Event('click'))
  control.dataset.shelfDirection = 'forward'
  control.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [])

  control.dataset.shelfDirection = '1'
  control.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [
    ['scroll', [control, 1]]
  ])
})

test('channel shelf scrolling is idempotent and binds replacements', () => {
  const original = createControl('scroll', '-1')
  const harness = createHarness([original])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindChannelShelfScrollActions(harness.root, actions), 1)
  assert.equal(bindChannelShelfScrollActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('click'))

  const replacement = createControl('sync')
  harness.replaceControls([original, replacement])
  assert.equal(bindChannelShelfScrollActions(harness.root, actions), 1)
  assert.equal(bindChannelShelfScrollActions(harness.root, actions), 0)
  replacement.dispatchEvent(new Event('scroll'))

  assert.deepEqual(calls, [
    ['scroll', [original, -1]],
    ['sync', [replacement]]
  ])
})

test('unknown actions and invalid directions remain promotable', () => {
  const unknown = createControl('dismiss', '-1')
  const invalidDirection = createControl('scroll', '4')
  const harness = createHarness([unknown, invalidDirection])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindChannelShelfScrollActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('scroll'))
  invalidDirection.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [])

  unknown.dataset.channelShelfScrollAction = 'sync'
  invalidDirection.dataset.shelfDirection = '-1'
  assert.equal(bindChannelShelfScrollActions(harness.root, actions), 2)
  assert.equal(bindChannelShelfScrollActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('scroll'))
  invalidDirection.dispatchEvent(new Event('click'))

  assert.deepEqual(calls, [
    ['sync', [unknown]],
    ['scroll', [invalidDirection, -1]]
  ])
})

test('channel shelf scrolling tolerates missing controls', () => {
  const { root } = createHarness([])

  assert.equal(
    bindChannelShelfScrollActions(root, createActions([])),
    0
  )
})

test('channel shelf scrolling fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = createActions([])

  assert.throws(
    () => bindChannelShelfScrollActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindChannelShelfScrollActions({}, validActions),
    /queryable root/
  )

  ;[
    null,
    {},
    { ...validActions, scroll: null },
    { ...validActions, sync: null }
  ].forEach(actions => {
    assert.throws(
      () => bindChannelShelfScrollActions(root, actions),
      /scroll and sync callbacks/
    )
  })
})
