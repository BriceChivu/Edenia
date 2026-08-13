import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindSettingsAccordionActions
} from '../../src/features/settings/accordion-actions.js'

function createHarness(selectors = [
  '.settings-account-toggle',
  '.settings-howto-toggle',
  '.activity-log-toggle',
  '.backup-toggle'
]) {
  const controls = new Map(selectors.map(selector => [selector, new EventTarget()]))
  const root = {
    querySelector(selector) {
      return controls.get(selector) || null
    }
  }
  return { controls, root }
}

test('Settings accordion binding calls each exact toggle once', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindSettingsAccordionActions(root, {
    toggleAccount() {
      calls.push('account')
    },
    toggleHowTo() {
      calls.push('how-to')
    },
    toggleActivityLog() {
      calls.push('activity-log')
    },
    toggleBackups() {
      calls.push('backups')
    }
  }), 4)

  controls.get('.settings-account-toggle').dispatchEvent(new Event('click'))
  controls.get('.settings-howto-toggle').dispatchEvent(new Event('click'))
  controls.get('.activity-log-toggle').dispatchEvent(new Event('click'))
  controls.get('.backup-toggle').dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['account', 'how-to', 'activity-log', 'backups'])
})

test('Settings accordion binding is idempotent and tolerates absent controls', () => {
  const { controls, root } = createHarness(['.settings-howto-toggle'])
  const calls = []
  const actions = {
    toggleAccount() {
      calls.push('account')
    },
    toggleHowTo() {
      calls.push('how-to')
    },
    toggleActivityLog() {
      calls.push('activity-log')
    },
    toggleBackups() {
      calls.push('backups')
    }
  }
  assert.equal(bindSettingsAccordionActions(root, actions), 1)
  assert.equal(bindSettingsAccordionActions(root, actions), 0)
  controls.get('.settings-howto-toggle').dispatchEvent(new Event('click'))
  assert.deepEqual(calls, ['how-to'])
})

test('Settings accordion binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindSettingsAccordionActions(null, {
      toggleAccount() {},
      toggleHowTo() {},
      toggleActivityLog() {},
      toggleBackups() {}
    }),
    /queryable root/
  )
  assert.throws(
    () => bindSettingsAccordionActions(root, {
      toggleAccount() {},
      toggleHowTo() {},
      toggleActivityLog() {}
    }),
    /all toggle callbacks/
  )
})
