import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindManualVideoShellActions
} from '../../src/features/videos/manual-video-shell-actions.js'

const controlSelector = '[data-manual-video-action]'

function createControl(actionName) {
  const listeners = new Map()
  return {
    dataset: {
      manualVideoAction: actionName
    },
    addEventListener(type, listener) {
      const typeListeners = listeners.get(type) || []
      typeListeners.push(listener)
      listeners.set(type, typeListeners)
    },
    dispatch(type, properties = {}) {
      let defaultPrevented = false
      let propagationStopped = false
      const event = {
        ...properties,
        currentTarget: this,
        preventDefault() {
          defaultPrevented = true
        },
        stopPropagation() {
          propagationStopped = true
        }
      }
      ;(listeners.get(type) || []).forEach(listener => listener(event))
      return {
        defaultPrevented,
        event,
        propagationStopped
      }
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length
    }
  }
}

function createHarness(initialControls = []) {
  let controls = initialControls
  return {
    root: {
      querySelectorAll(selector) {
        assert.equal(selector, controlSelector)
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
      calls.push(['toggle', args])
    },
    close(...args) {
      calls.push(['close', args])
    },
    renderSuggestions(...args) {
      calls.push(['renderSuggestions', args])
    },
    handleInputKey(...args) {
      calls.push(['handleInputKey', args])
    }
  }
}

test('manual video shell binding preserves exact event and argument contracts', () => {
  const toggle = createControl('toggle')
  const close = createControl('close')
  const query = createControl('query')
  const harness = createHarness([toggle, close, query])
  const calls = []

  assert.equal(
    bindManualVideoShellActions(harness.root, createActions(calls)),
    3
  )

  const toggleDispatch = toggle.dispatch('click', { source: 'toggle' })
  const closeDispatch = close.dispatch('click', { source: 'close' })
  const inputDispatch = query.dispatch('input', { source: 'input' })
  const keyDispatch = query.dispatch('keydown', {
    key: 'Escape',
    source: 'keydown'
  })

  assert.deepEqual(calls[0], ['toggle', [toggleDispatch.event]])
  assert.equal(calls[0][1][0].currentTarget, toggle)
  assert.deepEqual(calls[1], ['close', [true]])
  assert.deepEqual(calls[2], ['renderSuggestions', []])
  assert.deepEqual(calls[3], ['handleInputKey', [keyDispatch.event]])
  assert.equal(calls[3][1][0].currentTarget, query)

  ;[
    toggleDispatch,
    closeDispatch,
    inputDispatch,
    keyDispatch
  ].forEach(result => {
    assert.equal(result.defaultPrevented, false)
    assert.equal(result.propagationStopped, false)
  })
})

test('manual video shell binding is idempotent and binds replacements', () => {
  const toggle = createControl('toggle')
  const originalQuery = createControl('query')
  const harness = createHarness([toggle, originalQuery])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindManualVideoShellActions(harness.root, actions), 2)
  assert.equal(bindManualVideoShellActions(harness.root, actions), 0)
  assert.equal(toggle.listenerCount('click'), 1)
  assert.equal(originalQuery.listenerCount('input'), 1)
  assert.equal(originalQuery.listenerCount('keydown'), 1)

  toggle.dispatch('click')
  originalQuery.dispatch('input')
  originalQuery.dispatch('keydown', { key: 'ArrowDown' })

  const replacementQuery = createControl('query')
  const replacementClose = createControl('close')
  harness.replaceControls([toggle, replacementQuery, replacementClose])
  assert.equal(bindManualVideoShellActions(harness.root, actions), 2)
  assert.equal(replacementQuery.listenerCount('input'), 1)
  assert.equal(replacementQuery.listenerCount('keydown'), 1)
  assert.equal(replacementClose.listenerCount('click'), 1)

  replacementQuery.dispatch('input')
  replacementQuery.dispatch('keydown', { key: 'Enter' })
  replacementClose.dispatch('click')

  assert.deepEqual(calls.map(([name, args]) => [
    name,
    name === 'close' ? args : args.length
  ]), [
    ['toggle', 1],
    ['renderSuggestions', 0],
    ['handleInputKey', 1],
    ['renderSuggestions', 0],
    ['handleInputKey', 1],
    ['close', [true]]
  ])
})

test('manual video shell binding ignores empty, foreign, and unknown controls', () => {
  const emptyHarness = createHarness([])
  assert.equal(
    bindManualVideoShellActions(emptyHarness.root, createActions([])),
    0
  )

  const foreign = createControl(undefined)
  delete foreign.dataset.manualVideoAction
  const unknown = createControl('unknown')
  const harness = createHarness([foreign, unknown])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindManualVideoShellActions(harness.root, actions), 0)
  ;['click', 'input', 'keydown'].forEach(type => {
    assert.equal(foreign.listenerCount(type), 0)
    assert.equal(unknown.listenerCount(type), 0)
  })

  unknown.dataset.manualVideoAction = 'toggle'
  assert.equal(bindManualVideoShellActions(harness.root, actions), 1)
  unknown.dispatch('click')
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'toggle')
})

test('manual video shell binding fails closed on invalid boundaries', () => {
  const harness = createHarness()
  const validActions = createActions([])

  assert.throws(
    () => bindManualVideoShellActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindManualVideoShellActions({}, validActions),
    /queryable root/
  )

  for (const callbackName of [
    'toggle',
    'close',
    'renderSuggestions',
    'handleInputKey'
  ]) {
    assert.throws(
      () => bindManualVideoShellActions(harness.root, {
        ...validActions,
        [callbackName]: null
      }),
      /toggle, close, renderSuggestions, and handleInputKey callbacks/
    )
  }
  assert.throws(
    () => bindManualVideoShellActions(harness.root, null),
    /toggle, close, renderSuggestions, and handleInputKey callbacks/
  )
})
