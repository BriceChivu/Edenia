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

test('personalized onboarding binding forwards live language, level, step, and channel values plus zero-argument Continue', () => {
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
  const channel = createControl('toggle-channel', {
    catalogId: 'channel-before'
  })
  const { root } = createHarness([
    language,
    continueLanguage,
    level,
    step,
    channel
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
    },
    toggleChannel(...args) {
      calls.push(['toggleChannel', args])
      return false
    }
  }), 5)

  language.dataset.languageId = 'zh-Hant'
  level.dataset.levelId = 'advanced'
  step.dataset.personalizedOnboardingStep = 'channels'
  channel.dataset.catalogId = 'channel-live'
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
  const channelEvent = new Event('click', {
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
  assert.equal(channel.dispatchEvent(channelEvent), true)
  assert.deepEqual(calls, [
    ['selectLanguage', ['zh-Hant']],
    ['continueFromLanguage', []],
    ['selectLevel', ['advanced']],
    ['setStep', ['channels']],
    ['toggleChannel', ['channel-live']]
  ])
  ;[
    languageEvent,
    continueEvent,
    levelEvent,
    stepEvent,
    channelEvent
  ].forEach(event => {
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
    },
    toggleChannel(catalogId) {
      calls.push(['toggleChannel', catalogId])
    }
  }

  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 1)
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('click'))

  const replacement = createControl('toggle-channel', {
    catalogId: 'replacement-channel'
  })
  harness.replaceControls([original, replacement])
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 1)
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 0)
  replacement.dispatchEvent(new Event('click'))

  assert.deepEqual(calls, [
    ['selectLanguage', 'japanese'],
    ['toggleChannel', 'replacement-channel']
  ])
})

test('personalized onboarding binding ignores unknown actions until supported', () => {
  const unknown = createControl('finish', {
    catalogId: 'promoted-channel'
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
    },
    toggleChannel(catalogId) {
      calls.push(['toggleChannel', catalogId])
    }
  }

  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [])

  unknown.dataset.personalizedOnboardingAction = 'toggle-channel'
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 1)
  assert.equal(bindPersonalizedOnboardingActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [['toggleChannel', 'promoted-channel']])
})

test('personalized onboarding binding tolerates missing controls', () => {
  const { root } = createHarness([])

  assert.equal(bindPersonalizedOnboardingActions(root, {
    selectLanguage() {},
    continueFromLanguage() {},
    selectLevel() {},
    setStep() {},
    toggleChannel() {}
  }), 0)
})

test('personalized onboarding binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = {
    selectLanguage() {},
    continueFromLanguage() {},
    selectLevel() {},
    setStep() {},
    toggleChannel() {}
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
    { ...validActions, setStep: null },
    { ...validActions, toggleChannel: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindPersonalizedOnboardingActions(root, actions),
      /selectLanguage, continueFromLanguage, selectLevel, setStep, and toggleChannel callbacks/
    )
  })
})
