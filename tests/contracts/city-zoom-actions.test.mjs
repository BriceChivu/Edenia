import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindCityZoomActions
} from '../../src/features/city/zoom-actions.js'

const selectors = [
  '[data-city-zoom-action="out"]',
  '[data-city-zoom-action="reset"]',
  '[data-city-zoom-action="in"]'
]

function createHarness(includedSelectors = selectors) {
  const controls = new Map(
    includedSelectors.map(selector => [selector, new EventTarget()])
  )
  const root = {
    querySelector(selector) {
      return controls.get(selector) || null
    }
  }
  return { controls, root }
}

test('city zoom binding preserves exact fixed calls without forwarding events', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindCityZoomActions(root, {
    zoom(...args) {
      calls.push(['zoom', args])
    },
    reset(...args) {
      calls.push(['reset', args])
    }
  }), 3)

  const events = selectors.map(() => new Event('click', { cancelable: true }))
  selectors.forEach((selector, index) => {
    assert.equal(controls.get(selector).dispatchEvent(events[index]), true)
    assert.equal(events[index].defaultPrevented, false)
  })
  assert.deepEqual(calls, [
    ['zoom', [-1]],
    ['reset', []],
    ['zoom', [1]]
  ])
})

test('city zoom binding is idempotent and tolerates absent controls', () => {
  const { controls, root } = createHarness([selectors[2]])
  const calls = []
  const actions = {
    zoom(direction) {
      calls.push(direction)
    },
    reset() {
      calls.push('reset')
    }
  }
  assert.equal(bindCityZoomActions(root, actions), 1)
  assert.equal(bindCityZoomActions(root, actions), 0)
  controls.get(selectors[2]).dispatchEvent(new Event('click'))
  assert.deepEqual(calls, [1])

  assert.equal(bindCityZoomActions(createHarness([]).root, actions), 0)
})

test('city zoom binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindCityZoomActions(null, { zoom() {}, reset() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindCityZoomActions(root, { zoom() {} }),
    /zoom and reset callbacks/
  )
})
