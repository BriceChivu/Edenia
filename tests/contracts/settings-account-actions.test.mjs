import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindSettingsAccountActions
} from '../../src/features/settings/account-actions.js'

const selectors = {
  google: '[data-account-action="google"]',
  form: '[data-account-action="email-form"]',
  email: '#accountEmail',
  signOut: '[data-account-action="sign-out"]',
  downloadAccount: '[data-account-action="download-account"]',
  refreshPlus: '[data-account-action="refresh-plus"]',
  billing: '[data-account-action="billing"]',
  explorePlus: '[data-account-action="explore-plus"]'
}

function createHarness(included = Object.keys(selectors)) {
  const controls = new Map(included.map(key => [selectors[key], {
    listeners: new Map(),
    value: key === 'email' ? 'learner@example.com' : '',
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
    signInWithGoogle() { calls.push(['google']) },
    sendMagicLink(email) { calls.push(['email', email]) },
    signOut() { calls.push(['sign-out']) },
    downloadAccount() { calls.push(['download-account']) },
    refreshPlus() { calls.push(['refresh-plus']) },
    manageBilling() { calls.push(['billing']) },
    explorePlus() { calls.push(['explore-plus']) }
  }
}

test('Account controls forward provider, email, session, and Plus intent', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindSettingsAccountActions(root, createActions(calls)), 7)

  controls.get(selectors.google).dispatch('click')
  let prevented = false
  controls.get(selectors.form).dispatch('submit', {
    preventDefault() { prevented = true }
  })
  controls.get(selectors.signOut).dispatch('click')
  controls.get(selectors.downloadAccount).dispatch('click')
  controls.get(selectors.refreshPlus).dispatch('click')
  controls.get(selectors.billing).dispatch('click')
  controls.get(selectors.explorePlus).dispatch('click')

  assert.equal(prevented, true)
  assert.deepEqual(calls, [
    ['google'],
    ['email', 'learner@example.com'],
    ['sign-out'],
    ['download-account'],
    ['refresh-plus'],
    ['billing'],
    ['explore-plus']
  ])
})

test('Account binding is idempotent, optional, and boundary checked', () => {
  const { root } = createHarness()
  const actions = createActions()
  assert.equal(bindSettingsAccountActions(root, actions), 7)
  assert.equal(bindSettingsAccountActions(root, actions), 0)
  assert.equal(bindSettingsAccountActions(createHarness([]).root, actions), 0)
  assert.throws(
    () => bindSettingsAccountActions(null, actions),
    /queryable root/
  )
  assert.throws(
    () => bindSettingsAccountActions(root, { signOut() {} }),
    /sign-in, export, sign-out, and Plus callbacks/
  )
})
