import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindOnboardingRecoveryActions
} from '../../src/features/onboarding/onboarding-recovery-actions.js'

const controlSelector = '[data-onboarding-recovery-action]'

function createControl(actionName) {
  const control = new EventTarget()
  control.dataset = {
    onboardingRecoveryAction: actionName
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

test('onboarding recovery binding synchronously forwards only each exact live control', () => {
  const copyLink = createControl('copy-link')
  const retry = createControl('retry')
  const { root } = createHarness([copyLink, retry])
  const calls = []

  assert.equal(bindOnboardingRecoveryActions(root, {
    copyLink(...args) {
      calls.push(['copyLink', args])
      return Promise.resolve('ignored')
    },
    retry(...args) {
      calls.push(['retry', args])
      return false
    }
  }), 2)

  const copyEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const retryEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(copyLink.dispatchEvent(copyEvent), true)
  assert.deepEqual(calls, [['copyLink', [copyLink]]])
  assert.equal(retry.dispatchEvent(retryEvent), true)
  assert.deepEqual(calls, [
    ['copyLink', [copyLink]],
    ['retry', [retry]]
  ])
  ;[copyEvent, retryEvent].forEach(event => {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  })
})

test('onboarding recovery binding is idempotent and binds replacement controls', () => {
  const original = createControl('copy-link')
  const harness = createHarness([original])
  const calls = []
  const actions = {
    copyLink(control) {
      calls.push(['copyLink', control])
    },
    retry(control) {
      calls.push(['retry', control])
    }
  }

  assert.equal(bindOnboardingRecoveryActions(harness.root, actions), 1)
  assert.equal(bindOnboardingRecoveryActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('click'))

  const replacement = createControl('retry')
  harness.replaceControls([original, replacement])
  assert.equal(bindOnboardingRecoveryActions(harness.root, actions), 1)
  assert.equal(bindOnboardingRecoveryActions(harness.root, actions), 0)
  replacement.dispatchEvent(new Event('click'))

  assert.deepEqual(calls, [
    ['copyLink', original],
    ['retry', replacement]
  ])
})

test('onboarding recovery binding ignores unknown actions until they become supported', () => {
  const unknown = createControl('dismiss')
  const harness = createHarness([unknown])
  const calls = []
  const actions = {
    copyLink(control) {
      calls.push(['copyLink', control])
    },
    retry(control) {
      calls.push(['retry', control])
    }
  }

  assert.equal(bindOnboardingRecoveryActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [])

  unknown.dataset.onboardingRecoveryAction = 'copy-link'
  assert.equal(bindOnboardingRecoveryActions(harness.root, actions), 1)
  assert.equal(bindOnboardingRecoveryActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [['copyLink', unknown]])
})

test('onboarding recovery binding tolerates missing controls', () => {
  const { root } = createHarness([])

  assert.equal(bindOnboardingRecoveryActions(root, {
    copyLink() {},
    retry() {}
  }), 0)
})

test('onboarding recovery binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = {
    copyLink() {},
    retry() {}
  }

  assert.throws(
    () => bindOnboardingRecoveryActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindOnboardingRecoveryActions({}, validActions),
    /queryable root/
  )

  const invalidActionMaps = [
    null,
    {},
    { ...validActions, copyLink: null },
    { ...validActions, retry: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindOnboardingRecoveryActions(root, actions),
      /copyLink and retry callbacks/
    )
  })
})
