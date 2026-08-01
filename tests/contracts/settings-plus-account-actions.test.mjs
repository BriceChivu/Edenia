import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindSettingsPlusAccountActions
} from '../../src/features/settings/plus-account-actions.js'

const selectors = {
  form: '[data-plus-account-action="restore-form"]',
  email: '#plusAccountEmail',
  refresh: '[data-plus-account-action="refresh"]',
  billing: '[data-plus-account-action="billing"]',
  explore: '[data-plus-account-action="explore"]',
  signOut: '[data-plus-account-action="sign-out"]'
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
    controls,
    root: {
      querySelector(selector) {
        return controls.get(selector) || null
      }
    }
  }
}

test('Plus account controls forward restore, refresh, and sign-out intent', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindSettingsPlusAccountActions(root, {
    restore(email) {
      calls.push(['restore', email])
    },
    refresh() {
      calls.push(['refresh'])
    },
    manageBilling() {
      calls.push(['billing'])
    },
    explore() {
      calls.push(['explore'])
    },
    signOut() {
      calls.push(['sign-out'])
    }
  }), 5)

  let prevented = false
  controls.get(selectors.form).dispatch('submit', {
    preventDefault() {
      prevented = true
    }
  })
  controls.get(selectors.refresh).dispatch('click')
  controls.get(selectors.billing).dispatch('click')
  controls.get(selectors.explore).dispatch('click')
  controls.get(selectors.signOut).dispatch('click')
  assert.equal(prevented, true)
  assert.deepEqual(calls, [
    ['restore', 'learner@example.com'],
    ['refresh'],
    ['billing'],
    ['explore'],
    ['sign-out']
  ])
})

test('Plus account binding is idempotent and fails closed at its boundary', () => {
  const { root } = createHarness()
  const actions = {
    restore() {},
    refresh() {},
    manageBilling() {},
    explore() {},
    signOut() {}
  }
  assert.equal(bindSettingsPlusAccountActions(root, actions), 5)
  assert.equal(bindSettingsPlusAccountActions(root, actions), 0)
  assert.equal(
    bindSettingsPlusAccountActions(createHarness([]).root, actions),
    0
  )
  assert.throws(
    () => bindSettingsPlusAccountActions(null, actions),
    /queryable root/
  )
  assert.throws(
    () => bindSettingsPlusAccountActions(root, { restore() {} }),
    /restore, refresh, manageBilling, explore, and signOut callbacks/
  )
})
