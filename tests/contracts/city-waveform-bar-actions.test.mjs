import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindCityWaveformBarActions
} from '../../src/features/city/waveform-bar-actions.js'

function createBar(id) {
  const bar = new EventTarget()
  bar.id = id
  return bar
}

function createHarness(initialBars = []) {
  let bars = initialBars
  return {
    root: {
      querySelectorAll(selector) {
        assert.equal(selector, '[data-city-wave-action="select"]')
        return bars
      }
    },
    replaceBars(nextBars) {
      bars = nextBars
    }
  }
}

test('city waveform bar binding preserves exact direct event calls', () => {
  const first = createBar('first')
  const second = createBar('second')
  const { root } = createHarness([first, second])
  const calls = []
  assert.equal(bindCityWaveformBarActions(root, {
    select(...args) {
      calls.push(['select', args])
    },
    preview(...args) {
      calls.push(['preview', args])
    }
  }), 2)

  const events = [
    ['mouseenter', first],
    ['mousemove', first],
    ['focus', first],
    ['click', first],
    ['click', second]
  ].map(([eventName, bar]) => {
    const event = new Event(eventName, { cancelable: true })
    assert.equal(bar.dispatchEvent(event), true)
    return event
  })

  assert.deepEqual(calls, [
    ['preview', [first]],
    ['preview', [first]],
    ['preview', [first]],
    ['select', [first]],
    ['select', [second]]
  ])
  events.forEach(event => {
    assert.equal(event.defaultPrevented, false)
  })
})

test('city waveform bar binding is idempotent and binds replacement bars', () => {
  const original = createBar('original')
  const replacement = createBar('replacement')
  const harness = createHarness([original])
  const calls = []
  const actions = {
    select(bar) {
      calls.push(['select', bar.id])
    },
    preview(bar) {
      calls.push(['preview', bar.id])
    }
  }

  assert.equal(bindCityWaveformBarActions(harness.root, actions), 1)
  assert.equal(bindCityWaveformBarActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('click'))

  harness.replaceBars([replacement])
  assert.equal(bindCityWaveformBarActions(harness.root, actions), 1)
  replacement.dispatchEvent(new Event('focus'))
  replacement.dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [
    ['select', 'original'],
    ['preview', 'replacement'],
    ['select', 'replacement']
  ])

  harness.replaceBars([])
  assert.equal(bindCityWaveformBarActions(harness.root, actions), 0)
})

test('city waveform bar binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindCityWaveformBarActions(null, {
      select() {},
      preview() {}
    }),
    /queryable root/
  )
  assert.throws(
    () => bindCityWaveformBarActions(root, { select() {} }),
    /select and preview callbacks/
  )
})
