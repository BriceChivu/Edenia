import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindLearnerProfileSyncActions
} from '../../src/features/profile-access/sync-actions.js'

const selectors = {
  exportRecovery: '[data-profile-sync-action="export-recovery"]',
  retry: '[data-profile-sync-action="retry"]'
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

test('profile sync recovery controls forward retry and export intent', () => {
  const { controls, root } = createHarness()
  const calls = []

  assert.equal(bindLearnerProfileSyncActions(root, {
    exportRecovery: () => calls.push('export-recovery'),
    retry: () => calls.push('retry')
  }), 2)

  controls.get(selectors.retry).dispatch('click')
  controls.get(selectors.exportRecovery).dispatch('click')

  assert.deepEqual(calls, ['retry', 'export-recovery'])
})

test('profile sync recovery binding is idempotent and boundary checked', () => {
  const { root } = createHarness()
  const actions = { exportRecovery() {}, retry() {} }

  assert.equal(bindLearnerProfileSyncActions(root, actions), 2)
  assert.equal(bindLearnerProfileSyncActions(root, actions), 0)
  assert.equal(bindLearnerProfileSyncActions(createHarness([]).root, actions), 0)
  assert.throws(
    () => bindLearnerProfileSyncActions(null, actions),
    /queryable root/
  )
  assert.throws(
    () => bindLearnerProfileSyncActions(root, { retry() {} }),
    /retry and export callbacks/
  )
})
