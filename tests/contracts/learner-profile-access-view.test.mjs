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
    children: [],
    dataset: {},
    textContent: '',
    append(...children) {
      this.children.push(...children)
    },
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value)
    },
    getAttribute: name => attributes.get(name) ?? null,
    replaceChildren(...children) {
      this.children = children
    },
    setAttribute: (name, value) => attributes.set(name, value)
  }
}

function createHarness(viewOptions = {}) {
  const elements = new Map([
    ['learnerProfileAccessGate', createElement()],
    ['learnerProfileAccessTitle', createElement()],
    ['learnerProfileAccessBody', createElement()],
    ['learnerProfileAccessStatus', createElement()],
    ['learnerProfileOpeningNotice', createElement()],
    ['learnerProfileOpeningProtection', createElement()],
    ['learnerProfileOpeningStatus', createElement()],
    ['learnerProfileAccessOpenSignIn', createElement()],
    ['learnerProfileAccessRetry', createElement()],
    ['learnerProfileAccessSignOut', createElement()],
    ['learnerProfileAccessContinue', createElement()],
    ['learnerProfileAccessExport', createElement()],
    ['learnerProfileAccessDiscard', createElement()],
    ['learnerProfileRecovery', createElement()],
    ['learnerProfileRecoveryList', createElement()],
    ['learnerProfileRecoveryEmpty', createElement()],
    ['learnerProfileRecoveryFeedback', createElement()]
  ])
  const root = {
    createElement: () => createElement(),
    documentElement: { dataset: {} },
    getElementById: id => elements.get(id) || null
  }
  return {
    elements,
    root,
    view: createLearnerProfileAccessView({
      root,
      translate: key => key,
      ...viewOptions
    })
  }
}

test('fast profile opening stays non-modal until activation', () => {
  const timers = []
  const { elements, root, view } = createHarness({
    openingStatusPresentationDelayMs: 250,
    clearTimer(timerId) {
      const timer = timers[timerId - 1]
      if (timer) timer.cleared = true
    },
    setTimer(callback, delay) {
      timers.push({ callback, cleared: false, delay })
      return timers.length
    }
  })
  const gate = elements.get('learnerProfileAccessGate')

  view.render({ status: 'resolving' })
  assert.equal(root.documentElement.dataset.learnerProfileAccessState, 'resolving')
  assert.equal(gate.classList.contains('hidden'), true)
  assert.equal(timers.length, 1)
  assert.equal(timers[0].delay, 250)
  assert.equal(
    elements.get('learnerProfileOpeningNotice').classList.contains('hidden'),
    false
  )
  assert.equal(
    elements.get('learnerProfileOpeningNotice').classList.contains('sr-only'),
    true
  )

  view.render({ status: 'waiting-cloud' })
  assert.equal(root.documentElement.dataset.learnerProfileAccessState, 'waiting-cloud')
  assert.equal(gate.classList.contains('hidden'), true)
  assert.equal(timers.length, 1)

  view.render({ status: 'active' })
  timers[0].callback()
  assert.equal(gate.classList.contains('hidden'), true)
  assert.equal(
    elements.get('learnerProfileOpeningNotice').classList.contains('hidden'),
    true
  )
})

test('a slow profile opening reveals its compact status after the quiet delay', () => {
  const timers = []
  const { elements, view } = createHarness({
    openingStatusPresentationDelayMs: 250,
    clearTimer() {},
    setTimer(callback, delay) {
      timers.push({ callback, delay })
      return timers.length
    }
  })
  const gate = elements.get('learnerProfileAccessGate')
  const notice = elements.get('learnerProfileOpeningNotice')

  view.render({ status: 'waiting-cloud' })
  assert.equal(gate.classList.contains('hidden'), true)
  assert.equal(notice.classList.contains('hidden'), false)
  assert.equal(notice.classList.contains('sr-only'), true)
  timers[0].callback()
  assert.equal(gate.classList.contains('hidden'), true)
  assert.equal(notice.classList.contains('sr-only'), false)
})

