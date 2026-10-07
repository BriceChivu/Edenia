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
