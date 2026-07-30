import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindVideoSearchShellActions
} from '../../src/features/videos/search-shell-actions.js'

const controlSelector = '[data-video-search-action]'

function createControl(actionName, value = '') {
  const listeners = new Map()
  return {
    dataset: {
      videoSearchAction: actionName
    },
    value,
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

function createHarness(controls = [
  createControl('toggle'),
  createControl('close'),
  createControl('query')
]) {
  return {
    controls,
    root: {
      querySelectorAll(selector) {
        assert.equal(selector, controlSelector)
        return controls
      }
    }
  }
}

function createActions(calls) {
  return {
    toggle(event) {
      calls.push(['toggle', event, event.currentTarget])
    },
    close(...args) {
      calls.push(['close', args])
    },
    renderResults(...args) {
      calls.push(['renderResults', args])
    },
    handleInputKey(event) {
      calls.push(['handleInputKey', event, event.currentTarget])
    }
  }
}

test('video search shell binding preserves exact event and argument contracts', () => {
  const toggle = createControl('toggle')
  const close = createControl('close')
  const query = createControl('query', 'first value')
  const { root } = createHarness([toggle, close, query])
  const calls = []

  assert.equal(
    bindVideoSearchShellActions(root, createActions(calls)),
    3
  )

  const toggleDispatch = toggle.dispatch('click', { source: 'toggle' })
  const closeDispatch = close.dispatch('click', { source: 'close' })
  const firstInputDispatch = query.dispatch('input', { source: 'input' })
  query.value = 'replacement value'
  const secondInputDispatch = query.dispatch('input', { source: 'input-live' })
  const keyDispatch = query.dispatch('keydown', {
    key: 'Enter',
    source: 'keydown'
  })

  assert.equal(calls[0][0], 'toggle')
  assert.equal(calls[0][1], toggleDispatch.event)
  assert.equal(calls[0][2], toggle)
  assert.deepEqual(calls[1], ['close', [true]])
  assert.deepEqual(calls[2], ['renderResults', ['first value']])
  assert.deepEqual(calls[3], ['renderResults', ['replacement value']])
  assert.equal(calls[4][0], 'handleInputKey')
  assert.equal(calls[4][1], keyDispatch.event)
  assert.equal(calls[4][2], query)

  ;[
    toggleDispatch,
    closeDispatch,
    firstInputDispatch,
    secondInputDispatch,
    keyDispatch
  ].forEach(result => {
    assert.equal(result.defaultPrevented, false)
    assert.equal(result.propagationStopped, false)
  })
})

test('video search shell binding is idempotent and binds replacements', () => {
  const toggle = createControl('toggle')
  const close = createControl('close')
  const originalQuery = createControl('query', 'original')
  const controls = [toggle, close, originalQuery]
  const { root } = createHarness(controls)
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindVideoSearchShellActions(root, actions), 3)
  assert.equal(bindVideoSearchShellActions(root, actions), 0)
  assert.equal(toggle.listenerCount('click'), 1)
  assert.equal(close.listenerCount('click'), 1)
  assert.equal(originalQuery.listenerCount('input'), 1)
  assert.equal(originalQuery.listenerCount('keydown'), 1)

  const replacementQuery = createControl('query', 'replacement')
  controls[2] = replacementQuery
  assert.equal(bindVideoSearchShellActions(root, actions), 1)
  assert.equal(replacementQuery.listenerCount('input'), 1)
  assert.equal(replacementQuery.listenerCount('keydown'), 1)
  replacementQuery.dispatch('input')
  replacementQuery.dispatch('keydown', { key: 'Escape' })

  assert.deepEqual(calls[0], ['renderResults', ['replacement']])
  assert.equal(calls[1][0], 'handleInputKey')
  assert.equal(calls[1][2], replacementQuery)
})

test('video search shell binding ignores result and unknown controls', () => {
  const result = createControl('select-result')
  const unknown = createControl('unknown')
  const controls = [result, unknown]
  const { root } = createHarness(controls)
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindVideoSearchShellActions(root, actions), 0)
  ;['click', 'input', 'keydown'].forEach(type => {
    assert.equal(result.listenerCount(type), 0)
    assert.equal(unknown.listenerCount(type), 0)
  })

  unknown.dataset.videoSearchAction = 'toggle'
  assert.equal(bindVideoSearchShellActions(root, actions), 1)
  unknown.dispatch('click')
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'toggle')
})

test('video search shell binding tolerates no controls', () => {
  const { root } = createHarness([])
  assert.equal(bindVideoSearchShellActions(root, createActions([])), 0)
})

test('video search shell binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = createActions([])

  assert.throws(
    () => bindVideoSearchShellActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindVideoSearchShellActions({}, validActions),
    /queryable root/
  )

  const invalidActionMaps = [
    null,
    {},
    { ...validActions, toggle: null },
    { ...validActions, close: null },
    { ...validActions, renderResults: null },
    { ...validActions, handleInputKey: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindVideoSearchShellActions(root, actions),
      /toggle, close, renderResults, and handleInputKey callbacks/
    )
  })
})
