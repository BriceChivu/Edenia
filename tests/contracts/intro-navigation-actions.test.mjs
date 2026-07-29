import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindIntroNavigationActions
} from '../../src/features/onboarding/intro-navigation-actions.js'

const controlSelector = '[data-intro-navigation-direction]'

function createControl(direction) {
  const control = new EventTarget()
  control.dataset = {
    introNavigationDirection: direction
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

test('intro navigation binding forwards exact numeric directions without cancelling clicks', () => {
  const previous = createControl('-1')
  const next = createControl('1')
  const { root } = createHarness([previous, next])
  const calls = []

  assert.equal(bindIntroNavigationActions(root, {
    navigate(...args) {
      calls.push(args)
      return false
    }
  }), 2)

  const previousEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const nextEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(previous.dispatchEvent(previousEvent), true)
  assert.equal(next.dispatchEvent(nextEvent), true)
  assert.deepEqual(calls, [[-1], [1]])
  ;[previousEvent, nextEvent].forEach(event => {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  })
})

test('intro navigation binding is idempotent and binds replacement controls', () => {
  const original = createControl('-1')
  const harness = createHarness([original])
  const calls = []
  const actions = {
    navigate(direction) {
      calls.push(direction)
    }
  }

  assert.equal(bindIntroNavigationActions(harness.root, actions), 1)
  assert.equal(bindIntroNavigationActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('click'))

  const replacement = createControl('1')
  harness.replaceControls([original, replacement])
  assert.equal(bindIntroNavigationActions(harness.root, actions), 1)
  assert.equal(bindIntroNavigationActions(harness.root, actions), 0)
  replacement.dispatchEvent(new Event('click'))

  assert.deepEqual(calls, [-1, 1])
})

test('intro navigation binding ignores unknown values until they become supported', () => {
  const unknown = createControl('0')
  const malformed = createControl('+1')
  const harness = createHarness([unknown, malformed])
  const calls = []
  const actions = {
    navigate(direction) {
      calls.push(direction)
    }
  }

  assert.equal(bindIntroNavigationActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('click'))
  malformed.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [])

  unknown.dataset.introNavigationDirection = '1'
  assert.equal(bindIntroNavigationActions(harness.root, actions), 1)
  assert.equal(bindIntroNavigationActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [1])
})

test('intro navigation binding tolerates missing controls', () => {
  const { root } = createHarness([])

  assert.equal(bindIntroNavigationActions(root, {
    navigate() {}
  }), 0)
})

test('intro navigation binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()

  assert.throws(
    () => bindIntroNavigationActions(null, { navigate() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindIntroNavigationActions({}, { navigate() {} }),
    /queryable root/
  )

  const invalidActionMaps = [
    null,
    {},
    { navigate: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindIntroNavigationActions(root, actions),
      /navigate callback/
    )
  })
})
