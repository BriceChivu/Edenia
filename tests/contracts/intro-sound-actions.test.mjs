import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindIntroSoundActions
} from '../../src/features/onboarding/intro-sound-actions.js'

const controlSelector = '[data-intro-sound-toggle]'

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

test('intro sound binding invokes both controls with uncancelled zero-argument calls', () => {
  const introSound = new EventTarget()
  const onboardingSound = new EventTarget()
  const { root } = createHarness([introSound, onboardingSound])
  const calls = []

  assert.equal(bindIntroSoundActions(root, {
    toggle(...args) {
      calls.push(args)
      return Promise.resolve('ignored')
    }
  }), 2)

  const introEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const onboardingEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(introSound.dispatchEvent(introEvent), true)
  assert.equal(onboardingSound.dispatchEvent(onboardingEvent), true)
  assert.deepEqual(calls, [[], []])
  ;[introEvent, onboardingEvent].forEach(event => {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  })
})

test('intro sound binding is idempotent and binds replacement controls', () => {
  const original = new EventTarget()
  const harness = createHarness([original])
  const calls = []
  const actions = {
    toggle() {
      calls.push('toggle')
    }
  }

  assert.equal(bindIntroSoundActions(harness.root, actions), 1)
  assert.equal(bindIntroSoundActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('click'))

  const replacement = new EventTarget()
  harness.replaceControls([original, replacement])
  assert.equal(bindIntroSoundActions(harness.root, actions), 1)
  assert.equal(bindIntroSoundActions(harness.root, actions), 0)
  replacement.dispatchEvent(new Event('click'))

  assert.deepEqual(calls, ['toggle', 'toggle'])
})

test('intro sound binding tolerates missing controls', () => {
  const { root } = createHarness([])
  const calls = []

  assert.equal(bindIntroSoundActions(root, {
    toggle() {
      calls.push('toggle')
    }
  }), 0)
  assert.deepEqual(calls, [])
})

test('intro sound binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()

  assert.throws(
    () => bindIntroSoundActions(null, { toggle() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindIntroSoundActions({}, { toggle() {} }),
    /queryable root/
  )

  const invalidActionMaps = [
    null,
    {},
    { toggle: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindIntroSoundActions(root, actions),
      /toggle callback/
    )
  })
})
