import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindLearnerProfileAccessActions
} from '../../src/features/profile-access/actions.js'

const selectors = {
  continueReplacement: '[data-profile-access-action="continue-replacement"]',
  discardReplacement: '[data-profile-access-action="discard-replacement"]',
  exportReplacement: '[data-profile-access-action="export-replacement"]',
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

test('profile access controls forward protected replacement and recovery intent', () => {
  const { controls, root } = createHarness()
  const calls = []

  assert.equal(bindLearnerProfileAccessActions(root, {
    continueReplacement: () => calls.push('continue-replacement'),
    discardReplacement: () => calls.push('discard-replacement'),
    exportReplacement: () => calls.push('export-replacement'),
    retry: () => calls.push('retry'),
    signOut: () => calls.push('sign-out')
  }), 5)

  controls.get(selectors.continueReplacement).dispatch('click')
  controls.get(selectors.exportReplacement).dispatch('click')
  controls.get(selectors.discardReplacement).dispatch('click')
  controls.get(selectors.retry).dispatch('click')
  controls.get(selectors.signOut).dispatch('click')

  assert.deepEqual(calls, [
    'continue-replacement',
    'export-replacement',
    'discard-replacement',
    'retry',
    'sign-out'
  ])
})

test('profile access recovery binding is idempotent and boundary checked', () => {
  const { root } = createHarness()
  const actions = {
    continueReplacement() {},
    discardReplacement() {},
    exportReplacement() {},
    retry() {},
    signOut() {}
  }

  assert.equal(bindLearnerProfileAccessActions(root, actions), 5)
  assert.equal(bindLearnerProfileAccessActions(root, actions), 0)
  assert.equal(bindLearnerProfileAccessActions(createHarness([]).root, actions), 0)
  assert.throws(
    () => bindLearnerProfileAccessActions(null, actions),
    /queryable root/
  )
  assert.throws(
    () => bindLearnerProfileAccessActions(root, { retry() {} }),
    /replacement, retry, and sign-out callbacks/
  )
})
