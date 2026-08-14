import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  createLegacyProgressMigrationView
} from '../../src/features/migration/legacy-progress-view.js'
import {
  bindLegacyProgressRecoveryActions
} from '../../src/features/settings/legacy-progress-recovery-actions.js'

function control(action) {
  const listeners = []
  return {
    dataset: { legacyProgressAction: action },
    hidden: false,
    focused: false,
    addEventListener(name, listener) {
      assert.equal(name, 'click')
      listeners.push(listener)
    },
    click() {
      listeners.forEach(listener => listener())
    },
    focus() {
      this.focused = true
    }
  }
}

function viewHarness() {
  const classes = new Set(['hidden'])
  const gate = {
    classList: {
      add(value) { classes.add(value) },
      remove(value) { classes.delete(value) }
    }
  }
  const elements = {
    legacyProgressMigrationGate: gate,
    legacyProgressMigrationTitle: { textContent: '' },
    legacyProgressMigrationBody: { textContent: '' },
    legacyProgressMigrationStatus: { textContent: '' }
  }
  const controls = ['retry', 'manual', 'continue', 'cancel'].map(control)
  let scheduled = null
  const view = createLegacyProgressMigrationView({
    clearTimeoutImpl() {},
    root: {
      getElementById(id) { return elements[id] || null },
      querySelectorAll() { return controls }
    },
    setTimeoutImpl(callback, delay) {
      scheduled = { callback, delay }
      return 1
    },
    translate: key => key
  })
  return { classes, controls, elements, scheduled: () => scheduled, view }
}

test('migration disclosure is cancellable during the exact delay', async () => {
  const harness = viewHarness()
  const pending = harness.view.waitForDisclosure({ delayMs: 1_500 })
  assert.equal(harness.scheduled().delay, 1_500)
  assert.equal(harness.classes.has('hidden'), false)
  const cancel = harness.controls.find(item => (
    item.dataset.legacyProgressAction === 'cancel'
  ))
  assert.equal(cancel.hidden, false)
  assert.equal(cancel.focused, true)
  cancel.click()
  assert.equal(await pending, false)
})

test('migration failure view exposes only explicit recovery choices', () => {
  const harness = viewHarness()
  const calls = []
  harness.view.showFailure({
    onContinue: () => calls.push('continue'),
    onManualImport: () => calls.push('manual'),
    onRetry: () => calls.push('retry')
  })
  const visible = harness.controls
    .filter(item => !item.hidden)
    .map(item => item.dataset.legacyProgressAction)
  assert.deepEqual(visible, ['retry', 'manual', 'continue'])
  harness.controls.find(item => (
    item.dataset.legacyProgressAction === 'manual'
  )).click()
  assert.deepEqual(calls, ['manual'])
})

test('Settings recovery binder remains separate, strict, and idempotent', () => {
  let calls = 0
  const listeners = []
  const recoveryControl = {
    addEventListener(name, listener) {
      assert.equal(name, 'click')
      listeners.push(listener)
    }
  }
  const root = { querySelectorAll: () => [recoveryControl] }
  const actions = { recover: () => { calls += 1 } }
  assert.equal(bindLegacyProgressRecoveryActions(root, actions), 1)
  assert.equal(bindLegacyProgressRecoveryActions(root, actions), 0)
  listeners[0]()
  assert.equal(calls, 1)
  assert.throws(
    () => bindLegacyProgressRecoveryActions({}, actions),
    /queryable root/
  )
})

test('startup gate precedes app and onboarding and keeps legacy backup labels', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
  ])
  assert.ok(
    html.indexOf('id="legacyProgressMigrationGate"')
      < html.indexOf('id="introTrailer"')
  )
  assert.doesNotMatch(
    html.match(/id="legacyProgressMigrationGate"[\s\S]*?<\/section>/)[0],
    /on(?:click|change|submit)=/i
  )
  const initStart = app.indexOf('async function init()')
  const controllerStart = app.indexOf(
    '.runBeforeApplicationStart()',
    initStart
  )
  const applicationStart = app.indexOf(
    'startApplicationFromLocalState()',
    controllerStart
  )
  assert.ok(controllerStart > initStart)
  assert.ok(applicationStart > controllerStart)
  assert.match(app, /'legacy origin recovery': 'backups\.reason\.legacyRecovery'/)
  assert.match(app, /'legacy origin conflict': 'backups\.reason\.legacyConflict'/)
})
