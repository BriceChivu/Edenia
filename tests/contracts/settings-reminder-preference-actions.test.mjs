import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindReminderPreferenceActions,
  readReminderPreferenceForm
} from '../../src/features/settings/reminder-preference-actions.js'

function control(extra = {}) {
  return {
    listeners: new Map(),
    addEventListener(type, listener) { this.listeners.set(type, listener) },
    dispatch(type, event = {}) { this.listeners.get(type)?.(event) },
    ...extra
  }
}

function createHarness() {
  const streak = control({ checked: true })
  const discovery = control({ checked: false })
  const form = control({
    querySelector(selector) {
      return new Map([
        ['#streakRemindersEnabled', streak],
        ['#discoveryEmailsEnabled', discovery]
      ]).get(selector) || null
    }
  })
  const retry = control()
  const root = {
    querySelector(selector) {
      return new Map([
        ['[data-reminder-action="form"]', form],
        ['[data-reminder-action="retry"]', retry]
      ]).get(selector) || null
    }
  }
  return { form, retry, root }
}

test('email preference form returns only the two email choices', () => {
  const { form } = createHarness()
  assert.deepEqual(readReminderPreferenceForm(form), {
    streakRemindersEnabled: true,
    discoveryEmailsEnabled: false
  })
})

test('email choices save on change and retry binding is idempotent', () => {
  const { form, retry, root } = createHarness()
  const calls = []
  const actions = {
    save: input => calls.push(['save', input]),
    retry: () => calls.push(['retry'])
  }
  assert.equal(bindReminderPreferenceActions(root, actions), 2)
  assert.equal(bindReminderPreferenceActions(root, actions), 0)

  form.dispatch('change')
  retry.dispatch('click')

  assert.deepEqual(calls.map(call => call[0]), ['save', 'retry'])
  assert.throws(
    () => bindReminderPreferenceActions(null, actions),
    /queryable root/
  )
})
