import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveRuntimeEnvironment, deriveTinySwordsExperience, deriveTinySwordsEnabled } from '../../src/core/runtime-environment.js'
import { deriveStorageKeys } from '../../src/core/storage-keys.js'
import { deriveAccountFeaturesEnabled } from '../../src/core/account-feature-rollout.js'
import { readFile } from 'node:fs/promises'

import { readBuiltExperience } from '../support/built-experience.mjs'

const environment = query => deriveRuntimeEnvironment(new URL(`https://www.edenia.study/${query}`))

test('tester mode is distinct from internal account experiments and mounting requires the release control', () => {
  const url = new URL('https://www.edenia.study/?internal_test=2')
  const tester = deriveRuntimeEnvironment(url)
  assert.equal(tester.internalTestMode, '2')
  assert.equal(tester.isTinySwordsTester, true)
  assert.equal(Object.hasOwn(tester, 'isInternalTest'), false)
  for (const rollout of ['off', 'internal', 'public']) assert.equal(deriveAccountFeaturesEnabled(tester, rollout), false)
  assert.equal(deriveTinySwordsExperience(url), true)
  for (const flag of [undefined, false, 'true', 1]) assert.equal(deriveTinySwordsEnabled(url, { tinySwordsEnabled: flag }), false)
  assert.equal(deriveTinySwordsEnabled(url, { tinySwordsEnabled: true }), true)
  for (const query of ['', '?internal_test=1', '?internal_test=3', '?internal_test=true', '?internal_test=02']) {
    assert.equal(deriveTinySwordsEnabled(new URL(`https://www.edenia.study/${query}`), { tinySwordsEnabled: true }), false)
  }
  assert.equal(deriveTinySwordsEnabled(new URL('http://localhost:8001/?sandbox=1&internal_test=2'), { tinySwordsEnabled: true }), false)
  assert.equal(deriveTinySwordsEnabled(new URL('http://localhost:8037/'), { tinySwordsEnabled: true }), true)
  assert.equal(deriveTinySwordsEnabled(new URL('http://localhost:8037/?internal_test=1'), { tinySwordsEnabled: true }), false)
  assert.equal(deriveTinySwordsEnabled(new URL('http://localhost:8037/?internal_test=3'), { tinySwordsEnabled: true }), false)
})

test('every mode 2 profile, cache, backup and settings key is separate, independent of availability', () => {
  const tester = deriveStorageKeys(environment('?internal_test=2'))
  assert.equal(tester.storageKey, 'edenia_v1_internal_test_2')
  assert.equal(tester.configCookieKey, 'edenia_config_internal_test_2')
  for (const query of ['', '?internal_test=1']) {
    const other = deriveStorageKeys(environment(query))
    for (const key of Object.keys(tester)) assert.notEqual(tester[key], other[key], key)
  }
  const sandbox = deriveStorageKeys(deriveRuntimeEnvironment(new URL('http://localhost:8001/?sandbox=1&internal_test=2')))
  assert.equal(sandbox.storageKey, 'edenia_v1_sandbox')
  assert.equal(sandbox.configCookieKey, 'edenia_config_sandbox')
})

test('ordinary page packaging retains released town markup without game references', async () => {
  const [entry, production, tester] = await Promise.all([readFile('_site/index.html', 'utf8'), readBuiltExperience('https://www.edenia.study/'), readBuiltExperience()])
  assert.doesNotMatch(entry, /tiny-swords-game|index\.wasm|index\.pck/)
  assert.match(production, /cityMilestoneImage/)
  assert.match(production, /id="cityTimeWaveform"/)
  assert.doesNotMatch(production, /tiny-swords-game|tinySwordsSurface/)
  assert.match(tester, /tiny-swords-game\/[^/]+\/parent\.js/)
  assert.match(tester, /id="tinySwordsSurface"/)
  assert.doesNotMatch(tester, /id="cityMilestoneImage"/)
})


test('auth trial shares the current experience with separate, default-off account and storage controls', () => {
  const trial = environment('?internal_test=1')
  assert.equal(trial.isAuthTrial, true)
  assert.equal(deriveTinySwordsExperience(new URL('https://www.edenia.study/?internal_test=1')), true)
  for (const rollout of ['off', 'public', 'internal']) {
    for (const flag of [undefined, false, 'true', 1]) assert.equal(deriveAccountFeaturesEnabled(trial, rollout, flag), false)
    assert.equal(deriveAccountFeaturesEnabled(trial, rollout, true), true)
    assert.equal(deriveAccountFeaturesEnabled(environment('?internal_test=2'), rollout, true), false)
    assert.equal(deriveAccountFeaturesEnabled(environment(''), 'off', true), false)
  }
  const trialKeys = deriveStorageKeys(trial)
  assert.equal(trialKeys.storageKey, 'edenia_v1_auth_trial_v1')
  assert.equal(trialKeys.configCookieKey, 'edenia_config_auth_trial_v1')
  for (const query of ['', '?internal_test=2']) {
    const keys = deriveStorageKeys(environment(query))
    for (const key of Object.keys(trialKeys)) assert.notEqual(trialKeys[key], keys[key], key)
  }
  const sandbox = deriveRuntimeEnvironment(new URL('http://localhost:8001/?sandbox=1&internal_test=1'))
  assert.equal(deriveAccountFeaturesEnabled(sandbox, 'public', true), false)
  assert.equal(deriveStorageKeys(sandbox).storageKey, 'edenia_v1_sandbox')
})

test('mode 1 packaging shares app/assets but uses its runtime admission entry', async () => {
  const html = await readBuiltExperience('https://www.edenia.study/?internal_test=1')
  assert.match(html, /src="auth-trial-entry\.js\?v=/)
  assert.match(html, /id="tinySwordsSurface"/)
  assert.doesNotMatch(html, /production-app\.js|cityMilestoneImage/)
})
