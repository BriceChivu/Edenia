import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindIntroCityLevelActions
} from '../../src/features/onboarding/intro-city-level-actions.js'

const controlSelector = '[data-intro-city-level]'

function createControl(level) {
  const control = new EventTarget()
  control.dataset = {
    introCityLevel: level
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

test('intro city-level binding forwards exact numeric levels without cancelling clicks', () => {
  const levels = ['1', '4', '8', '12']
  const controls = levels.map(createControl)
  const { root } = createHarness(controls)
  const calls = []

  assert.equal(bindIntroCityLevelActions(root, {
    selectLevel(...args) {
      calls.push(args)
      return false
    }
  }), 4)

  const events = controls.map(control => {
    const event = new Event('click', {
      bubbles: true,
      cancelable: true
    })
    assert.equal(control.dispatchEvent(event), true)
    return event
  })

  assert.deepEqual(calls, [[1], [4], [8], [12]])
  events.forEach(event => {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  })
})

test('intro city-level binding is idempotent and binds replacement controls', () => {
  const original = createControl('1')
  const harness = createHarness([original])
  const calls = []
  const actions = {
    selectLevel(level) {
      calls.push(level)
    }
  }

  assert.equal(bindIntroCityLevelActions(harness.root, actions), 1)
  assert.equal(bindIntroCityLevelActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('click'))

  const replacement = createControl('12')
  harness.replaceControls([original, replacement])
  assert.equal(bindIntroCityLevelActions(harness.root, actions), 1)
  assert.equal(bindIntroCityLevelActions(harness.root, actions), 0)
  replacement.dispatchEvent(new Event('click'))

  assert.deepEqual(calls, [1, 12])
})

test('intro city-level binding ignores unknown values until they become supported', () => {
  const unknown = createControl('2')
  const malformed = createControl('04')
  const harness = createHarness([unknown, malformed])
  const calls = []
  const actions = {
    selectLevel(level) {
      calls.push(level)
    }
  }

  assert.equal(bindIntroCityLevelActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('click'))
  malformed.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [])

  unknown.dataset.introCityLevel = '8'
  assert.equal(bindIntroCityLevelActions(harness.root, actions), 1)
  assert.equal(bindIntroCityLevelActions(harness.root, actions), 0)
  unknown.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [8])
})

test('intro city-level binding tolerates missing controls', () => {
  const { root } = createHarness([])

  assert.equal(bindIntroCityLevelActions(root, {
    selectLevel() {}
  }), 0)
})

test('intro city-level binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()

  assert.throws(
    () => bindIntroCityLevelActions(null, { selectLevel() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindIntroCityLevelActions({}, { selectLevel() {} }),
    /queryable root/
  )

  const invalidActionMaps = [
    null,
    {},
    { selectLevel: null }
  ]
  invalidActionMaps.forEach(actions => {
    assert.throws(
      () => bindIntroCityLevelActions(root, actions),
      /selectLevel callback/
    )
  })
})
