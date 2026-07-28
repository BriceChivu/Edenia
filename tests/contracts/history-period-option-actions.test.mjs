import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindStudyHistoryPeriodOptionActions
} from '../../src/features/study-history/period-option-actions.js'

const rootSelectors = [
  '#historyWeekPeriodPopover',
  '#historyMonthPeriodPopover'
]
const optionSelector = '[data-history-period-action="select"]'

function createPopover() {
  return {
    listener: null,
    addEventListener(type, listener) {
      assert.equal(type, 'click')
      this.listener = listener
    },
    contains(control) {
      return control?.owner === this
    },
    click(target) {
      let defaultPrevented = false
      let propagationStopped = false
      this.listener?.({
        target,
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

function createHarness(includedSelectors = rootSelectors) {
  const popovers = new Map(
    includedSelectors.map(selector => [selector, createPopover()])
  )
  return {
    popovers,
    root: {
      querySelector(selector) {
        return popovers.get(selector) || null
      }
    }
  }
}

function createTarget(control) {
  return {
    closest(selector) {
      assert.equal(selector, optionSelector)
      return control
    }
  }
}

test('Study History period binding delegates both live range and key values', () => {
  const { popovers, root } = createHarness()
  const calls = []
  assert.equal(bindStudyHistoryPeriodOptionActions(root, {
    selectPeriod(...args) {
      calls.push(args)
    }
  }), 2)

  const weekPopover = popovers.get(rootSelectors[0])
  const weekControl = {
    owner: weekPopover,
    dataset: {
      historyRange: 'week',
      historyPeriodKey: '2026-07-20'
    }
  }
  assert.deepEqual(weekPopover.click(createTarget(weekControl)), {
    defaultPrevented: false,
    propagationStopped: false
  })

  const monthPopover = popovers.get(rootSelectors[1])
  const monthControl = {
    owner: monthPopover,
    dataset: {
      historyRange: 'month',
      historyPeriodKey: '2026-06'
    }
  }
  monthPopover.click(createTarget(monthControl))
  assert.deepEqual(calls, [
    ['week', '2026-07-20'],
    ['month', '2026-06']
  ])
})

test('Study History period binding ignores foreign and unmatched controls', () => {
  const { popovers, root } = createHarness()
  const calls = []
  bindStudyHistoryPeriodOptionActions(root, {
    selectPeriod(...args) {
      calls.push(args)
    }
  })
  const weekPopover = popovers.get(rootSelectors[0])
  weekPopover.click(createTarget(null))
  weekPopover.click(createTarget({
    owner: popovers.get(rootSelectors[1]),
    dataset: {
      historyRange: 'month',
      historyPeriodKey: '2026-06'
    }
  }))
  assert.deepEqual(calls, [])
})

test('Study History period binding is idempotent and tolerates missing roots', () => {
  const { popovers, root } = createHarness([rootSelectors[0]])
  const calls = []
  const actions = {
    selectPeriod(...args) {
      calls.push(args)
    }
  }
  assert.equal(bindStudyHistoryPeriodOptionActions(root, actions), 1)
  assert.equal(bindStudyHistoryPeriodOptionActions(root, actions), 0)
  const weekPopover = popovers.get(rootSelectors[0])
  weekPopover.click(createTarget({
    owner: weekPopover,
    dataset: {
      historyRange: 'week',
      historyPeriodKey: '2026-07-20'
    }
  }))
  assert.deepEqual(calls, [['week', '2026-07-20']])
  assert.equal(
    bindStudyHistoryPeriodOptionActions(createHarness([]).root, actions),
    0
  )
})

test('Study History period binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindStudyHistoryPeriodOptionActions(null, {
      selectPeriod() {}
    }),
    /queryable root/
  )
  assert.throws(
    () => bindStudyHistoryPeriodOptionActions(root, {}),
    /selectPeriod callback/
  )
})
