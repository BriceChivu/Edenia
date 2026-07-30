import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindIntroLocaleMenuActions
} from '../../src/features/onboarding/intro-locale-menu-actions.js'

const controlSelector = '[data-intro-locale-menu-action]'

function createControl(actionName) {
  return {
    dataset: {
      introLocaleMenuAction: actionName
    },
    listener: null,
    addEventListener(type, listener) {
      assert.equal(type, 'click')
      this.listener = listener
    },
    click(event) {
      return this.listener?.(event)
    }
  }
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

function createClickEvent() {
  const state = {
    defaultPrevented: false,
    propagationStopped: false
  }
  return {
    event: {
      preventDefault() {
        state.defaultPrevented = true
      },
      stopPropagation() {
        state.propagationStopped = true
      }
    },
    state
  }
}

test('intro locale-menu binding forwards exact events to propagation-stopping callbacks', () => {
  const intro = createControl('toggle-intro')
  const onboarding = createControl('toggle-onboarding')
  const { root } = createHarness([intro, onboarding])
  const calls = []

  assert.equal(bindIntroLocaleMenuActions(root, {
    toggleIntro(event, ...extra) {
      calls.push(['intro', event, extra])
      event.stopPropagation()
      return false
    },
    toggleOnboarding(event, ...extra) {
      calls.push(['onboarding', event, extra])
      event.stopPropagation()
      return false
    }
  }), 2)

  const introClick = createClickEvent()
  const onboardingClick = createClickEvent()
  assert.equal(intro.click(introClick.event), undefined)
  assert.equal(onboarding.click(onboardingClick.event), undefined)

  assert.deepEqual(calls, [
    ['intro', introClick.event, []],
    ['onboarding', onboardingClick.event, []]
  ])
  ;[introClick.state, onboardingClick.state].forEach(state => {
    assert.equal(state.defaultPrevented, false)
    assert.equal(state.propagationStopped, true)
  })
})

test('intro locale-menu binding is idempotent and binds replacement controls', () => {
  const original = createControl('toggle-intro')
  const harness = createHarness([original])
  const calls = []
  const actions = {
    toggleIntro() {
      calls.push('intro')
    },
    toggleOnboarding() {
      calls.push('onboarding')
    }
  }

  assert.equal(bindIntroLocaleMenuActions(harness.root, actions), 1)
  assert.equal(bindIntroLocaleMenuActions(harness.root, actions), 0)
  original.click({})

  const replacement = createControl('toggle-onboarding')
  harness.replaceControls([original, replacement])
  assert.equal(bindIntroLocaleMenuActions(harness.root, actions), 1)
  assert.equal(bindIntroLocaleMenuActions(harness.root, actions), 0)
  replacement.click({})

  assert.deepEqual(calls, ['intro', 'onboarding'])
})

test('intro locale-menu binding ignores unknown values until they become supported', () => {
  const unknown = createControl('toggle-settings')
  const harness = createHarness([unknown])
  const calls = []
  const actions = {
    toggleIntro() {
      calls.push('intro')
    },
    toggleOnboarding() {
      calls.push('onboarding')
    }
  }

  assert.equal(bindIntroLocaleMenuActions(harness.root, actions), 0)
  unknown.click({})
  assert.deepEqual(calls, [])

  unknown.dataset.introLocaleMenuAction = 'toggle-intro'
  assert.equal(bindIntroLocaleMenuActions(harness.root, actions), 1)
  assert.equal(bindIntroLocaleMenuActions(harness.root, actions), 0)
  unknown.click({})
  assert.deepEqual(calls, ['intro'])
})

test('intro locale-menu binding tolerates missing controls', () => {
  const { root } = createHarness([])

  assert.equal(bindIntroLocaleMenuActions(root, {
    toggleIntro() {},
    toggleOnboarding() {}
  }), 0)
})

test('intro locale-menu binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  const validActions = {
    toggleIntro() {},
    toggleOnboarding() {}
  }

  assert.throws(
    () => bindIntroLocaleMenuActions(null, validActions),
    /queryable root/
  )
  assert.throws(
    () => bindIntroLocaleMenuActions({}, validActions),
    /queryable root/
  )

  const invalidActionMaps = [
    null,
    {},
    { ...validActions, toggleIntro: null },
    { ...validActions, toggleOnboarding: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindIntroLocaleMenuActions(root, actions),
      /toggleIntro and toggleOnboarding callbacks/
    )
  })
})
