import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindSettingsSyncActions
} from '../../src/features/settings/sync-actions.js'

const selectors = {
  cancel: '[data-settings-sync-action="cancel-import"]',
  confirm: '[data-settings-sync-action="confirm-import"]',
  export: '[data-settings-sync-action="export"]',
  choose: '[data-settings-sync-action="choose-file"]',
  input: '#syncFileInput[data-settings-sync-action="import-file"]'
}

function createControl(name, order) {
  return {
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener)
    },
    click() {
      order?.push(`${name}:native-click`)
      this.dispatch('click')
    },
    dispatch(type, event = {}) {
      this.listeners.get(type)?.(event)
    }
  }
}

function createHarness(included = Object.keys(selectors)) {
  const order = []
  const controls = new Map(
    included.map(key => [
      selectors[key],
      createControl(key, order)
    ])
  )
  const root = {
    querySelector(selector) {
      return controls.get(selector) || null
    }
  }
  return { controls, order, root }
}

test('Settings sync binding preserves exact export callback arguments', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindSettingsSyncActions(root, {
    cancelImport() {},
    confirmImport() {},
    exportFile(...args) {
      calls.push(args)
    },
    importFile() {}
  }), 5)

  let defaultPrevented = false
  let propagationStopped = false
  controls.get(selectors.export).dispatch('click', {
    preventDefault() {
      defaultPrevented = true
    },
    stopPropagation() {
      propagationStopped = true
    }
  })
  assert.deepEqual(calls, [[]])
  assert.equal(defaultPrevented, false)
  assert.equal(propagationStopped, false)
})

test('Settings sync picker click stays synchronous with its trigger', () => {
  const { controls, order, root } = createHarness()
  bindSettingsSyncActions(root, {
    cancelImport() {},
    confirmImport() {},
    exportFile() {},
    importFile() {}
  })

  controls.get(selectors.choose).dispatch('click')
  order.push('choose:after-dispatch')
  assert.deepEqual(order, [
    'input:native-click',
    'choose:after-dispatch'
  ])
})

test('Settings sync change forwards the exact input and no event', () => {
  const { controls, root } = createHarness()
  const calls = []
  bindSettingsSyncActions(root, {
    cancelImport() {},
    confirmImport() {},
    exportFile() {},
    importFile(...args) {
      calls.push(args)
    }
  })

  const input = controls.get(selectors.input)
  let defaultPrevented = false
  input.dispatch('change', {
    preventDefault() {
      defaultPrevented = true
    }
  })
  assert.deepEqual(calls, [[input]])
  assert.equal(defaultPrevented, false)
})

test('Settings sync binding is idempotent and tolerates absent controls', () => {
  const { controls, root } = createHarness()
  const calls = []
  const actions = {
    exportFile() {
      calls.push('export')
    },
    importFile() {
      calls.push('import')
    },
    cancelImport() {
      calls.push('cancel')
    },
    confirmImport() {
      calls.push('confirm')
    }
  }
  assert.equal(bindSettingsSyncActions(root, actions), 5)
  assert.equal(bindSettingsSyncActions(root, actions), 0)
  controls.get(selectors.export).dispatch('click')
  controls.get(selectors.input).dispatch('change')
  controls.get(selectors.cancel).dispatch('click')
  controls.get(selectors.confirm).dispatch('click')
  assert.deepEqual(calls, ['export', 'import', 'cancel', 'confirm'])

  assert.equal(bindSettingsSyncActions(createHarness([]).root, actions), 0)
  assert.equal(
    bindSettingsSyncActions(
      createHarness(['export', 'choose']).root,
      actions
    ),
    1
  )
})

test('Settings sync binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindSettingsSyncActions(null, {
      cancelImport() {},
      confirmImport() {},
      exportFile() {},
      importFile() {}
    }),
    /queryable root/
  )
  assert.throws(
    () => bindSettingsSyncActions(root, {
      cancelImport() {},
      exportFile() {}
    }),
    /export, import, confirm, and cancel callbacks/
  )
})
