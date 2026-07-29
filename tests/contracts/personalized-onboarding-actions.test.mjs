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

test('personalized onboarding binding forwards live language, level, and step values plus zero-argument Continue', () => {
  const language = createControl('select-language', {
    languageId: 'mandarin'
  })
  const continueLanguage = createControl('continue-language')
  const level = createControl('select-level', {
    levelId: 'beginner'
  })
  const step = createControl('set-step', {
    personalizedOnboardingStep: 'level'
  })
  const { root } = createHarness([
    language,
    continueLanguage,
    level,
    step
  ])
  const calls = []

  assert.equal(bindPersonalizedOnboardingActions(root, {
    selectLanguage(...args) {
      calls.push(['selectLanguage', args])
      return false
    },
    continueFromLanguage(...args) {
      calls.push(['continueFromLanguage', args])
      return Promise.resolve('ignored')
    },
    selectLevel(...args) {
      calls.push(['selectLevel', args])
      return false
    },
    setStep(...args) {
      calls.push(['setStep', args])
      return false
    }
  }), 4)

  language.dataset.languageId = 'zh-Hant'
  level.dataset.levelId = 'advanced'
  step.dataset.personalizedOnboardingStep = 'channels'
  const languageEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const continueEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const levelEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const stepEvent = new Event('click', {
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
  assert.equal(level.dispatchEvent(levelEvent), true)
  assert.deepEqual(calls, [
    ['selectLanguage', ['zh-Hant']],
    ['continueFromLanguage', []],
    ['selectLevel', ['advanced']]
  ])
  assert.equal(step.dispatchEvent(stepEvent), true)
  assert.deepEqual(calls, [
    ['selectLanguage', ['zh-Hant']],
    ['continueFromLanguage', []],
    ['selectLevel', ['advanced']],
    ['setStep', ['channels']]
  ])
  ;[languageEvent, continueEvent, levelEvent, stepEvent].forEach(event => {
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
    },
    selectLevel(levelId) {
      calls.push(['selectLevel', levelId])
    },
    setStep(stepName) {
      calls.push(['setStep', stepName])
    }
  }

  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 1)
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('click'))

  const replacement = createControl('set-step', {
    personalizedOnboardingStep: 'language'
  })
  harness.replaceControls([original, replacement])
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 1)
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 0)
  replacement.dispatchEvent(new Event('click'))

  assert.deepEqual(calls, [
    ['selectLanguage', 'japanese'],
    ['setStep', 'language']
  ])
})

test('personalized onboarding binding ignores unknown actions until supported', () => {
  const unknown = createControl('toggle-channel', {
    personalizedOnboardingStep: 'level'
  })
  const harness = createHarness([unknown])
  const calls = []
  const actions = {
    selectLanguage(languageId) {
      calls.push(['selectLanguage', languageId])
    },
    continueFromLanguage() {
      calls.push(['continueFromLanguage'])
    },
    selectLevel(levelId) {
      calls.push(['selectLevel', levelId])
    },
    setStep(stepName) {
      calls.push(['setStep', stepName])
    }
  }

  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [])

  unknown.dataset.personalizedOnboardingAction = 'set-step'
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 1)
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [['setStep', 'level']])
})

test('personalized onboarding binding tolerates missing controls', () => {
  const { root } = createHarness([])

  assert.equal(bindPersonalizedOnboardingActions(root, {
    selectLanguage() {},
    continueFromLanguage() {},
    selectLevel() {},
    setStep() {}
  }), 0)
})

test('personalized onboarding binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = {
    selectLanguage() {},
    continueFromLanguage() {},
    selectLevel() {},
    setStep() {}
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
    { ...validActions, continueFromLanguage: null },
    { ...validActions, selectLevel: null },
    { ...validActions, setStep: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindPersonalizedOnboardingActions(root, actions),
      /selectLanguage, continueFromLanguage, selectLevel, and setStep callbacks/
    )
  })
})
