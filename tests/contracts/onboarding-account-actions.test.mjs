import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindOnboardingAccountActions
} from '../../src/features/onboarding/account-actions.js'

function createControl() {
  return new EventTarget()
}

function createHarness() {
  const emailInput = { value: 'first@example.com' }
  const emailForm = createControl()
  emailForm.querySelector = selector => {
    assert.equal(selector, '[data-onboarding-account-email]')
    return emailInput
  }
  const codeInput = { value: '123456' }
  const codeForm = createControl()
  codeForm.querySelector = selector => {
    assert.equal(selector, '[data-onboarding-account-code]')
    return codeInput
  }
  const controls = new Map([
    ['[data-onboarding-account-action="email-form"]', emailForm],
    ['[data-onboarding-account-action="code-form"]', codeForm]
  ])
  return {
    codeForm,
    codeInput,
    emailForm,
    emailInput,
    root: {
      querySelector(selector) {
        return controls.get(selector) || null
      }
    }
  }
}

test('onboarding Account actions bind live email and code values once', () => {
  const harness = createHarness()
  const calls = []
  const actions = {
    requestEmailCode(email) { calls.push(['request', email]) },
    verifyEmailCode(code) { calls.push(['verify', code]) }
  }

  assert.equal(bindOnboardingAccountActions(harness.root, actions), 2)
  assert.equal(bindOnboardingAccountActions(harness.root, actions), 0)
  harness.emailInput.value = 'latest@example.com'
  harness.codeInput.value = '654321'
  const requestSubmit = new Event('submit', { cancelable: true })
  const verifySubmit = new Event('submit', { cancelable: true })
  harness.emailForm.dispatchEvent(requestSubmit)
  harness.codeForm.dispatchEvent(verifySubmit)

  assert.equal(requestSubmit.defaultPrevented, true)
  assert.equal(verifySubmit.defaultPrevented, true)
  assert.deepEqual(calls, [
    ['request', 'latest@example.com'],
    ['verify', '654321']
  ])
})

test('onboarding Account actions tolerate absent optional controls', () => {
  const root = { querySelector() { return null } }
  assert.equal(bindOnboardingAccountActions(root, {
    requestEmailCode() {},
    verifyEmailCode() {}
  }), 0)
})

test('onboarding Account actions reject invalid boundaries', () => {
  const validActions = {
    requestEmailCode() {},
    verifyEmailCode() {}
  }
  assert.throws(
    () => bindOnboardingAccountActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindOnboardingAccountActions({ querySelector() {} }, {}),
    /email callbacks/
  )
})
