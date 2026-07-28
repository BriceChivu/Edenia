import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindSettingsLocaleActions
} from '../../src/features/settings/locale-actions.js'

const triggerSelector =
  '#settingsLocaleBtn[data-settings-locale-action="toggle"]'
const optionSelector = '[data-settings-locale-action="select"]'

function createTarget() {
  return {
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener)
    },
    dispatch(type, event) {
      this.listeners.get(type)?.(event)
    }
  }
}

function createHarness({ includeTrigger = true, includeMenu = true } = {}) {
  const trigger = includeTrigger ? createTarget() : null
  const menu = includeMenu ? {
    ...createTarget(),
    contains(control) {
      return control?.owner === this
    }
  } : null
  const root = {
    querySelector(selector) {
      if (selector === triggerSelector) return trigger
      if (selector === '#settingsLocaleMenu') return menu
      return null
    }
  }
  return { menu, root, trigger }
}

function createOptionTarget(control) {
  return {
    closest(selector) {
      assert.equal(selector, optionSelector)
      return control
    }
  }
}

test('Settings locale binding forwards the exact trigger event', () => {
  const { root, trigger } = createHarness()
  const calls = []
  assert.equal(bindSettingsLocaleActions(root, {
    toggle(event, ...extra) {
      calls.push({ event, extra })
    },
    select() {}
  }), 2)

  let defaultPrevented = false
  let propagationStopped = false
  const event = {
    preventDefault() {
      defaultPrevented = true
    },
    stopPropagation() {
      propagationStopped = true
    }
  }
  trigger.dispatch('click', event)
  assert.deepEqual(calls, [{ event, extra: [] }])
  assert.equal(defaultPrevented, false)
  assert.equal(propagationStopped, false)
})

test('Settings locale binding delegates each live option value', () => {
  const { menu, root } = createHarness()
  const calls = []
  bindSettingsLocaleActions(root, {
    toggle() {},
    select(...args) {
      calls.push(args)
    }
  })

  const control = {
    owner: menu,
    value: 'fr'
  }
  let defaultPrevented = false
  let propagationStopped = false
  menu.dispatch('change', {
    target: createOptionTarget(control),
    preventDefault() {
      defaultPrevented = true
    },
    stopPropagation() {
      propagationStopped = true
    }
  })
  control.value = 'zh-Hant'
  menu.dispatch('change', {
    target: createOptionTarget(control)
  })

  assert.deepEqual(calls, [['fr'], ['zh-Hant']])
  assert.equal(defaultPrevented, false)
  assert.equal(propagationStopped, false)
})

test('Settings locale binding ignores unmatched and foreign options', () => {
  const { menu, root } = createHarness()
  const calls = []
  bindSettingsLocaleActions(root, {
    toggle() {},
    select(...args) {
      calls.push(args)
    }
  })

  menu.dispatch('change', {
    target: createOptionTarget(null)
  })
  menu.dispatch('change', {
    target: createOptionTarget({
      owner: null,
      value: 'fr'
    })
  })
  assert.deepEqual(calls, [])
})

test('Settings locale binding is idempotent and tolerates absent controls', () => {
  const { menu, root, trigger } = createHarness()
  const calls = []
  const actions = {
    toggle() {
      calls.push('toggle')
    },
    select(locale) {
      calls.push(locale)
    }
  }
  assert.equal(bindSettingsLocaleActions(root, actions), 2)
  assert.equal(bindSettingsLocaleActions(root, actions), 0)
  trigger.dispatch('click', {})
  menu.dispatch('change', {
    target: createOptionTarget({
      owner: menu,
      value: 'es'
    })
  })
  assert.deepEqual(calls, ['toggle', 'es'])
  assert.equal(
    bindSettingsLocaleActions(
      createHarness({ includeTrigger: false, includeMenu: false }).root,
      actions
    ),
    0
  )
})

test('Settings locale binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindSettingsLocaleActions(null, {
      toggle() {},
      select() {}
    }),
    /queryable root/
  )
  assert.throws(
    () => bindSettingsLocaleActions(root, {
      toggle() {}
    }),
    /toggle and select callbacks/
  )
})
