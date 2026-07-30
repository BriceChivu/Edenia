import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindIntroFinishActions
} from '../../src/features/onboarding/intro-finish-actions.js'

const controlSelector = '[data-intro-finish-action]'

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

test('intro finish binding invokes both controls with uncancelled zero-argument calls', () => {
  const skip = new EventTarget()
  const start = new EventTarget()
  const { root } = createHarness([skip, start])
  const calls = []

  assert.equal(bindIntroFinishActions(root, {
    finish(...args) {
      calls.push(args)
      return false
    }
  }), 2)

  const skipEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const startEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(skip.dispatchEvent(skipEvent), true)
  assert.equal(start.dispatchEvent(startEvent), true)
  assert.deepEqual(calls, [[], []])
  ;[skipEvent, startEvent].forEach(event => {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  })
})

test('intro finish binding is idempotent and binds replacement controls', () => {
  const original = new EventTarget()
  const harness = createHarness([original])
  const calls = []
  const actions = {
    finish() {
      calls.push('finish')
    }
  }

  assert.equal(bindIntroFinishActions(harness.root, actions), 1)
  assert.equal(bindIntroFinishActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('click'))

  const replacement = new EventTarget()
  harness.replaceControls([original, replacement])
  assert.equal(bindIntroFinishActions(harness.root, actions), 1)
  assert.equal(bindIntroFinishActions(harness.root, actions), 0)
  replacement.dispatchEvent(new Event('click'))

  assert.deepEqual(calls, ['finish', 'finish'])
})

test('intro finish binding tolerates missing controls', () => {
  const { root } = createHarness([])
  const calls = []

  assert.equal(bindIntroFinishActions(root, {
    finish() {
      calls.push('finish')
    }
  }), 0)
  assert.deepEqual(calls, [])
})

test('intro finish binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()

  assert.throws(
    () => bindIntroFinishActions(null, { finish() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindIntroFinishActions({}, { finish() {} }),
    /queryable root/
  )

  const invalidActionMaps = [
    null,
    {},
    { finish: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindIntroFinishActions(root, actions),
      /finish callback/
    )
  })
})
