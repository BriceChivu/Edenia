import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindLearnerProfileAccessActions
} from '../../src/features/profile-access/actions.js'

const selectors = {
  retry: '[data-profile-access-action="retry"]',
  signOut: '[data-profile-access-action="sign-out"]'
}

function createHarness(included = Object.keys(selectors)) {
  const controls = new Map(included.map(key => [selectors[key], {
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener)
    },
    dispatch(type) {
      this.listeners.get(type)?.()
    }
  }]))
  return {
    controls,
    root: {
      querySelector(selector) {
        return controls.get(selector) || null
      }
    }
  }
}

test('profile access recovery controls forward retry and local sign-out intent', () => {
  const { controls, root } = createHarness()
  const calls = []

  assert.equal(bindLearnerProfileAccessActions(root, {
    retry: () => calls.push('retry'),
    signOut: () => calls.push('sign-out')
  }), 2)

  controls.get(selectors.retry).dispatch('click')
  controls.get(selectors.signOut).dispatch('click')

  assert.deepEqual(calls, ['retry', 'sign-out'])
})

test('profile access recovery binding is idempotent and boundary checked', () => {
  const { root } = createHarness()
  const actions = { retry() {}, signOut() {} }

  assert.equal(bindLearnerProfileAccessActions(root, actions), 2)
  assert.equal(bindLearnerProfileAccessActions(root, actions), 0)
  assert.equal(bindLearnerProfileAccessActions(createHarness([]).root, actions), 0)
  assert.throws(
    () => bindLearnerProfileAccessActions(null, actions),
    /queryable root/
  )
  assert.throws(
    () => bindLearnerProfileAccessActions(root, { retry() {} }),
    /retry and sign-out callbacks/
  )
})
