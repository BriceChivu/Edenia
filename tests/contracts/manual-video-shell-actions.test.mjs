import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindManualVideoShellActions
} from '../../src/features/videos/manual-video-shell-actions.js'

const controlSelector = '[data-manual-video-action]'

function createControl(actionName, data = {}) {
  const listeners = new Map()
  return {
    dataset: {
      manualVideoAction: actionName,
      ...data
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
    },
    submit(...args) {
      calls.push(['submit', args])
    },
    searchYoutube(...args) {
      calls.push(['searchYoutube', args])
    },
    selectCurated(...args) {
      calls.push(['selectCurated', args])
    },
    selectYoutube(...args) {
      calls.push(['selectYoutube', args])
    }
  }
}

test('manual video shell binding preserves exact event and argument contracts', () => {
  const toggle = createControl('toggle')
  const close = createControl('close')
  const query = createControl('query')
  const submit = createControl('submit')
  const searchYoutube = createControl('search-youtube')
  const selectCurated = createControl('select-curated', {
    catalogId: 'catalog-1'
  })
  const selectYoutube = createControl('select-youtube', {
    channelId: 'channel-1'
  })
  const harness = createHarness([
    toggle,
    close,
    query,
    submit,
    searchYoutube,
    selectCurated,
    selectYoutube
  ])
  const calls = []

  assert.equal(
    bindManualVideoShellActions(harness.root, createActions(calls)),
    7
  )

  const toggleDispatch = toggle.dispatch('click', { source: 'toggle' })
  const closeDispatch = close.dispatch('click', { source: 'close' })
  const inputDispatch = query.dispatch('input', { source: 'input' })
  const keyDispatch = query.dispatch('keydown', {
    key: 'Escape',
    source: 'keydown'
  })
  const submitDispatch = submit.dispatch('submit', { source: 'submit' })
  const searchDispatch = searchYoutube.dispatch('click', { source: 'search' })
  const curatedDispatch = selectCurated.dispatch('click', {
    source: 'curated'
  })
  const youtubeDispatch = selectYoutube.dispatch('click', {
    source: 'youtube'
  })

  assert.deepEqual(calls[0], ['toggle', [toggleDispatch.event]])
  assert.equal(calls[0][1][0].currentTarget, toggle)
  assert.deepEqual(calls[1], ['close', [true]])
  assert.deepEqual(calls[2], ['renderSuggestions', []])
  assert.deepEqual(calls[3], ['handleInputKey', [keyDispatch.event]])
  assert.equal(calls[3][1][0].currentTarget, query)
  assert.deepEqual(calls[4], ['submit', [submitDispatch.event]])
  assert.equal(calls[4][1][0].currentTarget, submit)
  assert.deepEqual(calls[5], ['searchYoutube', [searchDispatch.event]])
  assert.deepEqual(
    calls[6],
    ['selectCurated', [curatedDispatch.event, 'catalog-1']]
  )
  assert.deepEqual(
    calls[7],
    ['selectYoutube', [youtubeDispatch.event, 'channel-1']]
  )
  assert.equal(calls[6][1][0].currentTarget, selectCurated)
  assert.equal(calls[7][1][0].currentTarget, selectYoutube)

  ;[
    toggleDispatch,
    closeDispatch,
    inputDispatch,
    keyDispatch,
    submitDispatch,
    searchDispatch,
    curatedDispatch,
    youtubeDispatch
  ].forEach(result => {
    assert.equal(result.defaultPrevented, false)
    assert.equal(result.propagationStopped, false)
  })
})

test('manual video shell binding is idempotent and binds replacements', () => {
  const toggle = createControl('toggle')
  const originalQuery = createControl('query')
  const originalSubmit = createControl('submit')
  const harness = createHarness([toggle, originalQuery, originalSubmit])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindManualVideoShellActions(harness.root, actions), 3)
  assert.equal(bindManualVideoShellActions(harness.root, actions), 0)
  assert.equal(toggle.listenerCount('click'), 1)
  assert.equal(originalQuery.listenerCount('input'), 1)
  assert.equal(originalQuery.listenerCount('keydown'), 1)
  assert.equal(originalSubmit.listenerCount('submit'), 1)

  toggle.dispatch('click')
  originalQuery.dispatch('input')
  originalQuery.dispatch('keydown', { key: 'ArrowDown' })
  originalSubmit.dispatch('submit')

  const replacementQuery = createControl('query')
  const replacementClose = createControl('close')
  const replacementSubmit = createControl('submit')
  const replacementSearch = createControl('search-youtube')
  const replacementCurated = createControl('select-curated', {
    catalogId: 'catalog-2'
  })
  const replacementYoutube = createControl('select-youtube', {
    channelId: 'channel-2'
  })
  harness.replaceControls([
    toggle,
    replacementQuery,
    replacementClose,
    replacementSubmit,
    replacementSearch,
    replacementCurated,
    replacementYoutube
  ])
  assert.equal(bindManualVideoShellActions(harness.root, actions), 6)
  assert.equal(replacementQuery.listenerCount('input'), 1)
  assert.equal(replacementQuery.listenerCount('keydown'), 1)
  assert.equal(replacementClose.listenerCount('click'), 1)
  assert.equal(replacementSubmit.listenerCount('submit'), 1)
  assert.equal(replacementSearch.listenerCount('click'), 1)
  assert.equal(replacementCurated.listenerCount('click'), 1)
  assert.equal(replacementYoutube.listenerCount('click'), 1)

  replacementQuery.dispatch('input')
  replacementQuery.dispatch('keydown', { key: 'Enter' })
  replacementClose.dispatch('click')
  replacementSubmit.dispatch('submit')
  replacementSearch.dispatch('click')
  replacementCurated.dispatch('click')
  replacementYoutube.dispatch('click')

  assert.deepEqual(calls.map(([name, args]) => [
    name,
    name === 'close' ? args : args.length
  ]), [
    ['toggle', 1],
    ['renderSuggestions', 0],
    ['handleInputKey', 1],
    ['submit', 1],
    ['renderSuggestions', 0],
    ['handleInputKey', 1],
    ['close', [true]],
    ['submit', 1],
    ['searchYoutube', 1],
    ['selectCurated', 2],
    ['selectYoutube', 2]
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
  ;['click', 'input', 'keydown', 'submit'].forEach(type => {
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
    'handleInputKey',
    'submit',
    'searchYoutube',
    'selectCurated',
    'selectYoutube'
  ]) {
    assert.throws(
      () => bindManualVideoShellActions(harness.root, {
        ...validActions,
        [callbackName]: null
      }),
      /toggle, close, renderSuggestions, handleInputKey, submit, searchYoutube, selectCurated, and selectYoutube callbacks/
    )
  }
  assert.throws(
    () => bindManualVideoShellActions(harness.root, null),
    /toggle, close, renderSuggestions, handleInputKey, submit, searchYoutube, selectCurated, and selectYoutube callbacks/
  )
})
