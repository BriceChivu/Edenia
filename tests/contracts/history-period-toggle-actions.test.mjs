import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindStudyHistoryPeriodToggleActions
} from '../../src/features/study-history/period-toggle-actions.js'

const selectors = {
  week: '[data-history-period-action="toggle"][data-history-range="week"]',
  month: '[data-history-period-action="toggle"][data-history-range="month"]'
}

function createControl() {
  return {
    listener: null,
    addEventListener(type, listener) {
      assert.equal(type, 'click')
      this.listener = listener
    },
    click() {
      let defaultPrevented = false
      let propagationStopped = false
      const event = {
        currentTarget: this,
        preventDefault() {
          defaultPrevented = true
        },
        stopPropagation() {
          propagationStopped = true
        }
      }
      this.listener?.(event)
      return { defaultPrevented, event, propagationStopped }
    }
  }
}

function createHarness(includedSelectors = Object.values(selectors)) {
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

test('Study History period toggles preserve the native event and literal range', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindStudyHistoryPeriodToggleActions(root, {
    toggle(event, range) {
      calls.push({
        currentTarget: event.currentTarget,
        event,
        range
      })
    }
  }), 2)

  const weekResult = controls.get(selectors.week).click()
  const monthResult = controls.get(selectors.month).click()
  assert.deepEqual(
    calls.map(call => ({
      currentTarget: call.currentTarget,
      event: call.event,
      range: call.range
    })),
    [
      {
        currentTarget: controls.get(selectors.week),
        event: weekResult.event,
        range: 'week'
      },
      {
        currentTarget: controls.get(selectors.month),
        event: monthResult.event,
        range: 'month'
      }
    ]
  )
  assert.deepEqual(
    [weekResult, monthResult].map(result => ({
      defaultPrevented: result.defaultPrevented,
      propagationStopped: result.propagationStopped
    })),
    [
      { defaultPrevented: false, propagationStopped: false },
      { defaultPrevented: false, propagationStopped: false }
    ]
  )
})

test('Study History period toggle binding is idempotent and tolerates absent controls', () => {
  const { controls, root } = createHarness([selectors.week])
  const calls = []
  const actions = {
    toggle(event, range) {
      calls.push([event.currentTarget, range])
    }
  }
  assert.equal(bindStudyHistoryPeriodToggleActions(root, actions), 1)
  assert.equal(bindStudyHistoryPeriodToggleActions(root, actions), 0)
  controls.get(selectors.week).click()
  assert.deepEqual(calls, [[controls.get(selectors.week), 'week']])
  assert.equal(
    bindStudyHistoryPeriodToggleActions(createHarness([]).root, actions),
    0
  )
})

test('Study History period toggle binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindStudyHistoryPeriodToggleActions(null, { toggle() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindStudyHistoryPeriodToggleActions(root, {}),
    /toggle callback/
  )
})
