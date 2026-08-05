import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindSettingsPreferenceActions
} from '../../src/features/settings/preference-actions.js'

const selectors = [
  '#settingsIncludeShorts[data-settings-preference-action="save"]',
  '#settingsAnkiEnabled[data-settings-preference-action="save"]'
]

function createControl() {
  return {
    listener: null,
    addEventListener(type, listener) {
      assert.equal(type, 'change')
      this.listener = listener
    },
    change() {
      let defaultPrevented = false
      let propagationStopped = false
      this.listener?.({
        preventDefault() {
          defaultPrevented = true
        },
        stopPropagation() {
          propagationStopped = true
        }
      })
      return { defaultPrevented, propagationStopped }
    }
  }
}

function createHarness(includedSelectors = selectors) {
  const controls = new Map(
    includedSelectors.map(selector => [selector, createControl()])
  )
  return {
    controls,
    root: {
      querySelector(selector) {
        return controls.get(selector) || null
      }
    }
  }
}

test('Settings preference bindings call one shared save with zero arguments', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindSettingsPreferenceActions(root, {
    save(...args) {
      calls.push(args)
    }
  }), 2)

  const eventStates = selectors.map(selector => (
    controls.get(selector).change()
  ))
  assert.deepEqual(calls, [[], []])
  assert.deepEqual(eventStates, [
    { defaultPrevented: false, propagationStopped: false },
    { defaultPrevented: false, propagationStopped: false }
  ])
})

test('Settings preference bindings are idempotent and tolerate missing controls', () => {
  const { controls, root } = createHarness(selectors.slice(0, 2))
  let calls = 0
  const actions = {
    save() {
      calls += 1
    }
  }
  assert.equal(bindSettingsPreferenceActions(root, actions), 2)
  assert.equal(bindSettingsPreferenceActions(root, actions), 0)
  controls.get(selectors[0]).change()
  controls.get(selectors[1]).change()
  assert.equal(calls, 2)
  assert.equal(
    bindSettingsPreferenceActions(createHarness([]).root, actions),
    0
  )
})

test('Settings preference bindings fail closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindSettingsPreferenceActions(null, { save() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindSettingsPreferenceActions(root, {}),
    /save callback/
  )
})
