import assert from 'node:assert/strict'
import test from 'node:test'
import { recoverProductionCityProgress } from '../../src/domain/city-progression-recovery.js'
import { normalizeCityProgress } from '../../src/features/city/model.js'
import { preparePortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'

test('affected profiles recover their earned legacy town level once without changing study facts', () => {
  for (const [score, level] of [[0, 0], [60, 1], [140, 2], [1050, 11], [10000, 11]]) {
    const state = { cityProgress: { maxLevelIndex: 0, experienceVersion: 1 }, videos: { v: { watchProgress: [{ seconds: 16800 }] } }, anki: { '2026-10-05': { reviewed: 60 } } }
    const facts = structuredClone({ videos: state.videos, anki: state.anki })
    assert.equal(recoverProductionCityProgress(state, score, 7), true)
    assert.deepEqual(state.cityProgress, { maxLevelIndex: level, pendingLevelIndex: null, scoringVersion: 7 })
    assert.deepEqual({ videos: state.videos, anki: state.anki }, facts)
    assert.equal(recoverProductionCityProgress(state, 0, 7), false)
    assert.equal(state.cityProgress.maxLevelIndex, level)
  }
})

test('unaffected profiles retain their staged level claim behavior', () => {
  const state = { cityProgress: { maxLevelIndex: 0, pendingLevelIndex: 1, scoringVersion: 7 } }
  const before = structuredClone(state)
  assert.equal(recoverProductionCityProgress(state, 1050, 7), false)
  assert.deepEqual(state, before)
})

test('profile portability and city normalization retain the marker until recovery', () => {
  const state = { config: {}, videos: {}, anki: {}, cityProgress: { maxLevelIndex: 0, experienceVersion: 1 } }
  normalizeCityProgress(state)
  assert.equal(state.cityProgress.experienceVersion, 1)
  const prepared = preparePortableLearnerProfileEnvelope(state)
  const profile = prepared.profile || prepared.envelope?.profile
  assert.equal(profile.cityProgress.experienceVersion, 1)
  assert.equal(recoverProductionCityProgress(profile, 140, 7), true)
  assert.equal(profile.cityProgress.maxLevelIndex, 2)
})
