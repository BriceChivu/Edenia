import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindCityWaveformMouseActions
} from '../../src/features/city/waveform-mouse-actions.js'

const selector = '[data-city-waveform-action="mouse-preview"]'

function createHarness(includeWaveform = true) {
  const waveform = includeWaveform ? new EventTarget() : null
  const root = {
    querySelector(candidate) {
      assert.equal(candidate, selector)
      return waveform
    }
  }
  return { root, waveform }
}

test('city waveform binding preserves exact mouse events and arguments', () => {
  const { root, waveform } = createHarness()
  const calls = []
  assert.equal(bindCityWaveformMouseActions(root, {
    move(...args) {
      calls.push(['move', args])
    },
    clear(...args) {
      calls.push(['clear', args])
    }
  }), 1)

  const enterEvent = new Event('mouseenter', { cancelable: true })
  const moveEvent = new Event('mousemove', { cancelable: true })
  const leaveEvent = new Event('mouseleave', { cancelable: true })
  assert.equal(waveform.dispatchEvent(enterEvent), true)
  assert.equal(waveform.dispatchEvent(moveEvent), true)
  assert.equal(waveform.dispatchEvent(leaveEvent), true)

  assert.deepEqual(calls, [
    ['move', [enterEvent]],
    ['move', [moveEvent]],
    ['clear', []]
  ])
  assert.equal(enterEvent.defaultPrevented, false)
  assert.equal(moveEvent.defaultPrevented, false)
  assert.equal(leaveEvent.defaultPrevented, false)
})

test('city waveform binding is idempotent and tolerates an absent waveform', () => {
  const { root, waveform } = createHarness()
  const calls = []
  const actions = {
    move(event) {
      calls.push(event.type)
    },
    clear() {
      calls.push('clear')
    }
  }

  assert.equal(bindCityWaveformMouseActions(root, actions), 1)
  assert.equal(bindCityWaveformMouseActions(root, actions), 0)
  waveform.dispatchEvent(new Event('mousemove'))
  waveform.dispatchEvent(new Event('mouseleave'))
  assert.deepEqual(calls, ['mousemove', 'clear'])

  assert.equal(bindCityWaveformMouseActions(
    createHarness(false).root,
    actions
  ), 0)
})

test('city waveform binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindCityWaveformMouseActions(null, { move() {}, clear() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindCityWaveformMouseActions(root, { move() {} }),
    /move and clear callbacks/
  )
})
