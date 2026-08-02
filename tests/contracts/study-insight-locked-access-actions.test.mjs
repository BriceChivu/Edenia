import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindStudyInsightLockedAccessActions
} from '../../src/features/study-insights/locked-access-actions.js'

function createHarness() {
  const listeners = new Map()
  const root = {
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    contains(control) {
      return control?.owned === true
    }
  }
  return { listeners, root }
}

test('locked Study Insight actions delegate the current access state once', () => {
  const { listeners, root } = createHarness()
  const states = []
  assert.equal(bindStudyInsightLockedAccessActions(root, {
    requestAccess(state) {
      states.push(state)
    }
  }), true)
  const control = {
    dataset: { insightAccessState: 'locked' },
    owned: true
  }
  listeners.get('click')({ target: { closest: () => control } })
  assert.deepEqual(states, ['locked'])
  assert.equal(bindStudyInsightLockedAccessActions(root, {
    requestAccess() {}
  }), false)
})

test('locked Study Insight actions ignore controls outside their root', () => {
  const { listeners, root } = createHarness()
  const states = []
  bindStudyInsightLockedAccessActions(root, {
    requestAccess(state) {
      states.push(state)
    }
  })
  listeners.get('click')({
    target: {
      closest: () => ({
        dataset: { insightAccessState: 'unavailable' },
        owned: false
      })
    }
  })
  assert.deepEqual(states, [])
})

test('locked Study Insight actions validate their boundary', () => {
  assert.throws(
    () => bindStudyInsightLockedAccessActions(null, { requestAccess() {} }),
    /interactive root/
  )
  assert.throws(
    () => bindStudyInsightLockedAccessActions(createHarness().root, {}),
    /requestAccess callback/
  )
})
