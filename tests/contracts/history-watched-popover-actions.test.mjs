import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindStudyHistoryWatchedPopoverActions
} from '../../src/features/study-history/watched-popover-actions.js'

const cellSelector = '[data-history-watched-popover-action="toggle"]'
const eventTypes = [
  'mouseenter',
  'mouseleave',
  'focusin',
  'focusout',
  'click'
]

function createCell() {
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

function createHarness(cells = [createCell(), createCell()]) {
  return {
    cells,
    root: {
      querySelectorAll(selector) {
        assert.equal(selector, cellSelector)
        return cells
      }
    }
  }
}

test('watched popover binding preserves exact direct events and arguments', () => {
  const { cells, root } = createHarness([createCell()])
  const calls = []
  assert.equal(bindStudyHistoryWatchedPopoverActions(root, {
    open(event) {
      calls.push(['open', event])
    },
    closeSoon(...args) {
      calls.push(['closeSoon', ...args])
    },
    toggle(event) {
      calls.push(['toggle', event])
    }
  }), 1)
  assert.deepEqual([...cells[0].listeners.keys()], eventTypes)

  const results = eventTypes.map(type => cells[0].fire(type))
  assert.deepEqual(calls, [
    ['open', results[0].event],
    ['closeSoon'],
    ['open', results[2].event],
    ['closeSoon'],
    ['toggle', results[4].event]
  ])
  assert.equal(results[0].event.currentTarget, cells[0])
  assert.equal(results[2].event.currentTarget, cells[0])
  assert.equal(results[4].event.currentTarget, cells[0])
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

test('watched popover binding is idempotent and binds replacement cells', () => {
  const firstCell = createCell()
  const { root } = createHarness([firstCell])
  const calls = []
  const actions = {
    open() {
      calls.push('open')
    },
    closeSoon() {
      calls.push('closeSoon')
    },
    toggle() {
      calls.push('toggle')
    }
  }
  assert.equal(bindStudyHistoryWatchedPopoverActions(root, actions), 1)
  assert.equal(bindStudyHistoryWatchedPopoverActions(root, actions), 0)
  firstCell.fire('click')

  const replacementCell = createCell()
  const replacement = createHarness([replacementCell])
  assert.equal(
    bindStudyHistoryWatchedPopoverActions(replacement.root, actions),
    1
  )
  replacementCell.fire('mouseenter')
  assert.deepEqual(calls, ['toggle', 'open'])
  assert.equal(
    bindStudyHistoryWatchedPopoverActions(createHarness([]).root, actions),
    0
  )
})

test('watched popover binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const actions = {
    open() {},
    closeSoon() {},
    toggle() {}
  }
  assert.throws(
    () => bindStudyHistoryWatchedPopoverActions(null, actions),
    /queryable root/
  )
  assert.throws(
    () => bindStudyHistoryWatchedPopoverActions(root, {
      open() {},
      closeSoon() {}
    }),
    /open, closeSoon, and toggle callbacks/
  )
})
