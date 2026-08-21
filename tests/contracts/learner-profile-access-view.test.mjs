import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  createLearnerProfileAccessView
} from '../../src/features/profile-access/view.js'
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
      remove: value => classes.delete(value),
      contains: value => classes.has(value)
    },
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value)
  }
}

function createHarness() {
  const elements = new Map([
    ['learnerProfileAccessGate', createElement()],
    ['learnerProfileAccessTitle', createElement()],
    ['learnerProfileAccessBody', createElement()],
    ['learnerProfileAccessStatus', createElement()],
    ['learnerProfileAccessRetry', createElement()],
    ['learnerProfileAccessSignOut', createElement()],
    ['learnerProfileAccessContinue', createElement()],
    ['learnerProfileAccessExport', createElement()],
    ['learnerProfileAccessDiscard', createElement()]
  ])
  const root = {
    documentElement: { dataset: {} },
    getElementById: id => elements.get(id) || null
  }
  return {
    elements,
    root,
    view: createLearnerProfileAccessView({
      root,
      translate: key => key
    })
  }
}

test('retryable profile access states expose neutral recovery controls', () => {
  const { elements, root, view } = createHarness()
  const retry = elements.get('learnerProfileAccessRetry')
  const signOut = elements.get('learnerProfileAccessSignOut')

  for (const status of ['waiting-cloud', 'recovering', 'conflicting']) {
    view.render({ status })
    assert.equal(root.documentElement.dataset.learnerProfileAccessState, status)
    assert.equal(retry.hidden, false)
    assert.equal(signOut.hidden, false)
  }

  for (const status of ['resolving', 'locked', 'waiting-authentication']) {
    view.render({ status })
    assert.equal(retry.hidden, true)
    assert.equal(signOut.hidden, true)
  }
})

test('active profile access hides the guarded surface and recovery controls', () => {
  const { elements, view } = createHarness()

  view.render({ status: 'recovering' })
  view.render({ status: 'active' })

  assert.equal(
    elements.get('learnerProfileAccessGate').classList.contains('hidden'),
    true
  )
  assert.equal(elements.get('learnerProfileAccessRetry').hidden, true)
  assert.equal(elements.get('learnerProfileAccessSignOut').hidden, true)
})

test('the guarded profile surface contains retry and safe sign-out controls', () => {
  assert.match(
    html,
    /id="learnerProfileAccessRetry"[^>]*data-profile-access-action="retry"[^>]*hidden/
  )
  assert.match(
    html,
    /id="learnerProfileAccessSignOut"[^>]*data-profile-access-action="sign-out"[^>]*hidden/
  )
})

test('the signed-out returning surface uses the protected-town message', () => {
  assert.equal(
    I18N.en['profileAccess.locked.title'],
    'Welcome back — sign in to continue your town.'
  )
})

test('account changes expose only actions that have protected the previous copy', () => {
  const { elements, root, view } = createHarness()
  const continueButton = elements.get('learnerProfileAccessContinue')
  const exportButton = elements.get('learnerProfileAccessExport')
  const discardButton = elements.get('learnerProfileAccessDiscard')
  const signOutButton = elements.get('learnerProfileAccessSignOut')

  view.render({
    replacement: { protectionStatus: 'synchronized' },
    status: 'account-change'
  })
  assert.equal(root.documentElement.dataset.learnerProfileAccessState, 'account-change')
  assert.equal(continueButton.hidden, false)
  assert.equal(exportButton.hidden, true)
  assert.equal(discardButton.hidden, true)
  assert.equal(signOutButton.hidden, false)
  assert.equal(
    elements.get('learnerProfileAccessBody').textContent,
    'profileAccess.accountChange.synchronized.body'
  )

  view.render({
    replacement: { protectionStatus: 'pending' },
    status: 'account-change'
  })
  assert.equal(continueButton.hidden, true)
  assert.equal(exportButton.hidden, false)
  assert.equal(discardButton.hidden, false)
  assert.equal(signOutButton.hidden, false)
  assert.equal(
    elements.get('learnerProfileAccessBody').textContent,
    'profileAccess.accountChange.pending.body'
  )
})
