import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindSettingsReplayActions
} from '../../src/features/settings/replay-actions.js'

const selectors = [
  '.walkthrough-replay-btn[data-settings-replay-action="walkthrough"]',
  '.walkthrough-replay-btn[data-settings-replay-action="trailer"]'
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

test('Settings replay binding preserves exact zero-argument uncancelled calls', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindSettingsReplayActions(root, {
    walkthrough(...args) {
      calls.push(['walkthrough', args])
    },
    trailer(...args) {
      calls.push(['trailer', args])
    }
  }), 2)

  selectors.forEach(selector => {
    const event = new Event('click', { cancelable: true })
    assert.equal(controls.get(selector).dispatchEvent(event), true)
    assert.equal(event.defaultPrevented, false)
  })
  assert.deepEqual(calls, [
    ['walkthrough', []],
    ['trailer', []]
  ])
})

test('Settings replay binding is idempotent and tolerates absent controls', () => {
  const { controls, root } = createHarness([selectors[0]])
  const calls = []
  const actions = {
    walkthrough() {
      calls.push('walkthrough')
    },
    trailer() {
      calls.push('trailer')
    }
  }
  assert.equal(bindSettingsReplayActions(root, actions), 1)
  assert.equal(bindSettingsReplayActions(root, actions), 0)
  controls.get(selectors[0]).dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['walkthrough'])
  assert.equal(bindSettingsReplayActions(createHarness([]).root, actions), 0)
})

test('Settings replay binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindSettingsReplayActions(null, {
      walkthrough() {},
      trailer() {}
    }),
    /queryable root/
  )
  assert.throws(
    () => bindSettingsReplayActions(root, { walkthrough() {} }),
    /walkthrough and trailer callbacks/
  )
})
