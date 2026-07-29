import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindPersonalizedOnboardingActions
} from '../../src/features/onboarding/personalized-onboarding-actions.js'

const controlSelector = '[data-personalized-onboarding-action]'

function createControl(actionName, dataset = {}) {
  const control = new EventTarget()
  control.dataset = {
    personalizedOnboardingAction: actionName,
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

test('personalized onboarding binding forwards a live language and zero-argument Continue', () => {
  const language = createControl('select-language', {
    languageId: 'mandarin'
  })
  const continueLanguage = createControl('continue-language')
  const { root } = createHarness([language, continueLanguage])
  const calls = []

  assert.equal(bindPersonalizedOnboardingActions(root, {
    selectLanguage(...args) {
      calls.push(['selectLanguage', args])
      return false
    },
    continueFromLanguage(...args) {
      calls.push(['continueFromLanguage', args])
      return Promise.resolve('ignored')
    }
  }), 2)

  language.dataset.languageId = 'zh-Hant'
  const languageEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const continueEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(language.dispatchEvent(languageEvent), true)
  assert.deepEqual(calls, [
    ['selectLanguage', ['zh-Hant']]
  ])
  assert.equal(continueLanguage.dispatchEvent(continueEvent), true)
  assert.deepEqual(calls, [
    ['selectLanguage', ['zh-Hant']],
    ['continueFromLanguage', []]
  ])
  ;[languageEvent, continueEvent].forEach(event => {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  })
})

test('personalized onboarding binding is idempotent and binds replacement controls', () => {
  const original = createControl('select-language', {
    languageId: 'japanese'
  })
  const harness = createHarness([original])
  const calls = []
  const actions = {
    selectLanguage(languageId) {
      calls.push(['selectLanguage', languageId])
    },
    continueFromLanguage() {
      calls.push(['continueFromLanguage'])
    }
  }

  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 1)
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('click'))

  const replacement = createControl('continue-language')
  harness.replaceControls([original, replacement])
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 1)
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 0)
  replacement.dispatchEvent(new Event('click'))

  assert.deepEqual(calls, [
    ['selectLanguage', 'japanese'],
    ['continueFromLanguage']
  ])
})

test('personalized onboarding binding ignores unknown actions until supported', () => {
  const unknown = createControl('select-level', {
    languageId: 'french'
  })
  const harness = createHarness([unknown])
  const calls = []
  const actions = {
    selectLanguage(languageId) {
      calls.push(['selectLanguage', languageId])
    },
    continueFromLanguage() {
      calls.push(['continueFromLanguage'])
    }
  }

  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [])

  unknown.dataset.personalizedOnboardingAction = 'select-language'
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 1)
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [['selectLanguage', 'french']])
})

test('personalized onboarding binding tolerates missing controls', () => {
  const { root } = createHarness([])

  assert.equal(bindPersonalizedOnboardingActions(root, {
    selectLanguage() {},
    continueFromLanguage() {}
  }), 0)
})

test('personalized onboarding binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = {
    selectLanguage() {},
    continueFromLanguage() {}
  }

  assert.throws(
    () => bindPersonalizedOnboardingActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindPersonalizedOnboardingActions({}, validActions),
    /queryable root/
  )

  const invalidActionMaps = [
    null,
    {},
    { ...validActions, selectLanguage: null },
    { ...validActions, continueFromLanguage: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindPersonalizedOnboardingActions(root, actions),
      /selectLanguage and continueFromLanguage callbacks/
    )
  })
})
