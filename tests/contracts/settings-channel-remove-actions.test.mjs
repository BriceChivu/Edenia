import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindSettingsChannelRemoveActions
} from '../../src/features/settings/channel-remove-actions.js'

function createControl(channelId) {
  const control = new EventTarget()
  control.dataset = { channelId }
  return control
}

function createHarness(initialControls = []) {
  let controls = initialControls
  return {
    root: {
      querySelectorAll(selector) {
        assert.equal(
          selector,
          '[data-settings-channel-action="remove"]'
        )
        return controls
      }
    },
    replaceControls(nextControls) {
      controls = nextControls
    }
  }
}

test('Settings channel removal reads each live ID without forwarding events', () => {
  const first = createControl('first')
  const second = createControl('second')
  const { root } = createHarness([first, second])
  const calls = []
  assert.equal(bindSettingsChannelRemoveActions(root, {
    remove(...args) {
      calls.push(args)
    }
  }), 2)

  first.dataset.channelId = 'first-live'
  const firstEvent = new Event('click', { cancelable: true })
  const secondEvent = new Event('click', { cancelable: true })
  assert.equal(first.dispatchEvent(firstEvent), true)
  assert.equal(second.dispatchEvent(secondEvent), true)
  assert.deepEqual(calls, [['first-live'], ['second']])
  assert.equal(firstEvent.defaultPrevented, false)
  assert.equal(secondEvent.defaultPrevented, false)
})

test('Settings channel removal is idempotent and binds replacements', () => {
  const original = createControl('original')
  const replacement = createControl('replacement')
  const harness = createHarness([original])
  const calls = []
  const actions = {
    remove(channelId) {
      calls.push(channelId)
    }
  }

  assert.equal(bindSettingsChannelRemoveActions(harness.root, actions), 1)
  assert.equal(bindSettingsChannelRemoveActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('click'))

  harness.replaceControls([replacement])
  assert.equal(bindSettingsChannelRemoveActions(harness.root, actions), 1)
  replacement.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['original', 'replacement'])

  harness.replaceControls([])
  assert.equal(bindSettingsChannelRemoveActions(harness.root, actions), 0)
})

test('Settings channel removal fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindSettingsChannelRemoveActions(null, { remove() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindSettingsChannelRemoveActions(root, {}),
    /remove callback/
  )
})
