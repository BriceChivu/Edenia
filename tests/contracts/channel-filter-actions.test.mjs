import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindChannelFilterActions
} from '../../src/features/channels/filter-actions.js'

const controlSelector = '[data-channel-filter-action]'

function createControl(actionName, dataset = {}) {
  const control = new EventTarget()
  control.dataset = {
    channelFilterAction: actionName,
    ...dataset
  }
  control.checked = false
  return control
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
    setChannel(...args) {
      calls.push(['setChannel', args])
      return false
    },
    setAll(...args) {
      calls.push(['setAll', args])
      return false
    },
    handleSelectAllClick(...args) {
      calls.push(['handleSelectAllClick', args])
      return false
    },
    handleOptionClick(...args) {
      calls.push(['handleOptionClick', args])
      return false
    }
  }
}

test('channel filter binding forwards exact row events and live input state', () => {
  const selectAllRow = createControl('select-all-row')
  const selectAll = createControl('select-all')
  const optionRow = createControl('option-row', {
    channelId: 'row-before'
  })
  const option = createControl('select', {
    channelId: 'option-before'
  })
  const { root } = createHarness([
    selectAllRow,
    selectAll,
    optionRow,
    option
  ])
  const calls = []

  assert.equal(bindChannelFilterActions(root, createActions(calls)), 4)

  selectAll.checked = true
  optionRow.dataset.channelId = 'row-live'
  option.dataset.channelId = 'option-live'
  option.checked = false
  const selectAllRowEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const selectAllEvent = new Event('change', {
    bubbles: true,
    cancelable: true
  })
  const optionRowEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const optionEvent = new Event('change', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(selectAllRow.dispatchEvent(selectAllRowEvent), true)
  assert.equal(selectAll.dispatchEvent(selectAllEvent), true)
  assert.equal(optionRow.dispatchEvent(optionRowEvent), true)
  assert.equal(option.dispatchEvent(optionEvent), true)
  assert.deepEqual(calls, [
    ['handleSelectAllClick', [selectAllRowEvent]],
    ['setAll', [true]],
    ['handleOptionClick', [optionRowEvent, 'row-live']],
    ['setChannel', ['option-live', false]]
  ])
  ;[
    selectAllRowEvent,
    selectAllEvent,
    optionRowEvent,
    optionEvent
  ].forEach(event => {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  })
})

test('channel filter binding is idempotent and binds replacement controls', () => {
  const original = createControl('select', {
    channelId: 'original'
  })
  original.checked = true
  const harness = createHarness([original])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindChannelFilterActions(harness.root, actions), 1)
  assert.equal(bindChannelFilterActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('change'))

  const replacement = createControl('select-all')
  replacement.checked = false
  harness.replaceControls([original, replacement])
  assert.equal(bindChannelFilterActions(harness.root, actions), 1)
  assert.equal(bindChannelFilterActions(harness.root, actions), 0)
  replacement.dispatchEvent(new Event('change'))

  assert.deepEqual(calls, [
    ['setChannel', ['original', true]],
    ['setAll', [false]]
  ])
})

test('channel filter binding ignores unknown actions until they become supported', () => {
  const unknown = createControl('remove', {
    channelId: 'promoted'
  })
  const harness = createHarness([unknown])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindChannelFilterActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [])

  unknown.dataset.channelFilterAction = 'option-row'
  assert.equal(bindChannelFilterActions(harness.root, actions), 1)
  assert.equal(bindChannelFilterActions(harness.root, actions), 0)
  const event = new Event('click')
  unknown.dispatchEvent(event)
  assert.deepEqual(calls, [
    ['handleOptionClick', [event, 'promoted']]
  ])
})

test('channel filter binding tolerates missing controls', () => {
  const { root } = createHarness([])

  assert.equal(bindChannelFilterActions(root, createActions([])), 0)
})

test('channel filter binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = createActions([])

  assert.throws(
    () => bindChannelFilterActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindChannelFilterActions({}, validActions),
    /queryable root/
  )

  const invalidActionMaps = [
    null,
    {},
    { ...validActions, setChannel: null },
    { ...validActions, setAll: null },
    { ...validActions, handleSelectAllClick: null },
    { ...validActions, handleOptionClick: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindChannelFilterActions(root, actions),
      /setChannel, setAll, handleSelectAllClick, and handleOptionClick callbacks/
    )
  })
})
