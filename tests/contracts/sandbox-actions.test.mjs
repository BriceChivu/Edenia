import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindSandboxActions
} from '../../src/features/sandbox/actions.js'

const selectors = [
  '[data-sandbox-action="add-day"]',
  '[data-sandbox-action="reset"]'
]

function createHarness(includedSelectors = selectors) {
  const controls = new Map(
    includedSelectors.map(selector => [selector, new EventTarget()])
  )
  const root = {
    querySelector(selector) {
      return controls.get(selector) || null
    }
  }
  return { controls, root }
}

test('sandbox binding calls each fixed callback once without forwarding events', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindSandboxActions(root, {
    addDay(...args) {
      calls.push(['add-day', args])
    },
    reset(...args) {
      calls.push(['reset', args])
    }
  }), 2)

  selectors.forEach(selector => {
    const event = new Event('click', { cancelable: true })
    assert.equal(controls.get(selector).dispatchEvent(event), true)
    assert.equal(event.defaultPrevented, false)
  })
  assert.deepEqual(calls, [
    ['add-day', []],
    ['reset', []]
  ])
})

test('sandbox binding is idempotent and tolerates absent controls', () => {
  const { controls, root } = createHarness([selectors[0]])
  const calls = []
  const actions = {
    addDay() {
      calls.push('add-day')
    },
    reset() {
      calls.push('reset')
    }
  }
  assert.equal(bindSandboxActions(root, actions), 1)
  assert.equal(bindSandboxActions(root, actions), 0)
  controls.get(selectors[0]).dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['add-day'])

  assert.equal(bindSandboxActions(createHarness([]).root, actions), 0)
})

test('sandbox binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindSandboxActions(null, { addDay() {}, reset() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindSandboxActions(root, { addDay() {} }),
    /addDay and reset callbacks/
  )
})
