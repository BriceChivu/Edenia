import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_THEME,
  normalizeAnkiCount,
  normalizeAnkiEnabled,
  normalizeIncludeShorts,
  normalizeTheme,
  normalizeWeeklyGoalHours
} from '../../src/state/config-normalization.js'

test('theme normalization preserves strict legacy membership and default', () => {
  assert.equal(DEFAULT_THEME, 'light')
  assert.equal(normalizeTheme('light'), 'light')
  assert.equal(normalizeTheme('dark'), 'dark')
  assert.equal(normalizeTheme('DARK'), 'light')
  assert.equal(normalizeTheme(new String('dark')), 'light')
  assert.equal(normalizeTheme(null), 'light')
})

test('weekly goals preserve decimal parsing, fallback, and clamping', () => {
  assert.equal(normalizeWeeklyGoalHours('4.9'), 4)
  assert.equal(normalizeWeeklyGoalHours('4hours'), 4)
  assert.equal(normalizeWeeklyGoalHours('0x10'), 1)
  assert.equal(normalizeWeeklyGoalHours(0), 1)
  assert.equal(normalizeWeeklyGoalHours(100), 99)
  assert.equal(normalizeWeeklyGoalHours(null), 4)
  assert.equal(normalizeWeeklyGoalHours(Infinity), 4)
  assert.throws(
    () => normalizeWeeklyGoalHours(Symbol('goal')),
    TypeError
  )
})

test('shorts and Anki remain default-on unless the value is exactly false', () => {
  for (const normalize of [normalizeIncludeShorts, normalizeAnkiEnabled]) {
    assert.equal(normalize(false), false)
    assert.equal(normalize(true), true)
    assert.equal(normalize(0), true)
    assert.equal(normalize(null), true)
    assert.equal(normalize(undefined), true)
    assert.equal(normalize('false'), true)
  }
})

test('Anki counts preserve numeric coercion, flooring, and unusual infinities', () => {
  assert.equal(normalizeAnkiCount('7.9'), 7)
  assert.equal(normalizeAnkiCount(-2), 0)
  assert.equal(normalizeAnkiCount(NaN), 0)
  assert.equal(normalizeAnkiCount(null), 0)
  assert.equal(normalizeAnkiCount(Infinity), Infinity)
  assert.equal(normalizeAnkiCount(-Infinity), 0)
  assert.throws(
    () => normalizeAnkiCount(Symbol('count')),
    TypeError
  )
})
