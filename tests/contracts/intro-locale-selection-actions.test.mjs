import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindIntroLocaleSelectionActions
} from '../../src/features/onboarding/intro-locale-selection-actions.js'

const controlSelector = '[data-intro-locale-action]'

function createControl(actionName, value) {
  const control = new EventTarget()
  control.dataset = {
    introLocaleAction: actionName
  }
  control.value = value
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

test('intro locale-selection binding forwards only each control live value', () => {
  const intro = createControl('change-intro', 'en')
  const onboarding = createControl('change-onboarding', 'fr')
  const { root } = createHarness([intro, onboarding])
  const calls = []

  assert.equal(bindIntroLocaleSelectionActions(root, {
    changeIntro(...args) {
      calls.push(['intro', args])
      return false
    },
    changeOnboarding(...args) {
      calls.push(['onboarding', args])
      return false
    }
  }), 2)

  intro.value = 'zh-Hant'
  onboarding.value = 'es'
  const introEvent = new Event('change', {
    bubbles: true,
    cancelable: true
  })
  const onboardingEvent = new Event('change', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(intro.dispatchEvent(introEvent), true)
  assert.equal(onboarding.dispatchEvent(onboardingEvent), true)
  assert.deepEqual(calls, [
    ['intro', ['zh-Hant']],
    ['onboarding', ['es']]
  ])
  ;[introEvent, onboardingEvent].forEach(event => {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  })
})

test('intro locale-selection binding is idempotent and binds replacement controls', () => {
  const original = createControl('change-intro', 'en')
  const harness = createHarness([original])
  const calls = []
  const actions = {
    changeIntro(locale) {
      calls.push(['intro', locale])
    },
    changeOnboarding(locale) {
      calls.push(['onboarding', locale])
    }
  }

  assert.equal(bindIntroLocaleSelectionActions(harness.root, actions), 1)
  assert.equal(bindIntroLocaleSelectionActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('change'))

  const replacement = createControl('change-onboarding', 'fr')
  harness.replaceControls([original, replacement])
  assert.equal(bindIntroLocaleSelectionActions(harness.root, actions), 1)
  assert.equal(bindIntroLocaleSelectionActions(harness.root, actions), 0)
  replacement.dispatchEvent(new Event('change'))

  assert.deepEqual(calls, [
    ['intro', 'en'],
    ['onboarding', 'fr']
  ])
})

test('intro locale-selection binding ignores unknown values until they become supported', () => {
  const unknown = createControl('change-settings', 'fr')
  const harness = createHarness([unknown])
  const calls = []
  const actions = {
    changeIntro(locale) {
      calls.push(['intro', locale])
    },
    changeOnboarding(locale) {
      calls.push(['onboarding', locale])
    }
  }

  assert.equal(bindIntroLocaleSelectionActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('change'))
  assert.deepEqual(calls, [])

  unknown.dataset.introLocaleAction = 'change-onboarding'
  assert.equal(bindIntroLocaleSelectionActions(harness.root, actions), 1)
  assert.equal(bindIntroLocaleSelectionActions(harness.root, actions), 0)
  unknown.value = 'zh-Hans'
  unknown.dispatchEvent(new Event('change'))
  assert.deepEqual(calls, [['onboarding', 'zh-Hans']])
})

test('intro locale-selection binding tolerates missing controls', () => {
  const { root } = createHarness([])

  assert.equal(bindIntroLocaleSelectionActions(root, {
    changeIntro() {},
    changeOnboarding() {}
  }), 0)
})

test('intro locale-selection binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = {
    changeIntro() {},
    changeOnboarding() {}
  }

  assert.throws(
    () => bindIntroLocaleSelectionActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindIntroLocaleSelectionActions({}, validActions),
    /queryable root/
  )

  const invalidActionMaps = [
    null,
    {},
    { ...validActions, changeIntro: null },
    { ...validActions, changeOnboarding: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindIntroLocaleSelectionActions(root, actions),
      /changeIntro and changeOnboarding callbacks/
    )
  })
})
