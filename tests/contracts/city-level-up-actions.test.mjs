import assert from 'node:assert/strict'
import test from 'node:test'
import { bindCityLevelUpActions } from '../../src/features/city/level-up-actions.js'

const selector = '#levelUpButton[data-city-level-action="claim"]'

function createHarness(hasControl = true) {
  const control = hasControl ? new EventTarget() : null
  const root = {
    querySelector(candidate) {
      return candidate === selector ? control : null
    }
  }
  return { control, root }
}

test('city level-up binding preserves a zero-argument uncancelled claim', () => {
  const { control, root } = createHarness()
  const calls = []
  assert.equal(bindCityLevelUpActions(root, {
    claim(...args) {
      calls.push(args)
    }
  }), 1)

  const event = new Event('click', { cancelable: true })
  assert.equal(control.dispatchEvent(event), true)
  assert.equal(event.defaultPrevented, false)
  assert.deepEqual(calls, [[]])
})

test('city level-up binding is idempotent and tolerates an absent control', () => {
  const { control, root } = createHarness()
  let calls = 0
  const actions = {
    claim() {
      calls += 1
    }
  }
  assert.equal(bindCityLevelUpActions(root, actions), 1)
  assert.equal(bindCityLevelUpActions(root, actions), 0)
  control.dispatchEvent(new Event('click'))
  assert.equal(calls, 1)
  assert.equal(bindCityLevelUpActions(createHarness(false).root, actions), 0)
})

test('city level-up binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindCityLevelUpActions(null, { claim() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindCityLevelUpActions(root, {}),
    /claim callback/
  )
})
