import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldHoldPausedInternalProfile } from '../../src/features/profile-access/experiment-pause.js'
import { deriveStorageKeys } from '../../src/core/storage-keys.js'
const keys = deriveStorageKeys({ isInternalTest: true })
const check = (entries = {}, options = {}) => shouldHoldPausedInternalProfile({
  location: { search: '?internal_test=1' }, accountFeaturesEnabled: false,
  readStorage: key => entries[key] ?? null, ...options
})
test('public and enabled Auth routes never inspect paused internal storage', () => {
  const readStorage = () => { throw Error('must not read') }
  assert.equal(check({}, { location: { search: '' }, readStorage }), false)
  assert.equal(check({}, { accountFeaturesEnabled: true, readStorage }), false)
})
test('fresh and explicitly accountless internal profiles remain available', () => {
  assert.equal(check(), false)
  assert.equal(check({ [keys.learnerProfileAccessKey]: JSON.stringify({version:1,ownerId:null,activationId:null,activatedAt:1,profileId:`accountless:${keys.storageKey}`}) }), false)
})
test('owner-bound and ambiguous caches are held without reading learner data', () => {
  for (const key of [keys.accountAuthStorageKey, keys.accountStudySyncOwnerKey,
    keys.learnerProfileOwnerVerificationKey, keys.learnerProfileSyncKey,
    keys.accountlessProfileMigrationKey, keys.learnerProfileAccessKey]) {
    assert.equal(check({ [key]: 'retained' }), true)
  }
  assert.equal(check({ [keys.learnerProfileAccessKey]: JSON.stringify({version:1,ownerId:'owner',profileId:'profile',activationId:null,activatedAt:1,generation:1,revision:1}) }), true)
  assert.equal(check({ [keys.learnerProfileAccessKey]: JSON.stringify({version:1,ownerId:null,profileId:`accountless:${keys.storageKey}`}) }), true)
  assert.equal(check({}, {readStorage() { throw Error('unavailable') }}), true)
})
