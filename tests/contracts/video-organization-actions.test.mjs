import assert from 'node:assert/strict'
import test from 'node:test'
import { bindVideoOrganizationActions } from '../../src/features/videos/organization-actions.js'

function createRoot() {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    contains() {
      return true
    },
    click(control) {
      const event = {
        target: { closest: () => control },
        preventDefaultCalled: false,
        stopPropagationCalled: false,
        preventDefault() { this.preventDefaultCalled = true },
        stopPropagation() { this.stopPropagationCalled = true }
      }
      listeners.get('click')(event)
      return event
    }
  }
}

function createActions(calls) {
  return {
    openMenu: (...args) => calls.push(['openMenu', ...args]),
    removeFromContinueWatching: (...args) => calls.push(['removeFromContinueWatching', ...args]),
    removeFromFeed: (...args) => calls.push(['removeFromFeed', ...args]),
    restoreToFeed: (...args) => calls.push(['restoreToFeed', ...args]),
    toggleRemovedSection: (...args) => calls.push(['toggleRemovedSection', ...args])
  }
}

test('video organization actions delegate every supported control once', () => {
  const root = createRoot()
  const calls = []
  const actions = createActions(calls)
  assert.equal(bindVideoOrganizationActions(root, actions), 1)
  assert.equal(bindVideoOrganizationActions(root, actions), 0)

  const cases = [
    ['menu', 'openMenu'],
    ['remove-continue', 'removeFromContinueWatching'],
    ['remove-feed', 'removeFromFeed'],
    ['restore-feed', 'restoreToFeed'],
    ['toggle-removed', 'toggleRemovedSection']
  ]
  cases.forEach(([actionName, callbackName]) => {
    const control = {
      dataset: { videoOrganizationAction: actionName, videoId: 'video-1' }
    }
    const event = root.click(control)
    assert.equal(event.preventDefaultCalled, true)
    assert.equal(event.stopPropagationCalled, true)
    assert.equal(calls.at(-1)[0], callbackName)
  })
})

test('video organization actions reject incomplete ownership contracts', () => {
  assert.throws(() => bindVideoOrganizationActions(null, {}), TypeError)
  assert.throws(() => bindVideoOrganizationActions(createRoot(), {}), TypeError)
})
