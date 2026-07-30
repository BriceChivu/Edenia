import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindThemeActions
} from '../../src/features/theme/actions.js'

function createHarness(hasControl = true) {
  const control = hasControl ? new EventTarget() : null
  const root = {
    querySelector(selector) {
      assert.equal(selector, '[data-theme-action="toggle"]')
      return control
    }
  }
  return { control, root }
}

test('theme binding invokes one zero-argument action without cancelling the click', () => {
  const { control, root } = createHarness()
  const calls = []
  assert.equal(bindThemeActions(root, {
    toggle(...args) {
      calls.push(args)
    }
  }), 1)

  const event = new Event('click', { cancelable: true })
  assert.equal(control.dispatchEvent(event), true)
  assert.equal(event.defaultPrevented, false)
  assert.deepEqual(calls, [[]])
})

test('theme binding is idempotent and tolerates an absent control', () => {
  const { control, root } = createHarness()
  const calls = []
  const actions = {
    toggle() {
      calls.push('toggle')
    }
  }
  assert.equal(bindThemeActions(root, actions), 1)
  assert.equal(bindThemeActions(root, actions), 0)
  control.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['toggle'])
  assert.equal(bindThemeActions(createHarness(false).root, actions), 0)
})

test('theme binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindThemeActions(null, { toggle() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindThemeActions(root, {}),
    /toggle callback/
  )
})
