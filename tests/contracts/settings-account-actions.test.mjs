import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindSettingsAccountActions
} from '../../src/features/settings/account-actions.js'

const selectors = {
  form: '[data-account-action="email-form"]',
  email: '#accountEmail',
  codeForm: '[data-account-action="code-form"]',
  code: '#accountEmailCode',
  signOut: '[data-account-action="sign-out"]',
  signOutEverywhere: '[data-account-action="sign-out-everywhere"]',
  downloadAccount: '[data-account-action="download-account"]'
}

function createHarness(included = Object.keys(selectors)) {
  const controls = new Map(included.map(key => [selectors[key], {
    listeners: new Map(),
    value: key === 'email'
      ? 'learner@example.com'
      : key === 'code' ? '123456' : '',
    addEventListener(type, listener) {
      this.listeners.set(type, listener)
    },
    dispatch(type, event = {}) {
      this.listeners.get(type)?.(event)
    }
  }]))
  return {
    root: {
      querySelector(selector) {
        return controls.get(selector) || null
      }
    },
    controls
  }
}

function createActions(calls = []) {
  return {
    requestEmailCode(email) { calls.push(['request', email]) },
    verifyEmailCode(code) { calls.push(['verify', code]) },
    signOut() { calls.push(['sign-out']) },
    signOutEverywhere() { calls.push(['sign-out-everywhere']) },
    downloadAccount() { calls.push(['download-account']) }
  }
}

test('Account controls forward email request, verification, session, and export intent', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindSettingsAccountActions(root, createActions(calls)), 5)

  let prevented = false
  controls.get(selectors.form).dispatch('submit', {
    preventDefault() { prevented = true }
  })
  controls.get(selectors.codeForm).dispatch('submit', {
    preventDefault() { prevented = true }
  })
  controls.get(selectors.signOut).dispatch('click')
  controls.get(selectors.signOutEverywhere).dispatch('click')
  controls.get(selectors.downloadAccount).dispatch('click')

  assert.equal(prevented, true)
  assert.deepEqual(calls, [
    ['request', 'learner@example.com'],
    ['verify', '123456'],
    ['sign-out'],
    ['sign-out-everywhere'],
    ['download-account']
  ])
})

test('Account binding is idempotent, optional, and boundary checked', () => {
  const { root } = createHarness()
  const actions = createActions()
  assert.equal(bindSettingsAccountActions(root, actions), 5)
  assert.equal(bindSettingsAccountActions(root, actions), 0)
  assert.equal(bindSettingsAccountActions(createHarness([]).root, actions), 0)
  assert.throws(
    () => bindSettingsAccountActions(null, actions),
    /queryable root/
  )
  assert.throws(
    () => bindSettingsAccountActions(root, { signOut() {} }),
    /sign-in, export, and sign-out callbacks/
  )
})
