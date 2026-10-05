import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CITY_IMAGE_PATHS,
  CITY_IMAGE_SOURCES,
  CITY_IMAGE_WEBP_PATHS,
  CITY_LEVELS,
  getCityLevel,
  getCityLevelIndex,
  getCityScoreForLevelIndex,
  normalizeCityProgress
} from '../../src/features/city/model.js'

test('city levels preserve exact thresholds, translation keys, labels, and order', () => {
  assert.deepEqual(CITY_LEVELS.slice(0, 3), [
    { threshold: 0, labelKey: 'city.level.1', label: '🏠 Lonely house' },
    { threshold: 15, labelKey: 'city.level.2', label: '⛵ Your house got a fresh new look! Plus a boat!' },
    { threshold: 45, labelKey: 'city.level.3', label: '🏝️ Oh look! A tiny island! Cute.' },

  ])
})

test('city image sources preserve exact WebP-first and PNG-fallback mapping', () => {
  assert.equal(CITY_IMAGE_PATHS.length, 12)
  assert.equal(CITY_IMAGE_WEBP_PATHS.length, 12)
  assert.deepEqual(
    CITY_IMAGE_PATHS,
    Array.from({ length: 12 }, (_, index) => `images/photoshop/level%20${index + 1}.png`)
  )
  assert.deepEqual(
    CITY_IMAGE_WEBP_PATHS,
    Array.from({ length: 12 }, (_, index) => `images/city/level%20${index + 1}.webp`)
  )
  assert.deepEqual(
    CITY_IMAGE_SOURCES,
    CITY_IMAGE_PATHS.map((fallback, index) => ({
      primary: CITY_IMAGE_WEBP_PATHS[index],
      fallback
    }))
  )
})

test('city level lookups preserve thresholds, coercion, and shared object identity', () => {
  assert.equal(getCityLevelIndex(-1), 0)
  assert.equal(getCityLevelIndex(0), 0)
  assert.equal(getCityLevelIndex(14.99), 0)
  assert.equal(getCityLevelIndex(15), 1)
  assert.equal(getCityLevelIndex(44.99), 1)
  assert.equal(getCityLevelIndex(45), 2)
  assert.equal(getCityLevelIndex(1049), 9)
  assert.equal(getCityLevelIndex(1050), 9)
  assert.equal(getCityLevelIndex(Infinity), 9)
  assert.equal(getCityLevelIndex(NaN), 0)
  assert.equal(getCityLevelIndex('15'), 1)
  assert.equal(getCityLevel(45), CITY_LEVELS[2])
})

test('city score lookup preserves clamping and invalid-index fallbacks', () => {
  assert.equal(getCityScoreForLevelIndex(-1), 0)
  assert.equal(getCityScoreForLevelIndex(0), 0)
  assert.equal(getCityScoreForLevelIndex(1), 15)
  assert.equal(getCityScoreForLevelIndex(99), 675)
  assert.equal(getCityScoreForLevelIndex(1.5), 0)
  assert.equal(getCityScoreForLevelIndex(NaN), 0)
})

test('city progress normalization preserves defaults and strips unrelated fields', () => {
  const state = {
    cityProgress: {
      maxLevelIndex: '4',
      pendingLevelIndex: 7.5,
      scoringVersion: '7',
      legacy: true
    }
  }
  assert.equal(normalizeCityProgress(state), undefined)
  assert.deepEqual(state.cityProgress, {
    maxLevelIndex: 0,
    pendingLevelIndex: null,
    scoringVersion: 1,
    experienceVersion: 0
  })
})

test('city progress normalization clamps indices and clears already revealed pending levels', () => {
  const clamped = {
    cityProgress: {
      maxLevelIndex: 99,
      pendingLevelIndex: -5,
      scoringVersion: 7
    }
  }
  normalizeCityProgress(clamped)
  assert.deepEqual(clamped.cityProgress, {
    maxLevelIndex: 9,
    pendingLevelIndex: null,
    scoringVersion: 7,
    experienceVersion: 0
  })

  const future = {
    cityProgress: {
      maxLevelIndex: 3,
      pendingLevelIndex: 5,
      scoringVersion: 0
    }
  }
  normalizeCityProgress(future)
  assert.deepEqual(future.cityProgress, {
    maxLevelIndex: 3,
    pendingLevelIndex: 5,
    scoringVersion: 0,
    experienceVersion: 0
  })
})

test('city progress normalization preserves null handling and mutation errors', () => {
  assert.equal(normalizeCityProgress(null), undefined)
  assert.equal(normalizeCityProgress(undefined), undefined)
  assert.throws(
    () => normalizeCityProgress(Object.freeze({})),
    TypeError
  )
})

// This import/normalization happens before any iframe handshake.
test('all ten Godot thresholds are available before profile normalization', async () => {
  const { readFile } = await import('node:fs/promises')
  const godot = await readFile('godot/tiny-swords/scripts/terrain_layout.gd', 'utf8')
  const thresholds = JSON.parse(godot.match(/^const XP_THRESHOLDS := (\[[^\n]+\])$/m)[1])
  assert.deepEqual(CITY_LEVELS.map(level => level.threshold), thresholds)
  assert.equal(CITY_LEVELS.length, 10)
  const state = {cityProgress:{maxLevelIndex:8,pendingLevelIndex:9,experienceVersion:1}}
  normalizeCityProgress(state)
  assert.equal(state.cityProgress.maxLevelIndex,8)
  assert.equal(state.cityProgress.pendingLevelIndex,9)
  assert.ok(Object.isFrozen(CITY_LEVELS))
})
