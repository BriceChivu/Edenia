import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindActivityLogFilterActions
} from '../../src/features/settings/activity-log-filter-actions.js'

const filterNames = ['all', 'user', 'auto', 'issues', 'points']

function createHarness(names = filterNames) {
  const controls = names.map(activityLogFilter => {
    const control = new EventTarget()
    control.dataset = { activityLogFilter }
    return control
  })
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-activity-log-filter]')
      return controls
    }
  }
  return { controls, root }
}

test('Activity Log filter binding reads every live dataset value at click time', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindActivityLogFilterActions(root, {
    setFilter(filter) {
      calls.push(filter)
    }
  }), 5)

  controls.forEach(control => control.dispatchEvent(new Event('click')))
  controls[1].dataset.activityLogFilter = 'issues'
  controls[1].dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [...filterNames, 'issues'])
})

test('Activity Log filter binding is idempotent and tolerates absent controls', () => {
  const { controls, root } = createHarness(['all'])
  const calls = []
  const actions = {
    setFilter(filter) {
      calls.push(filter)
    }
  }
  assert.equal(bindActivityLogFilterActions(root, actions), 1)
  assert.equal(bindActivityLogFilterActions(root, actions), 0)
  controls[0].dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['all'])

  const emptyRoot = createHarness([]).root
  assert.equal(bindActivityLogFilterActions(emptyRoot, actions), 0)
})

test('Activity Log filter binding forwards missing values for existing fallback handling', () => {
  const { controls, root } = createHarness(['all'])
  const calls = []
  assert.equal(bindActivityLogFilterActions(root, {
    setFilter(filter) {
      calls.push(filter)
    }
  }), 1)

  delete controls[0].dataset.activityLogFilter
  controls[0].dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [undefined])
})

test('Activity Log filter binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindActivityLogFilterActions(null, { setFilter() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindActivityLogFilterActions(root, {}),
    /setFilter callback/
  )
})
