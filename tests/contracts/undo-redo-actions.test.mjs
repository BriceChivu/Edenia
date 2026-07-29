import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindUndoRedoActions
} from '../../src/features/videos/undo-redo-actions.js'

function createControl(action, direction, index) {
  const control = new EventTarget()
  control.dataset = {
    undoRedoAction: action
  }
  if (direction !== undefined) control.dataset.undoRedoDirection = direction
  if (index !== undefined) control.dataset.undoRedoIndex = index
  return control
}

function createHarness(initialControls = []) {
  let controls = initialControls
  return {
    root: {
      querySelectorAll(selector) {
        assert.equal(selector, '[data-undo-redo-action]')
        return controls
      }
    },
    replaceControls(nextControls) {
      controls = nextControls
    }
  }
}

function createActions(calls) {
  return {
    toggle(...args) {
      calls.push(['toggle', args, args[0]?.currentTarget])
    },
    apply(...args) {
      calls.push(['apply', args])
    },
    close(...args) {
      calls.push(['close', args])
    },
    scroll(...args) {
      calls.push(['scroll', args, args[0]?.currentTarget])
    },
    stopScroll(...args) {
      calls.push(['stopScroll', args])
    }
  }
}

test('Undo and Redo binding preserves direct events and exact arguments', () => {
  const toggle = createControl('toggle', 'undo')
  const apply = createControl('apply', 'redo', '0')
  const close = createControl('close')
  const scroll = createControl('scroll')
  const { root } = createHarness([toggle, apply, close, scroll])
  const calls = []

  assert.equal(bindUndoRedoActions(root, createActions(calls)), 4)

  toggle.dataset.undoRedoDirection = 'redo'
  apply.dataset.undoRedoDirection = 'undo'
  const toggleEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const applyEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const closeEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const moveEvent = new Event('mousemove', {
    bubbles: true,
    cancelable: true
  })
  const leaveEvent = new Event('mouseleave', {
    bubbles: false,
    cancelable: true
  })

  assert.equal(toggle.dispatchEvent(toggleEvent), true)
  assert.equal(apply.dispatchEvent(applyEvent), true)
  assert.equal(close.dispatchEvent(closeEvent), true)
  assert.equal(scroll.dispatchEvent(moveEvent), true)
  assert.equal(scroll.dispatchEvent(leaveEvent), true)

  assert.deepEqual(calls, [
    ['toggle', [toggleEvent, 'redo'], toggle],
    ['apply', ['undo', 0]],
    ['close', [null, true]],
    ['scroll', [moveEvent], scroll],
    ['stopScroll', []]
  ])
  ;[
    toggleEvent,
    applyEvent,
    closeEvent,
    moveEvent,
    leaveEvent
  ].forEach(event => {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  })
})

test('Undo and Redo binding reads live indices and preserves Number conversion', () => {
  const apply = createControl('apply', 'undo', '5')
  const { root } = createHarness([apply])
  const calls = []
  assert.equal(bindUndoRedoActions(root, createActions(calls)), 1)

  apply.dataset.undoRedoDirection = 'redo'
  apply.dataset.undoRedoIndex = '0'
  apply.dispatchEvent(new Event('click'))
  apply.dataset.undoRedoIndex = 'malformed'
  apply.dispatchEvent(new Event('click'))

  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0], ['apply', ['redo', 0]])
  assert.equal(calls[1][0], 'apply')
  assert.equal(calls[1][1][0], 'redo')
  assert.equal(calls[1][1].length, 2)
  assert.equal(Number.isNaN(calls[1][1][1]), true)
})

test('Undo and Redo binding is idempotent and binds replacement controls', () => {
  const original = createControl('toggle', 'undo')
  const replacement = createControl('close')
  const harness = createHarness([original])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindUndoRedoActions(harness.root, actions), 1)
  assert.equal(bindUndoRedoActions(harness.root, actions), 0)
  const originalEvent = new Event('click')
  original.dispatchEvent(originalEvent)

  harness.replaceControls([replacement])
  assert.equal(bindUndoRedoActions(harness.root, actions), 1)
  replacement.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [
    ['toggle', [originalEvent, 'undo'], original],
    ['close', [null, true]]
  ])

  harness.replaceControls([])
  assert.equal(bindUndoRedoActions(harness.root, actions), 0)
})

test('Undo and Redo binding ignores unknown actions until they become supported', () => {
  const control = createControl('unknown', 'undo')
  const harness = createHarness([control])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindUndoRedoActions(harness.root, actions), 0)
  control.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [])

  control.dataset.undoRedoAction = 'toggle'
  assert.equal(bindUndoRedoActions(harness.root, actions), 1)
  control.dispatchEvent(new Event('click'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'toggle')
  assert.equal(calls[0][1][1], 'undo')
})

test('Undo and Redo binding tolerates absent controls and fails closed at invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = createActions([])

  assert.equal(bindUndoRedoActions(root, validActions), 0)
  assert.throws(
    () => bindUndoRedoActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindUndoRedoActions({}, validActions),
    /queryable root/
  )

  for (const callbackName of [
    'toggle',
    'apply',
    'close',
    'scroll',
    'stopScroll'
  ]) {
    assert.throws(
      () => bindUndoRedoActions(root, {
        ...validActions,
        [callbackName]: null
      }),
      /toggle, apply, close, scroll, and stopScroll callbacks/
    )
  }
  assert.throws(
    () => bindUndoRedoActions(root, null),
    /toggle, apply, close, scroll, and stopScroll callbacks/
  )
})
