import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindStudyHistoryHeatmapTooltipActions
} from '../../src/features/study-history/heatmap-tooltip-actions.js'

const daySelector = '[data-history-heatmap-action="tooltip"]'
const eventTypes = [
  'mouseenter',
  'mousemove',
  'mouseleave',
  'click',
  'focus',
  'blur'
]

function createDay() {
  return {
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener)
    },
    fire(type) {
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
      this.listeners.get(type)?.(event)
      return { defaultPrevented, event, propagationStopped }
    }
  }
}

function createHarness(days = [createDay(), createDay()]) {
  return {
    days,
    root: {
      querySelectorAll(selector) {
        assert.equal(selector, daySelector)
        return days
      }
    }
  }
}

test('heatmap tooltip binding preserves exact direct events and arguments', () => {
  const { days, root } = createHarness([createDay()])
  const calls = []
  assert.equal(bindStudyHistoryHeatmapTooltipActions(root, {
    show(event) {
      calls.push(['show', event])
    },
    position(target) {
      calls.push(['position', target])
    },
    hide(...args) {
      calls.push(['hide', ...args])
    },
    toggle(event) {
      calls.push(['toggle', event])
    }
  }), 1)
  assert.deepEqual([...days[0].listeners.keys()], eventTypes)

  const results = eventTypes.map(type => days[0].fire(type))
  assert.deepEqual(calls, [
    ['show', results[0].event],
    ['position', days[0]],
    ['hide'],
    ['toggle', results[3].event],
    ['show', results[4].event],
    ['hide']
  ])
  assert.equal(results[0].event.currentTarget, days[0])
  assert.equal(results[3].event.currentTarget, days[0])
  assert.equal(results[4].event.currentTarget, days[0])
  assert.deepEqual(
    results.map(result => ({
      defaultPrevented: result.defaultPrevented,
      propagationStopped: result.propagationStopped
    })),
    eventTypes.map(() => ({
      defaultPrevented: false,
      propagationStopped: false
    }))
  )
})

test('heatmap tooltip binding is idempotent and binds replacement days', () => {
  const firstDay = createDay()
  const { root } = createHarness([firstDay])
  const calls = []
  const actions = {
    show() {
      calls.push('show')
    },
    position() {
      calls.push('position')
    },
    hide() {
      calls.push('hide')
    },
    toggle() {
      calls.push('toggle')
    }
  }
  assert.equal(bindStudyHistoryHeatmapTooltipActions(root, actions), 1)
  assert.equal(bindStudyHistoryHeatmapTooltipActions(root, actions), 0)
  firstDay.fire('click')

  const replacementDay = createDay()
  const replacement = createHarness([replacementDay])
  assert.equal(
    bindStudyHistoryHeatmapTooltipActions(replacement.root, actions),
    1
  )
  replacementDay.fire('focus')
  assert.deepEqual(calls, ['toggle', 'show'])
  assert.equal(
    bindStudyHistoryHeatmapTooltipActions(createHarness([]).root, actions),
    0
  )
})

test('heatmap tooltip binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const actions = {
    show() {},
    position() {},
    hide() {},
    toggle() {}
  }
  assert.throws(
    () => bindStudyHistoryHeatmapTooltipActions(null, actions),
    /queryable root/
  )
  assert.throws(
    () => bindStudyHistoryHeatmapTooltipActions(root, {
      show() {},
      position() {},
      hide() {}
    }),
    /show, position, hide, and toggle callbacks/
  )
})
