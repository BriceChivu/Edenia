import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CITY_LEVELS,
  getCityLevel,
  getCityLevelIndex,
  getCityScoreForLevelIndex,
  normalizeCityProgress
} from '../../src/features/city/model.js'

test('study levels use all twenty Godot thresholds without town artwork metadata', () => {
  assert.deepEqual(CITY_LEVELS.map(level => level.threshold), [0,15,45,90,150,225,315,420,540,675,825,990,1170,1365,1575,1800,2040,2295,2565,2850])
  assert.deepEqual(CITY_LEVELS.map(level => level.level), Array.from({length:20}, (_, index) => index + 1))
})

test('city level lookups preserve thresholds, coercion, and shared object identity', () => {
  assert.equal(getCityLevelIndex(-1), 0)
  assert.equal(getCityLevelIndex(0), 0)
  assert.equal(getCityLevelIndex(14.99), 0)
  assert.equal(getCityLevelIndex(15), 1)
  assert.equal(getCityLevelIndex(44.99), 1)
  assert.equal(getCityLevelIndex(45), 2)
  assert.equal(getCityLevelIndex(1049), 11)
  assert.equal(getCityLevelIndex(1050), 11)
  assert.equal(getCityLevelIndex(Infinity), 19)
  assert.equal(getCityLevelIndex(NaN), 0)
  assert.equal(getCityLevelIndex('15'), 1)
  assert.equal(getCityLevel(45), CITY_LEVELS[2])
})

test('city score lookup preserves clamping and invalid-index fallbacks', () => {
  assert.equal(getCityScoreForLevelIndex(-1), 0)
  assert.equal(getCityScoreForLevelIndex(0), 0)
  assert.equal(getCityScoreForLevelIndex(1), 15)
  assert.equal(getCityScoreForLevelIndex(99), 2850)
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
    maxLevelIndex: 19,
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
test('all twenty Godot thresholds are available before profile normalization', async () => {
  const { readFile } = await import('node:fs/promises')
  const godot = await readFile('godot/tiny-swords/scripts/terrain_layout.gd', 'utf8')
  const thresholds = JSON.parse(godot.match(/^const XP_THRESHOLDS := (\[[^\n]+\])$/m)[1])
  assert.deepEqual(CITY_LEVELS.map(level => level.threshold), thresholds)
  assert.equal(CITY_LEVELS.length, 20)
  const state = {cityProgress:{maxLevelIndex:8,pendingLevelIndex:9,experienceVersion:1}}
  normalizeCityProgress(state)
  assert.equal(state.cityProgress.maxLevelIndex,8)
  assert.equal(state.cityProgress.pendingLevelIndex,9)
  assert.ok(Object.isFrozen(CITY_LEVELS))
})
