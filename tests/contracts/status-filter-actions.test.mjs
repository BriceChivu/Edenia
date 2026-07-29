import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindStatusFilterActions
} from '../../src/features/videos/status-filter-actions.js'

const controlSelector = '[data-status-filter-action]'

function createControl(actionName, dataset = {}) {
  const control = new EventTarget()
  control.dataset = {
    statusFilterAction: actionName,
    ...dataset
  }
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
    select(...args) {
      calls.push(['select', args])
    },
    toggle(...args) {
      calls.push(['toggle', args])
    },
    close(...args) {
      calls.push(['close', args])
    }
  }
}

test('status filter binding preserves exact events and argument contracts', () => {
  const tab = createControl('select-tab', { statusTab: 'unwatched' })
  const toggle = createControl('toggle')
  const option = createControl('select-option', { status: 'partial' })
  const close = createControl('close')
  const { root } = createHarness([tab, toggle, option, close])
  const calls = []

  assert.equal(bindStatusFilterActions(root, createActions(calls)), 4)

  tab.dataset.statusTab = 'favorite'
  option.dataset.status = 'watch-later'
  const tabEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const toggleEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const optionEvent = new Event('change', {
    bubbles: true,
    cancelable: true
  })
  const closeEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(tab.dispatchEvent(tabEvent), true)
  assert.equal(toggle.dispatchEvent(toggleEvent), true)
  assert.equal(option.dispatchEvent(optionEvent), true)
  assert.equal(close.dispatchEvent(closeEvent), true)

  assert.deepEqual(calls, [
    ['select', ['favorite']],
    ['toggle', []],
    ['select', ['watch-later']],
    ['close', [true]]
  ])
  ;[tabEvent, toggleEvent, optionEvent, closeEvent].forEach(event => {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  })
})

test('status filter binding is idempotent and binds replaced controls', () => {
  const tab = createControl('select-tab', { statusTab: 'all' })
  const originalOption = createControl('select-option', {
    status: 'unwatched'
  })
  const harness = createHarness([tab, originalOption])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindStatusFilterActions(harness.root, actions), 2)
  assert.equal(bindStatusFilterActions(harness.root, actions), 0)
  tab.dispatchEvent(new Event('click'))
  originalOption.dispatchEvent(new Event('change'))

  const replacementOption = createControl('select-option', {
    status: 'favorite'
  })
  const replacementClose = createControl('close')
  harness.replaceControls([tab, replacementOption, replacementClose])
  assert.equal(bindStatusFilterActions(harness.root, actions), 2)
  replacementOption.dispatchEvent(new Event('change'))
  replacementClose.dispatchEvent(new Event('click'))

  assert.deepEqual(calls, [
    ['select', ['all']],
    ['select', ['unwatched']],
    ['select', ['favorite']],
    ['close', [true]]
  ])

  harness.replaceControls([])
  assert.equal(bindStatusFilterActions(harness.root, actions), 0)
})

test('status filter binding ignores foreign and unknown controls', () => {
  const foreign = createControl(undefined)
  delete foreign.dataset.statusFilterAction
  const unknown = createControl('unknown', { status: 'partial' })
  const harness = createHarness([foreign, unknown])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindStatusFilterActions(harness.root, actions), 0)
  foreign.dispatchEvent(new Event('click'))
  unknown.dispatchEvent(new Event('click'))
  unknown.dispatchEvent(new Event('change'))
  assert.deepEqual(calls, [])

  unknown.dataset.statusFilterAction = 'select-option'
  assert.equal(bindStatusFilterActions(harness.root, actions), 1)
  unknown.dispatchEvent(new Event('change'))
  assert.deepEqual(calls, [
    ['select', ['partial']]
  ])
})

test('status filter binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = createActions([])

  assert.equal(bindStatusFilterActions(root, validActions), 0)
  assert.throws(
    () => bindStatusFilterActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindStatusFilterActions({}, validActions),
    /queryable root/
  )

  for (const callbackName of ['select', 'toggle', 'close']) {
    assert.throws(
      () => bindStatusFilterActions(root, {
        ...validActions,
        [callbackName]: null
      }),
      /select, toggle, and close callbacks/
    )
  }
  assert.throws(
    () => bindStatusFilterActions(root, null),
    /select, toggle, and close callbacks/
  )
})
