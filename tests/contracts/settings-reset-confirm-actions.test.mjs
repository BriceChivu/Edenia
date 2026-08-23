import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindSettingsResetConfirmActions
} from '../../src/features/settings/reset-confirm-actions.js'

const selectors = [
  '[data-settings-reset-confirm-action="show"]',
  '[data-settings-reset-confirm-action="hide"]',
  '[data-settings-reset-confirm-action="confirm"]',
  '[data-settings-reset-confirm-action="undo"]'
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

test('Settings reset-confirm binding calls exact zero-argument actions', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindSettingsResetConfirmActions(root, {
    show(...args) {
      calls.push(['show', args])
    },
    hide(...args) {
      calls.push(['hide', args])
    },
    confirm(...args) {
      calls.push(['confirm', args])
    },
    undo(...args) {
      calls.push(['undo', args])
    }
  }), 4)

  selectors.forEach(selector => {
    const event = new Event('click', { cancelable: true })
    assert.equal(controls.get(selector).dispatchEvent(event), true)
    assert.equal(event.defaultPrevented, false)
  })
  assert.deepEqual(calls, [
    ['show', []],
    ['hide', []],
    ['confirm', []],
    ['undo', []]
  ])
})

test('Settings reset-confirm binding is idempotent and tolerates absent controls', () => {
  const { controls, root } = createHarness([selectors[0]])
  const calls = []
  const actions = {
    show() {
      calls.push('show')
    },
    hide() {
      calls.push('hide')
    },
    confirm() {
      calls.push('confirm')
    },
    undo() {
      calls.push('undo')
    }
  }
  assert.equal(bindSettingsResetConfirmActions(root, actions), 1)
  assert.equal(bindSettingsResetConfirmActions(root, actions), 0)
  controls.get(selectors[0]).dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['show'])
  assert.equal(bindSettingsResetConfirmActions(createHarness([]).root, actions), 0)
})

test('Settings reset-confirm binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindSettingsResetConfirmActions(null, {
      show() {},
      hide() {},
      confirm() {},
      undo() {}
    }),
    /queryable root/
  )
  assert.throws(
    () => bindSettingsResetConfirmActions(root, { show() {} }),
    /show, hide, confirm, and undo callbacks/
  )
})
