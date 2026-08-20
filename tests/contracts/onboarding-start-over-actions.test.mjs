import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindOnboardingStartOverActions
} from '../../src/features/onboarding/start-over-actions.js'

function createControl() {
  const listeners = []
  return {
    addEventListener(type, listener) {
      if (type === 'click') listeners.push(listener)
    },
    click() {
      for (const listener of listeners) listener()
    }
  }
}

test('Start over binding owns live replacement controls exactly once', () => {
  let controls = [createControl()]
  const root = {
    querySelectorAll(selector) {
      assert.equal(
        selector,
        '[data-personalized-onboarding-action="start-over"]'
      )
      return controls
    }
  }
  let callCount = 0
  const startOver = () => { callCount += 1 }

  assert.equal(bindOnboardingStartOverActions(root, startOver), 1)
  assert.equal(bindOnboardingStartOverActions(root, startOver), 0)
  controls[0].click()
  assert.equal(callCount, 1)

  controls = [createControl()]
  assert.equal(bindOnboardingStartOverActions(root, startOver), 1)
  controls[0].click()
  assert.equal(callCount, 2)
})

test('Start over binding fails closed on invalid boundaries', () => {
  assert.throws(
    () => bindOnboardingStartOverActions(null, () => {}),
    /queryable root/
  )
  assert.throws(
    () => bindOnboardingStartOverActions({ querySelectorAll() {} }, null),
    /require a callback/
  )
})
