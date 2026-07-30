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
  assert.deepEqual(CITY_LEVELS, [
    { threshold: 0, labelKey: 'city.level.1', label: '🏠 Lonely house' },
    { threshold: 60, labelKey: 'city.level.2', label: '⛵ Your house got a fresh new look! Plus a boat!' },
    { threshold: 140, labelKey: 'city.level.3', label: '🏝️ Oh look! A tiny island! Cute.' },
    { threshold: 230, labelKey: 'city.level.4', label: 'Kids are gonna have fun now!' },
    { threshold: 320, labelKey: 'city.level.5', label: "Let's add a pool to chill" },
    { threshold: 400, labelKey: 'city.level.6', label: 'Oh! Some friends are coming to say hi...' },
    { threshold: 480, labelKey: 'city.level.7', label: 'You expanded your small island!' },
    { threshold: 570, labelKey: 'city.level.8', label: "That's a nice deckchair and some pretty flowers! 🌸" },
    { threshold: 680, labelKey: 'city.level.9', label: 'You built a cute house in the backyard' },
    { threshold: 800, labelKey: 'city.level.10', label: 'Oh wow! You got a neighbor! 🏠' },
    { threshold: 920, labelKey: 'city.level.11', label: 'The little purple house has a cute garden!' },
    { threshold: 1050, labelKey: 'city.level.12', label: 'Damn! A volcano appeared! I hope it won\'t erupt...' }
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
  assert.equal(getCityLevelIndex(59), 0)
  assert.equal(getCityLevelIndex(60), 1)
  assert.equal(getCityLevelIndex(139), 1)
  assert.equal(getCityLevelIndex(140), 2)
  assert.equal(getCityLevelIndex(1049), 10)
  assert.equal(getCityLevelIndex(1050), 11)
  assert.equal(getCityLevelIndex(Infinity), 11)
  assert.equal(getCityLevelIndex(NaN), 0)
  assert.equal(getCityLevelIndex('60'), 1)
  assert.equal(getCityLevel(140), CITY_LEVELS[2])
})

test('city score lookup preserves clamping and invalid-index fallbacks', () => {
  assert.equal(getCityScoreForLevelIndex(-1), 0)
  assert.equal(getCityScoreForLevelIndex(0), 0)
  assert.equal(getCityScoreForLevelIndex(1), 60)
  assert.equal(getCityScoreForLevelIndex(99), 1050)
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
    scoringVersion: 1
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
    maxLevelIndex: 11,
    pendingLevelIndex: null,
    scoringVersion: 7
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
    scoringVersion: 0
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
