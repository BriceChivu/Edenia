import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindWatchedSectionActions
} from '../../src/features/videos/watched-section-actions.js'

const selector =
  '#watchedSectionToggle[data-watched-section-action="toggle"]'

function createHarness(includeControl = true) {
  const control = includeControl ? new EventTarget() : null
  const root = {
    querySelector(candidate) {
      return candidate === selector ? control : null
    }
  }
  return { control, root }
}

test('watched-section binding preserves one zero-argument uncancelled call', () => {
  const { control, root } = createHarness()
  const calls = []
  assert.equal(bindWatchedSectionActions(root, {
    toggle(...args) {
      calls.push(args)
    }
  }), 1)

  const event = new Event('click', { cancelable: true })
  assert.equal(control.dispatchEvent(event), true)
  assert.equal(event.defaultPrevented, false)
  assert.deepEqual(calls, [[]])
})

test('watched-section binding is idempotent and tolerates an absent control', () => {
  const { control, root } = createHarness()
  const calls = []
  const actions = {
    toggle() {
      calls.push('toggle')
    }
  }
  assert.equal(bindWatchedSectionActions(root, actions), 1)
  assert.equal(bindWatchedSectionActions(root, actions), 0)
  control.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['toggle'])
  assert.equal(bindWatchedSectionActions(createHarness(false).root, actions), 0)
})

test('watched-section binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindWatchedSectionActions(null, { toggle() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindWatchedSectionActions(root, {}),
    /toggle callback/
  )
})
