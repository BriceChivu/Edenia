import assert from 'node:assert/strict'
import test from 'node:test'
import { bindPlusUpgradeActions } from '../../src/features/plus/upgrade-actions.js'

function harness() {
  const listeners = new Map()
  const email = { value: 'learner@example.com' }
  const root = {
    addEventListener(type, listener) { listeners.set(type, listener) },
    querySelector(selector) { return selector === '[data-plus-email]' ? email : null },
    contains() { return true },
    getAttribute() { return null }
  }
  const calls = []
  const actions = Object.fromEntries([
    'close', 'selectPlan', 'startCheckout', 'startUpgradeSignIn', 'restore',
    'refresh', 'openBillingPortal', 'signOut'
  ].map(name => [name, (...args) => calls.push([name, ...args])]))
  return { actions, calls, listeners, root }
}

test('Plus upgrade actions delegate plan, checkout, account, and form intent', () => {
  const test = harness()
  assert.equal(bindPlusUpgradeActions(test.root, test.actions), true)
  const click = test.listeners.get('click')
  for (const [action, planId] of [
    ['select-plan', 'monthly'], ['checkout'], ['restore'], ['refresh'],
    ['billing-portal'], ['sign-out'], ['close']
  ]) {
    click({ target: { closest: () => ({
      dataset: { plusAction: action, planId }
    }) } })
  }
  let prevented = false
  test.listeners.get('submit')({
    preventDefault() { prevented = true },
    target: { closest: () => ({}) }
  })
  assert.equal(prevented, true)
  assert.deepEqual(test.calls, [
    ['selectPlan', 'monthly'], ['startCheckout'],
    ['restore', 'learner@example.com'], ['refresh'],
    ['openBillingPortal'], ['signOut'], ['close'],
    ['startUpgradeSignIn', 'learner@example.com']
  ])
  assert.equal(bindPlusUpgradeActions(test.root, test.actions), false)
})

test('Plus upgrade action binding validates its complete boundary', () => {
  const test = harness()
  assert.throws(() => bindPlusUpgradeActions(null, test.actions), /interactive root/)
  assert.throws(
    () => bindPlusUpgradeActions(test.root, { close() {} }),
    /require selectPlan/
  )
})
