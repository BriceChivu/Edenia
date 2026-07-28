import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindFeedbackSubmissionActions
} from '../../src/features/feedback/submission-actions.js'

const selector =
  '#feedbackForm[data-feedback-submission-action="submit"]'

function createHarness(hasForm = true) {
  const form = hasForm ? new EventTarget() : null
  const root = {
    querySelector(candidate) {
      return candidate === selector ? form : null
    }
  }
  return { form, root }
}

test('feedback submission binding forwards the exact live submit event', () => {
  const { form, root } = createHarness()
  const calls = []
  assert.equal(bindFeedbackSubmissionActions(root, {
    submit(event, ...extra) {
      calls.push({
        event,
        extra,
        currentTarget: event.currentTarget
      })
    }
  }), 1)

  const event = new Event('submit', { cancelable: true })
  assert.equal(form.dispatchEvent(event), true)
  assert.equal(event.defaultPrevented, false)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].event, event)
  assert.equal(calls[0].currentTarget, form)
  assert.deepEqual(calls[0].extra, [])
})

test('feedback submission binding is idempotent and tolerates no form', () => {
  const { form, root } = createHarness()
  let calls = 0
  const actions = {
    submit() {
      calls += 1
    }
  }
  assert.equal(bindFeedbackSubmissionActions(root, actions), 1)
  assert.equal(bindFeedbackSubmissionActions(root, actions), 0)
  form.dispatchEvent(new Event('submit'))
  assert.equal(calls, 1)
  assert.equal(
    bindFeedbackSubmissionActions(createHarness(false).root, actions),
    0
  )
})

test('feedback submission binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindFeedbackSubmissionActions(null, { submit() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindFeedbackSubmissionActions(root, {}),
    /submit callback/
  )
})
