import assert from 'node:assert/strict'
import test from 'node:test'
import { createStateStore } from '../../src/state/store.js'

for (const replacement of [false, true]) {
  test(`state store preserves explicit checkpoint proof through ${replacement ? 'verified replacement' : 'study save'}`, async () => {
    const proof = { binding: { ownerId: 'owner', profileId: 'profile', generation: 1, revision: 7 } }
    const receipts = []
    const store = createStateStore({ storage: {}, storageKey: 'profile',
      getRepository: () => ({ save: async (_profile, options) => {
        assert.equal(options.animalCheckpoint, proof)
        assert.equal(options.replace === true, replacement)
        assert.equal(options.canPersist(), true)
        return true
      } }),
      normalizeStateBeforeSave() {}, createStateBackup() {}, saveConfigCookie() {},
      syncPersistedStateToAnalytics() {}, onPersisted(_state, detail) { receipts.push(detail) }
    })
    const result = await store[replacement ? 'saveImportedState' : 'saveState']({ config: {} }, { animalCheckpoint: proof })
    assert.equal(replacement ? result.persisted : result, true)
    assert.equal(receipts.length, 1)
  })
}
