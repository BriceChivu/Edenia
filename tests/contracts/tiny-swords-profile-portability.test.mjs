import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { createPortableLearnerProfileEnvelope, verifyPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'
import { createStateBackupStore } from '../../src/state/backups.js'
import { createStateStore } from '../../src/state/store.js'
import { isValidStateShape } from '../../src/state/persistence-contract.js'
import { createTinySwordsPersistence, islandIdentity } from '../../src/state/tiny-swords-island.js'

// Generated from Layout.snapshot() and accepted by Layout.restore(): level seven,
// placed tree/chicken, partial chopping, reserved six-log construction bundle.
const island = JSON.parse(fs.readFileSync('tests/fixtures/tiny-swords-populated-island.json'))
const clone = value => structuredClone(value)
function context() {
  const values = new Map()
  const storage = {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}
  const backups = createStateBackupStore({storage,storageKey:'profile',stateBackupKey:'backups',isValidStateShape,prepareStateForBackup:clone})
  const store = createStateStore({storage,storageKey:'profile',normalizeLoadedState:()=>false,normalizeStateBeforeSave(){},createStateBackup:backups.createStateBackup,pruneOldestStateBackup:backups.pruneOldestStateBackup,saveConfigCookie(){},syncPersistedStateToAnalytics(){},getLatestBackupState:backups.getLatestBackupState,loadConfigCookie:()=>null,createDefaultStateFromConfig:()=>null})
  return {storage,backups,store}
}

test('populated island survives durable reload, fresh-context portable import, backup replacement and reset recovery', async () => {
  const original = {config:{},videos:{},anki:{},cityProgress:{maxLevelIndex:6},tinySwordsIsland:clone(island)}
  const a = context()
  assert.equal(a.store.saveState(original,{backup:false}),true)
  assert.deepEqual(a.store.loadState().tinySwordsIsland,island)
  const envelope = await createPortableLearnerProfileEnvelope(a.store.loadState())
  const verified = await verifyPortableLearnerProfileEnvelope(envelope.serialized)
  const b = context()
  assert.equal(b.store.saveImportedState(verified.profile).persisted,true)
  assert.deepEqual(b.store.loadState().tinySwordsIsland,island)
  const recovery = b.backups.createStateBackup('before reset',{force:true})
  assert.deepEqual(recovery.state.tinySwordsIsland,island)
  assert.equal(b.store.saveState({...original,tinySwordsIsland:null},{backup:false}),true)
  assert.equal(b.store.loadState().tinySwordsIsland,null)
  assert.equal(b.store.saveImportedState(recovery.state).persisted,true)
  assert.deepEqual(b.store.loadState().tinySwordsIsland,island)
})

for (const name of ['QuotaExceededError','SecurityError']) {
  test(`${name} leaves the last durable island and live profile intact`, async () => {
    const a=context();const state={config:{},videos:{},anki:{},tinySwordsIsland:clone(island)}
    a.store.saveState(state,{backup:false})
    const before=a.storage.getItem('profile')
    a.storage.setItem=()=>{throw Object.assign(new Error('denied'),{name})}
    const adapter=createTinySwordsPersistence({read:()=>state,readDurable:()=>a.store.loadState(),save:a.store.saveState})
    assert.equal(await adapter.save({...island,resources:{wood:99}},islandIdentity(state)),false)
    assert.deepEqual(state.tinySwordsIsland,island)
    assert.equal(a.storage.getItem('profile'),before)
  })
}

test('unsupported/corrupt gameplay input remains portable for recovery without browser repair', async () => {
  for (const tinySwordsIsland of [{version:999,construction:'unknown'},'corrupt game input']) {
    const state={config:{},videos:{},anki:{},tinySwordsIsland}
    const exported=await createPortableLearnerProfileEnvelope(state)
    const verified=await verifyPortableLearnerProfileEnvelope(exported.serialized)
    assert.deepEqual(verified.profile.tinySwordsIsland,tinySwordsIsland)
  }
})
