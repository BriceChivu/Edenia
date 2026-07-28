import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindStudyHistoryViewActions
} from '../../src/features/study-history/view-actions.js'

function createHarness(selectors = [
  '[data-history-view="summary"]',
  '[data-history-view="heatmap"]'
]) {
  const controls = new Map(selectors.map(selector => [selector, new EventTarget()]))
  const root = {
    querySelector(selector) {
      return controls.get(selector) || null
    }
  }
  return { controls, root }
}

test('Study History view binding preserves exact literal arguments', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindStudyHistoryViewActions(root, {
    setView(view) {
      calls.push(view)
    }
  }), 2)

  controls.get('[data-history-view="summary"]').dispatchEvent(new Event('click'))
  controls.get('[data-history-view="heatmap"]').dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['summary', 'heatmap'])
})

test('Study History view binding is idempotent and tolerates absent controls', () => {
  const { controls, root } = createHarness(['[data-history-view="summary"]'])
  const calls = []
  const actions = {
    setView(view) {
      calls.push(view)
    }
  }
  assert.equal(bindStudyHistoryViewActions(root, actions), 1)
  assert.equal(bindStudyHistoryViewActions(root, actions), 0)
  controls.get('[data-history-view="summary"]').dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['summary'])
})

test('Study History view binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindStudyHistoryViewActions(null, { setView() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindStudyHistoryViewActions(root, {}),
    /setView callback/
  )
})