test('opening progress stays automatic while genuine recovery keeps an escape', () => {
  const { elements, root, view } = createHarness()
  const openSignIn = elements.get('learnerProfileAccessOpenSignIn')
  const retry = elements.get('learnerProfileAccessRetry')
  const signOut = elements.get('learnerProfileAccessSignOut')

  view.render({ status: 'waiting-cloud' })
  assert.equal(root.documentElement.dataset.learnerProfileAccessState, 'waiting-cloud')
  assert.equal(
    elements.get('learnerProfileAccessGate').classList.contains('hidden'),
    true
  )
  assert.equal(
    elements.get('learnerProfileOpeningNotice').classList.contains('hidden'),
    false
  )
  assert.equal(openSignIn.hidden, true)
  assert.equal(retry.hidden, true)
  assert.equal(signOut.hidden, true)

  view.render({ status: 'recovering' })
  assert.equal(retry.hidden, false)
  assert.equal(retry.textContent, 'profileAccess.recovering.continue')
  assert.equal(signOut.hidden, true)

  for (const accessState of [{
    recovery: { candidates: [], reason: 'current-head-missing' },
    status: 'recovering'
  }, { status: 'conflicting' }]) {
    view.render(accessState)
    assert.equal(retry.hidden, false)
    assert.equal(retry.textContent, 'migration.action.retry')
    assert.equal(signOut.hidden, false)
  }

  view.render({ status: 'resolving' })
  assert.equal(openSignIn.hidden, true)
  assert.equal(retry.hidden, true)
  assert.equal(signOut.hidden, true)

  for (const status of ['locked', 'waiting-authentication']) {
    view.render({ status })
    assert.equal(openSignIn.hidden, false)
    assert.equal(retry.hidden, true)
    assert.equal(signOut.hidden, true)
  }
})

test('opening progress shows protection and progress-ready status in order', () => {
  const { elements, view } = createHarness({
    translate: key => I18N.en[key]
  })

  view.render({ status: 'waiting-cloud' })

  assert.equal(
    elements.get('learnerProfileOpeningProtection').textContent,
    'Private learner content stays hidden until the active profile is ready.'
  )
  assert.equal(
    elements.get('learnerProfileOpeningStatus').textContent,
    'Getting your progress ready…'
  )
  assert.equal(
    elements.get('learnerProfileOpeningNotice').classList.contains('hidden'),
    false
  )
  assert.equal(
    elements.get('learnerProfileOpeningNotice').classList.contains('sr-only'),
    false
  )
  assert.equal(
    elements.get('learnerProfileAccessGate').classList.contains('hidden'),
    true
  )
})

test('active profile access hides the guarded surface and recovery controls', () => {
  const { elements, view } = createHarness()

  view.render({ status: 'recovering' })
  view.render({ status: 'active' })

  assert.equal(
    elements.get('learnerProfileAccessGate').classList.contains('hidden'),
    true
  )
  assert.equal(elements.get('learnerProfileAccessOpenSignIn').hidden, true)
  assert.equal(elements.get('learnerProfileAccessRetry').hidden, true)
  assert.equal(elements.get('learnerProfileAccessSignOut').hidden, true)
  assert.equal(
    elements.get('learnerProfileOpeningNotice').classList.contains('hidden'),
    true
  )
})

