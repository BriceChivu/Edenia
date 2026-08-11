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
  const enabled = control({ checked: true })
  const time = control({ value: '08:15' })
  const timezone = control({ value: 'Asia/Taipei' })
  const consent = control({ checked: true })
  const days = [control({ value: '1' }), control({ value: '4' })]
  const form = control({
    querySelector(selector) {
      return new Map([
        ['#reminderEnabled', enabled],
        ['#reminderLocalTime', time],
        ['#reminderTimezone', timezone],
        ['#reminderConsent', consent]
      ]).get(selector) || null
    },
    querySelectorAll() { return days }
  })
  const cancel = control()
  const retry = control()
  const root = {
    querySelector(selector) {
      return new Map([
        ['[data-reminder-action="form"]', form],
        ['[data-reminder-action="cancel"]', cancel],
        ['[data-reminder-action="retry"]', retry]
      ]).get(selector) || null
    }
  }
  return { cancel, form, retry, root }
}

test('reminder form returns schedule and explicit consent only', () => {
  const { form } = createHarness()
  assert.deepEqual(readReminderPreferenceForm(form), {
    enabled: true,
    days: [1, 4],
    localTime: '08:15',
    timezone: 'Asia/Taipei',
    consent: true
  })
})

test('reminder controls bind save, validation, cancel, and retry idempotently', () => {
  const { cancel, form, retry, root } = createHarness()
  const calls = []
  const actions = {
    save: input => calls.push(['save', input]),
    validate: input => calls.push(['validate', input]),
    cancel: () => calls.push(['cancel']),
    retry: () => calls.push(['retry'])
  }
  assert.equal(bindReminderPreferenceActions(root, actions), 3)
  assert.equal(bindReminderPreferenceActions(root, actions), 0)

  let prevented = false
  form.dispatch('submit', { preventDefault() { prevented = true } })
  form.dispatch('change')
  cancel.dispatch('click')
  retry.dispatch('click')

  assert.equal(prevented, true)
  assert.deepEqual(calls.map(call => call[0]), ['save', 'validate', 'cancel', 'retry'])
  assert.throws(
    () => bindReminderPreferenceActions(null, actions),
    /queryable root/
  )
})
