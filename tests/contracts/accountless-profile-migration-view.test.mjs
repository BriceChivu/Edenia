import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  createAccountlessProfileMigrationView
} from '../../src/features/migration/accountless-profile-migration-view.js'
import {
  bindAccountlessProfileMigrationActions
} from '../../src/features/migration/accountless-profile-migration-actions.js'
import { I18N } from '../../src/i18n/index.js'

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')

function createElement() {
  const classes = new Set(['hidden'])
  const attributes = new Map()
  return {
    hidden: true,
    textContent: '',
    classList: {
      add: value => classes.add(value),
      contains: value => classes.has(value),
      remove: value => classes.delete(value),
      toggle(value, force) {
        if (force) classes.add(value)
        else classes.delete(value)
      }
    },
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value)
  }
}

function createViewHarness() {
  const ids = [
    'accountlessProfileMigrationNotice',
    'accountlessProfileMigrationTitle',
    'accountlessProfileMigrationBody',
    'accountlessProfileMigrationStatus',
    'accountlessProfileMigrationBackup',
    'accountlessProfileMigrationLater',
    'accountlessProfileMigrationConfirm',
    'accountlessProfileMigrationSignIn',
    'accountlessProfileMigrationRetry'
  ]
  const elements = new Map(ids.map(id => [id, createElement()]))
  const documentElement = { dataset: {} }
  return {
    documentElement,
    elements,
    view: createAccountlessProfileMigrationView({
      root: {
        documentElement,
        getElementById: id => elements.get(id) || null
      },
      translate(key, params = {}) {
        return String(I18N.en[key] || key).replace(
          /\{(\w+)\}/g,
          (_, name) => String(params[name] ?? `{${name}}`)
        )
      }
    })
  }
}

test('notice and countdown copy offer voluntary backup without hiding final urgency', () => {
  const { documentElement, elements, view } = createViewHarness()

  view.render({
    daysRemaining: 30,
    finalGateAt: Date.parse('2026-09-21T00:00:00.000Z'),
    status: 'notice'
  })
  assert.equal(
    elements.get('accountlessProfileMigrationTitle').textContent,
    'Keep your town safe across devices'
  )
  assert.equal(elements.get('accountlessProfileMigrationBackup').hidden, false)
  assert.equal(elements.get('accountlessProfileMigrationLater').hidden, false)

  view.render({
    daysRemaining: 7,
    dismissible: false,
    finalGateAt: Date.parse('2026-09-21T00:00:00.000Z'),
    status: 'countdown',
    urgencyLevel: 1
  })
  assert.equal(
    elements.get('accountlessProfileMigrationTitle').textContent,
    'Sign-in required in 7 days'
  )
  assert.equal(documentElement.dataset.accountlessProfileMigrationUrgency, '1')
  assert.equal(elements.get('accountlessProfileMigrationBackup').hidden, false)
  assert.equal(elements.get('accountlessProfileMigrationLater').hidden, true)
  assert.equal(
    elements.get('accountlessProfileMigrationNotice').classList.contains('hidden'),
    false
  )
  assert.equal(
    elements.get('accountlessProfileMigrationNotice').getAttribute('role'),
    'region'
  )
  assert.equal(
    elements.get('accountlessProfileMigrationNotice').getAttribute('aria-modal'),
    'false'
  )

  view.render({
    daysRemaining: 0,
    dismissible: false,
    finalGateAt: Date.parse('2026-09-21T00:00:00.000Z'),
    status: 'countdown',
    urgencyLevel: 8
  })
  assert.equal(
    elements.get('accountlessProfileMigrationTitle').textContent,
    'Sign-in required now'
  )
  assert.equal(
    elements.get('accountlessProfileMigrationNotice').getAttribute('role'),
    'region'
  )
})

test('confirmation, authentication, and failed backup states expose only valid actions', () => {
  const { elements, view } = createViewHarness()

  view.render({
    daysRemaining: 20,
    email: 'owner@example.test',
    finalGateAt: Date.now(),
    status: 'confirming-session'
  })
  assert.equal(
    elements.get('accountlessProfileMigrationTitle').textContent,
    'Continue as owner@example.test?'
  )
  assert.equal(elements.get('accountlessProfileMigrationConfirm').hidden, false)
  assert.equal(elements.get('accountlessProfileMigrationLater').hidden, false)

  view.render({
    daysRemaining: 20,
    finalGateAt: Date.now(),
    status: 'awaiting-authentication'
  })
  assert.equal(elements.get('accountlessProfileMigrationSignIn').hidden, false)
  assert.equal(elements.get('accountlessProfileMigrationConfirm').hidden, true)

  view.render({
    daysRemaining: 20,
    finalGateAt: Date.now(),
    status: 'backup-failed'
  })
  assert.equal(
    elements.get('accountlessProfileMigrationTitle').textContent,
    'Not backed up yet'
  )
  assert.equal(elements.get('accountlessProfileMigrationRetry').hidden, false)
  assert.equal(elements.get('accountlessProfileMigrationLater').hidden, false)
  assert.equal(
    elements.get('accountlessProfileMigrationNotice').getAttribute('role'),
    'region'
  )
  assert.equal(
    elements.get('accountlessProfileMigrationNotice').getAttribute('aria-modal'),
    'false'
  )

  view.render({ status: 'hidden' })
  assert.equal(
    elements.get('accountlessProfileMigrationNotice').classList.contains('hidden'),
    true
  )
})

test('the migration surface contains the required voluntary choices', () => {
  assert.match(
    html,
    /id="accountlessProfileMigrationBackup"[^>]*data-accountless-profile-migration-action="begin"[^>]*>Back up my progress now</
  )
  assert.match(
    html,
    /id="accountlessProfileMigrationLater"[^>]*data-accountless-profile-migration-action="later"[^>]*>Later</
  )
})

test('migration controls bind once and forward each explicit intent', () => {
  const actions = ['begin', 'later', 'confirm', 'open-sign-in', 'retry']
  const controls = new Map(actions.map(action => [
    `[data-accountless-profile-migration-action="${action}"]`,
    {
      listener: null,
      addEventListener(_type, listener) { this.listener = listener },
      click() { this.listener?.() }
    }
  ]))
  const root = {
    querySelector: selector => controls.get(selector) || null
  }
  const calls = []
  const callbacks = Object.fromEntries(actions.map(action => [
    action === 'open-sign-in' ? 'openSignIn' : action,
    () => calls.push(action)
  ]))

  assert.equal(
    bindAccountlessProfileMigrationActions(root, callbacks),
    5
  )
  assert.equal(
    bindAccountlessProfileMigrationActions(root, callbacks),
    0
  )
  for (const control of controls.values()) control.click()
  assert.deepEqual(calls, actions)
})