test('the guarded profile surface contains authentication, retry, and safe sign-out controls', () => {
  assert.match(html, /id="mainApp"[^>]*tabindex="-1"/)
  assert.match(
    html,
    /id="learnerProfileAccessGate"[^>]*role="dialog"[^>]*tabindex="-1"/
  )
  assert.match(
    html,
    /id="learnerProfileAccessOpenSignIn"[^>]*data-profile-access-action="open-sign-in"[^>]*hidden/
  )
  assert.match(
    html,
    /id="learnerProfileAccessAuthentication"[^>]*aria-labelledby="learnerProfileAccessAuthenticationTitle"/
  )
  assert.match(
    html,
    /data-profile-access-action="close-sign-in"[^>]*data-i18n="profileAccess\.authentication\.back"/
  )
  assert.match(
    html,
    /id="learnerProfileAccessRetry"[^>]*data-profile-access-action="retry"[^>]*hidden/
  )
  assert.match(
    html,
    /id="learnerProfileAccessSignOut"[^>]*data-profile-access-action="sign-out"[^>]*hidden/
  )
  assert.match(
    html,
    /id="learnerProfileOpeningNotice"[^>]*aria-atomic="true"/
  )
  assert.match(
    html,
    /id="learnerProfileOpeningProtection"[^>]*data-i18n="profileAccess\.opening\.protected"/
  )
  assert.match(
    html,
    /id="learnerProfileOpeningStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*data-i18n="profileAccess\.opening\.status"/
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
  assert.equal(
    root.documentElement.dataset.learnerProfileAccessState,
    'account-change'
  )
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

test('missing-head recovery explains only local and protected sources', () => {
  const { elements, view } = createHarness()

  view.render({
    recovery: {
      candidates: [{ id: 'local', source: 'local' }, {
        id: '523e4567-e89b-42d3-a456-426614174004',
        protectedUntil: Date.parse('2026-09-21T00:00:00.000Z'),
        source: 'protected'
      }],
      reason: 'current-head-missing'
    },
    status: 'recovering'
  })

  assert.equal(
    elements.get('learnerProfileAccessTitle').textContent,
    'profileAccess.missingHead.title'
  )
  assert.equal(
    elements.get('learnerProfileRecovery').classList.contains('hidden'),
    false
  )
  const items = elements.get('learnerProfileRecoveryList').children
  assert.equal(items.length, 2)
  assert.equal(items[0].children[0].textContent, 'profileAccess.recovery.local')
  assert.equal(
    items[1].children[0].textContent,
    'profileAccess.recovery.protected'
  )
  assert.deepEqual(items.map(item => item.children.slice(1).map(button => ({
    action: button.dataset.profileRecoveryAction,
    candidateId: button.dataset.recoveryCandidateId,
    text: button.textContent
  }))), [[{
    action: 'restore',
    candidateId: 'local',
    text: 'profileAccess.recovery.restore'
  }, {
    action: 'export',
    candidateId: 'local',
    text: 'profileAccess.recovery.export'
  }], [{
    action: 'restore',
    candidateId: '523e4567-e89b-42d3-a456-426614174004',
    text: 'profileAccess.recovery.restore'
  }, {
    action: 'export',
    candidateId: '523e4567-e89b-42d3-a456-426614174004',
    text: 'profileAccess.recovery.export'
  }]])
})

test('missing-head recovery with no usable candidate keeps retry and sign-out available', () => {
  const { elements, view } = createHarness()

  view.render({
    recovery: {
      candidates: [],
      feedback: 'restore-failed',
      reason: 'current-head-missing'
    },
    status: 'recovering'
  })

  assert.equal(elements.get('learnerProfileRecoveryEmpty').hidden, false)
  assert.equal(
    elements.get('learnerProfileRecoveryEmpty').textContent,
    'profileAccess.recovery.none'
  )
  assert.equal(
    elements.get('learnerProfileRecoveryFeedback').textContent,
    'profileAccess.recovery.restoreFailed'
  )
  assert.equal(elements.get('learnerProfileAccessRetry').hidden, false)
  assert.equal(elements.get('learnerProfileAccessSignOut').hidden, false)
})

test('an unusable current head has distinct guarded recovery copy', () => {
  const { elements, view } = createHarness()

  view.render({
    recovery: {
      candidates: [{ id: 'local', source: 'local' }],
      reason: 'current-head-unusable'
    },
    status: 'recovering'
  })

  assert.equal(
    elements.get('learnerProfileAccessBody').textContent,
    'profileAccess.unusableHead.body'
  )
  assert.equal(
    elements.get('learnerProfileRecovery').classList.contains('hidden'),
    false
  )
})
