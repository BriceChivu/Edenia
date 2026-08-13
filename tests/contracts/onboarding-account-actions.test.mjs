import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindOnboardingAccountActions
} from '../../src/features/onboarding/account-actions.js'

function createControl() {
  return new EventTarget()
}

function createHarness() {
  const google = createControl()
  const emailInput = { value: 'first@example.com' }
  const emailForm = createControl()
  emailForm.querySelector = selector => {
    assert.equal(selector, '[data-onboarding-account-email]')
    return emailInput
  }
  const controls = new Map([
    ['[data-onboarding-account-action="google"]', google],
    ['[data-onboarding-account-action="email-form"]', emailForm]
  ])
  return {
    emailForm,
    emailInput,
    google,
    root: {
      querySelector(selector) {
        return controls.get(selector) || null
      }
    }
  }
}

test('onboarding Account actions bind Google and live email values once', () => {
  const harness = createHarness()
  const calls = []
  const actions = {
    signInWithGoogle() {
      calls.push(['google'])
    },
    sendMagicLink(email) {
      calls.push(['email', email])
    }
  }

  assert.equal(bindOnboardingAccountActions(harness.root, actions), 2)
  assert.equal(bindOnboardingAccountActions(harness.root, actions), 0)
  harness.google.dispatchEvent(new Event('click'))
  harness.emailInput.value = 'latest@example.com'
  const submit = new Event('submit', { cancelable: true })
  harness.emailForm.dispatchEvent(submit)

  assert.equal(submit.defaultPrevented, true)
  assert.deepEqual(calls, [
    ['google'],
    ['email', 'latest@example.com']
  ])
})

test('onboarding Account actions tolerate absent optional controls', () => {
  const root = { querySelector() { return null } }
  assert.equal(bindOnboardingAccountActions(root, {
    signInWithGoogle() {},
    sendMagicLink() {}
  }), 0)
})

test('onboarding Account actions reject invalid boundaries', () => {
  const validActions = {
    signInWithGoogle() {},
    sendMagicLink() {}
  }
  assert.throws(
    () => bindOnboardingAccountActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindOnboardingAccountActions({ querySelector() {} }, {}),
    /Google and email callbacks/
  )
})
