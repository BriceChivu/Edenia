import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindActivityLogPaginationActions
} from '../../src/features/settings/activity-log-pagination-actions.js'

const actionSelector = '[data-activity-log-action="show-older"]'

function createHarness(includeList = true) {
  const list = includeList ? {
    listener: null,
    addEventListener(type, listener) {
      assert.equal(type, 'click')
      this.listener = listener
    },
    contains(control) {
      return control?.withinList === true
    },
    click(target) {
      let defaultPrevented = false
      this.listener?.({
        target,
        preventDefault() {
          defaultPrevented = true
        }
      })
      return defaultPrevented
    }
  } : null
  const root = {
    querySelector(selector) {
      assert.equal(selector, '#activityLogList')
      return list
    }
  }
  return { list, root }
}

function createTarget(control) {
  return {
    closest(selector) {
      assert.equal(selector, actionSelector)
      return control
    }
  }
}

test('Activity Log pagination delegates nested clicks with zero arguments', () => {
  const { list, root } = createHarness()
  const calls = []
  assert.equal(bindActivityLogPaginationActions(root, {
    showOlder(...args) {
      calls.push(args)
    }
  }), 1)

  const control = { withinList: true }
  assert.equal(list.click(createTarget(control)), false)
  assert.deepEqual(calls, [[]])

  list.click(createTarget({ withinList: false }))
  list.click(createTarget(null))
  assert.deepEqual(calls, [[]])
})

test('Activity Log pagination binding is idempotent and tolerates no list', () => {
  const { list, root } = createHarness()
  const calls = []
  const actions = {
    showOlder() {
      calls.push('show-older')
    }
  }
  assert.equal(bindActivityLogPaginationActions(root, actions), 1)
  assert.equal(bindActivityLogPaginationActions(root, actions), 0)
  list.click(createTarget({ withinList: true }))
  assert.deepEqual(calls, ['show-older'])
  assert.equal(
    bindActivityLogPaginationActions(createHarness(false).root, actions),
    0
  )
})

test('Activity Log pagination binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindActivityLogPaginationActions(null, { showOlder() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindActivityLogPaginationActions(root, {}),
    /showOlder callback/
  )
})
