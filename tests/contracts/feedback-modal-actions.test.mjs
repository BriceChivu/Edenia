import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindFeedbackModalActions
} from '../../src/features/feedback/modal-actions.js'

const selectors = [
  '.feedback-launch-btn[data-feedback-modal-action="open"]',
  '.feedback-backdrop[data-feedback-modal-action="close"]',
  '.feedback-close-btn[data-feedback-modal-action="close"]'
]

function createHarness(includedSelectors = selectors) {
  const controls = new Map(
    includedSelectors.map(selector => [selector, new EventTarget()])
  )
  const root = {
    querySelector(selector) {
      return controls.get(selector) || null
    }
  }
  return { controls, root }
}

test('feedback modal binding preserves exact zero-argument open and close calls', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindFeedbackModalActions(root, {
    open(...args) {
      calls.push(['open', args])
    },
    close(...args) {
      calls.push(['close', args])
    }
  }), 3)

  selectors.forEach(selector => {
    const event = new Event('click', { cancelable: true })
    assert.equal(controls.get(selector).dispatchEvent(event), true)
    assert.equal(event.defaultPrevented, false)
  })
  assert.deepEqual(calls, [
    ['open', []],
    ['close', []],
    ['close', []]
  ])
})

test('feedback modal binding is idempotent and tolerates absent controls', () => {
  const { controls, root } = createHarness([selectors[0]])
  const calls = []
  const actions = {
    open() {
      calls.push('open')
    },
    close() {
      calls.push('close')
    }
  }
  assert.equal(bindFeedbackModalActions(root, actions), 1)
  assert.equal(bindFeedbackModalActions(root, actions), 0)
  controls.get(selectors[0]).dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['open'])
  assert.equal(bindFeedbackModalActions(createHarness([]).root, actions), 0)
})

test('feedback modal binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindFeedbackModalActions(null, { open() {}, close() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindFeedbackModalActions(root, { open() {} }),
    /open and close callbacks/
  )
})
