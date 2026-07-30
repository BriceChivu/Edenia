import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getCityImageCoverGeometry
} from '../../src/features/city/viewport-geometry.js'

function assertClose(actual, expected, tolerance = 0.001) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  )
}

test('city cover geometry exposes vertical crop at minimum desktop zoom', () => {
  const geometry = getCityImageCoverGeometry({
    viewportWidth: 1672,
    viewportHeight: 720,
    imageWidth: 1672,
    imageHeight: 941,
    scale: 1
  })

  assert.deepEqual(geometry, {
    baseWidth: 1672,
    baseHeight: 941,
    renderedWidth: 1672,
    renderedHeight: 941,
    maxX: 0,
    maxY: 110.5
  })
})

test('city cover geometry exposes horizontal crop at minimum phone zoom', () => {
  const geometry = getCityImageCoverGeometry({
    viewportWidth: 1672,
    viewportHeight: 1080,
    imageWidth: 1672,
    imageHeight: 941,
    scale: 1
  })

  assert.equal(geometry.baseHeight, 1080)
  assert.equal(geometry.renderedHeight, 1080)
  assert.equal(geometry.maxY, 0)
  assertClose(geometry.baseWidth, 1918.979809)
  assertClose(geometry.renderedWidth, 1918.979809)
  assertClose(geometry.maxX, 123.489904)
})

test('city cover geometry includes user zoom in both pan axes', () => {
  const geometry = getCityImageCoverGeometry({
    viewportWidth: 1000,
    viewportHeight: 500,
    imageWidth: 1600,
    imageHeight: 900,
    scale: 2
  })

  assert.deepEqual(geometry, {
    baseWidth: 1000,
    baseHeight: 562.5,
    renderedWidth: 2000,
    renderedHeight: 1125,
    maxX: 500,
    maxY: 312.5
  })
})

test('city cover geometry fails closed for unavailable dimensions or scale', () => {
  assert.equal(getCityImageCoverGeometry({
    viewportWidth: 0,
    viewportHeight: 500,
    imageWidth: 1600,
    imageHeight: 900
  }), null)
  assert.equal(getCityImageCoverGeometry({
    viewportWidth: 1000,
    viewportHeight: 500,
    imageWidth: Number.NaN,
    imageHeight: 900
  }), null)
  assert.equal(getCityImageCoverGeometry({
    viewportWidth: 1000,
    viewportHeight: 500,
    imageWidth: 1600,
    imageHeight: 900,
    scale: -1
  }), null)
})
