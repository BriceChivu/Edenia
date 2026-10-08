import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveRuntimeEnvironment, deriveTinySwordsExperience, deriveTinySwordsEnabled } from '../../src/core/runtime-environment.js'
import { deriveStorageKeys } from '../../src/core/storage-keys.js'
import { initializeExperience } from '../../src/domain/experience.js'
import { preparePortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'
import { getReleaseAssetVersion } from '../../scripts/release-manifest.mjs'

test('public selection uses production storage and remains selected with the engine disabled', () => {
  const url = new URL('https://edenia.study/?source=bookmark#history')
  assert.equal(deriveTinySwordsExperience(url), false)
  assert.equal(deriveTinySwordsExperience(url, true), true)
  assert.equal(deriveTinySwordsEnabled(url, { tinySwordsPublicEnabled: true, tinySwordsEnabled: false }), false)
  assert.equal(deriveTinySwordsEnabled(url, { tinySwordsPublicEnabled: true, tinySwordsEnabled: true }), true)
  assert.equal(deriveStorageKeys(deriveRuntimeEnvironment(url)).storageKey, 'edenia_v1')
  assert.equal(deriveStorageKeys(deriveRuntimeEnvironment(new URL('https://edenia.study/?internal_test=2'))).storageKey, 'edenia_v1_internal_test_2')
  assert.equal(deriveTinySwordsExperience(new URL('http://localhost:8001/?sandbox=1'), true), false)
})

test('exact legacy claims and the announcement receipt survive portable export, with no XP conversion', () => {
  const at = '2026-10-08T01:00:00.000Z'
  const state = { config: {}, videos: {}, anki: { '2026-10-07': { reviewed: 900 } },
    cityProgress: { maxLevelIndex: 11, pendingLevelIndex: 12, scoringVersion: 7 },
    onboarding: { setupCompleted: true, islandAnnouncementSeenAt: at } }
  const claims = structuredClone(state.cityProgress)
  assert.equal(initializeExperience(state, 7), true)
  assert.deepEqual(state.legacyCityProgress, claims)
  assert.equal(state.cityProgress.maxLevelIndex, 0)
  assert.equal(state.anki['2026-10-07'].experienceReviews, undefined)
  const profile = preparePortableLearnerProfileEnvelope(state).profile
  assert.deepEqual(profile.legacyCityProgress, claims)
  assert.equal(profile.onboarding.islandAnnouncementSeenAt, at)
  initializeExperience(state, 7)
  assert.deepEqual(state.legacyCityProgress, claims)
})

test('public and game flag-only releases have distinct asset identities at the same commit', () => {
  const versions = new Set()
  for (const publicFlag of ['false', 'true']) for (const gameFlag of ['false', 'true']) {
    versions.add(getReleaseAssetVersion({ releaseCommit: 'a'.repeat(40), environment: {
      EDENIA_TINY_SWORDS_PUBLIC_ENABLED: publicFlag, EDENIA_TINY_SWORDS_ENABLED: gameFlag
    } }))
  }
  assert.equal(versions.size, 4)
})
