import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindFeedbackConfirmationActions
} from '../../src/features/feedback/confirmation-actions.js'

function createHarness(hasControl = true) {
  const control = hasControl ? new EventTarget() : null
  const root = {
    querySelector(selector) {
      assert.equal(selector, '[data-feedback-confirmation-action="close"]')
      return control
    }
  }
  return { control, root }
}

test('feedback confirmation binding calls close with zero arguments', () => {
  const { control, root } = createHarness()
  const calls = []
  assert.equal(bindFeedbackConfirmationActions(root, {
    close(...args) {
      calls.push(args)
    }
  }), 1)

  const event = new Event('click', { cancelable: true })
  assert.equal(control.dispatchEvent(event), true)
  assert.equal(event.defaultPrevented, false)
  assert.deepEqual(calls, [[]])
})

test('feedback confirmation binding is idempotent and tolerates an absent control', () => {
  const { control, root } = createHarness()
  const calls = []
  const actions = {
    close() {
      calls.push('close')
    }
  }
  assert.equal(bindFeedbackConfirmationActions(root, actions), 1)
  assert.equal(bindFeedbackConfirmationActions(root, actions), 0)
  control.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['close'])
  assert.equal(
    bindFeedbackConfirmationActions(createHarness(false).root, actions),
    0
  )
})

test('feedback confirmation binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindFeedbackConfirmationActions(null, { close() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindFeedbackConfirmationActions(root, {}),
    /close callback/
  )
})
