import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindStudyHistoryLockedAccessActions
} from '../../src/features/study-history/locked-access-actions.js'

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

test('locked history actions delegate current access state', () => {
  const { listeners, root } = createHarness()
  const states = []
  assert.equal(bindStudyHistoryLockedAccessActions(root, {
    requestAccess(state) {
      states.push(state)
    }
  }), true)
  const control = {
    dataset: { historyAccessState: 'locked' },
    owned: true
  }
  listeners.get('click')({
    target: { closest: () => control }
  })
  assert.deepEqual(states, ['locked'])
  assert.equal(bindStudyHistoryLockedAccessActions(root, {
    requestAccess() {}
  }), false)
})

test('locked history actions ignore controls outside their root', () => {
  const { listeners, root } = createHarness()
  const states = []
  bindStudyHistoryLockedAccessActions(root, {
    requestAccess(state) {
      states.push(state)
    }
  })
  listeners.get('click')({
    target: {
      closest: () => ({
        dataset: { historyAccessState: 'unavailable' },
        owned: false
      })
    }
  })
  assert.deepEqual(states, [])
})

test('locked history actions validate their boundary', () => {
  assert.throws(
    () => bindStudyHistoryLockedAccessActions(null, { requestAccess() {} }),
    /interactive root/
  )
  assert.throws(
    () => bindStudyHistoryLockedAccessActions(createHarness().root, {}),
    /requestAccess callback/
  )
})
