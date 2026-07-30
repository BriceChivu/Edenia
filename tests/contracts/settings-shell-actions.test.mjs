import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindSettingsShellActions
} from '../../src/features/settings/shell-actions.js'

const selectors = [
  '.gear-btn[data-settings-shell-action="open"]',
  '.settings-overlay[data-settings-shell-action="close"]',
  '#settingsCloseBtn[data-settings-shell-action="close"]'
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

test('Settings shell binding preserves exact zero-argument uncancelled calls', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindSettingsShellActions(root, {
    open(...args) {
      calls.push(['open', args])
    },
    close(...args) {
      calls.push(['close', args])
    }
  }), 3)

  selectors.forEach(selector => {
    const event = new Event('click', { cancelable: true })
    assert.equal(controls.get(selector).dispatchEvent(event), true)
    assert.equal(event.defaultPrevented, false)
  })
  assert.deepEqual(calls, [
    ['open', []],
    ['close', []],
    ['close', []]
  ])
})

test('Settings shell binding is idempotent and tolerates absent controls', () => {
  const { controls, root } = createHarness([selectors[0]])
  const calls = []
  const actions = {
    open() {
      calls.push('open')
    },
    close() {
      calls.push('close')
    }
  }
  assert.equal(bindSettingsShellActions(root, actions), 1)
  assert.equal(bindSettingsShellActions(root, actions), 0)
  controls.get(selectors[0]).dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['open'])
  assert.equal(bindSettingsShellActions(createHarness([]).root, actions), 0)
})

test('Settings shell binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindSettingsShellActions(null, { open() {}, close() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindSettingsShellActions(root, { open() {} }),
    /open and close callbacks/
  )
})
