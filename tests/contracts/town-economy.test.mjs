import test from 'node:test'
import assert from 'node:assert/strict'
import { initializeTownEconomy, recordTownRewards, getTownBalance, purchaseFirstFlower, validateTownEconomy } from '../../src/state/town-economy.js'
import { preparePortableLearnerProfileEnvelope, verifyPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'
import { createImportedStateReader } from '../../src/state/imported-state.js'

const fresh = () => ({ config: {}, videos: {}, anki: {}, cityProgress: { maxLevelIndex: 0 } })
const progress = (state, seconds, watchedAt = '2026-09-28T01:00:00.000Z') => {
  state.videos.lesson = { id: 'lesson', duration: 3600, status: 'partial', watchProgressTracked: true, watchProgress: [{ seconds, watchedAt }] }
}

test('ten minutes earns fifteen coins, retains fractional progress and does not repeat on replay or reload', () => {
  let state = fresh()
  initializeTownEconomy(state, { newProfile: true })
  for (const [seconds, coins] of [[39, 0], [40, 1], [599, 14], [600, 15]]) {
    progress(state, seconds)
    recordTownRewards(state)
    assert.equal(getTownBalance(state.townEconomy), coins)
  }
  for (let i = 0; i < 4; i++) {
    state = JSON.parse(JSON.stringify(state))
    recordTownRewards(state)
    assert.equal(getTownBalance(state.townEconomy), 15)
  }
  state.videos.lesson.watchProgress.push({ ...state.videos.lesson.watchProgress[0] })
  recordTownRewards(state)
  assert.equal(getTownBalance(state.townEconomy), 15)
  state.videos = {}
  recordTownRewards(state)
  assert.equal(getTownBalance(state.townEconomy), 15)
})

test('one atomic purchase survives reload; repeat and failed writes cannot spend twice; XP untouched', () => {
  const state = fresh()
  initializeTownEconomy(state, { newProfile: true })
  assert.equal(purchaseFirstFlower(state, () => assert.fail()), 'insufficient')
  progress(state, 600)
  recordTownRewards(state)
  const study = JSON.stringify({ videos: state.videos, cityProgress: state.cityProgress, anki: state.anki })
  assert.equal(purchaseFirstFlower(state, () => false), 'save-failed')
  assert.equal(getTownBalance(state.townEconomy), 15)
  let disk
  assert.equal(purchaseFirstFlower(state, value => { disk = JSON.stringify(value); return true }), 'purchased')
  assert.equal(purchaseFirstFlower(state, () => assert.fail()), 'owned')
  assert.equal(getTownBalance(JSON.parse(disk).townEconomy), 0)
  assert.equal(JSON.stringify({ videos: state.videos, cityProgress: state.cityProgress, anki: state.anki }), study)
  recordTownRewards(state)
  assert.equal(getTownBalance(state.townEconomy), 0)
})

test('legacy profile keeps its scene and flower without retroactive rewards; only later increases earn', () => {
  const state = fresh()
  progress(state, 600)
  state.cityProgress.maxLevelIndex = 8
  const before = JSON.stringify(state)
  initializeTownEconomy(state)
  assert.equal(state.townEconomy.mode, 'legacy')
  assert.equal(state.townEconomy.purchases['garden-flower-1'], 0)
  assert.equal(getTownBalance(state.townEconomy), 0)
  const { townEconomy, ...rest } = state
  assert.equal(JSON.stringify(rest), before)
  progress(state, 1200)
  recordTownRewards(state)
  assert.equal(getTownBalance(state.townEconomy), 15)
  progress(state, 600)
  recordTownRewards(state)
  progress(state, 1200)
  recordTownRewards(state)
  assert.equal(getTownBalance(state.townEconomy), 15)
})

test('portable sync/export/import/recovery retains receipts, isolates learners and does not credit imported study again', async () => {
  const state = fresh()
  initializeTownEconomy(state, { newProfile: true })
  progress(state, 600)
  recordTownRewards(state)
  purchaseFirstFlower(state, () => true)
  const envelope = preparePortableLearnerProfileEnvelope(state)
  const verification = await verifyPortableLearnerProfileEnvelope(envelope)
  assert.deepEqual(verification, envelope)
  const read = createImportedStateReader({ createDefaultState: fresh, removeLegacyVideoWatchReminderState: () => {} })
  const imported = read(envelope.profile)
  recordTownRewards(imported)
  assert.deepEqual(imported.townEconomy, state.townEconomy)
  assert.equal(getTownBalance(imported.townEconomy), 0)
  const second = fresh()
  initializeTownEconomy(second, { newProfile: true })
  assert.equal(getTownBalance(second.townEconomy), 0)
  assert.deepEqual(second.townEconomy.purchases, {})
  const old = fresh()
  progress(old, 600)
  const legacy = read(old)
  initializeTownEconomy(legacy)
  assert.equal(getTownBalance(legacy.townEconomy), 0)
})

test('invalid, negative and unknown economy records fail closed', () => {
  const state = fresh()
  initializeTownEconomy(state, { newProfile: true })
  state.townEconomy.purchases['garden-flower-1'] = 15
  assert.throws(() => validateTownEconomy(state.townEconomy))
  assert.throws(() => preparePortableLearnerProfileEnvelope(state))
  state.townEconomy.purchases = { boat: 1 }
  assert.throws(() => validateTownEconomy(state.townEconomy))
})

test('a legacy completed-video fact gets the same baseline before and after portable normalization', () => {
  const state = fresh()
  state.videos.old = { id: 'old', status: 'watched', duration: 600, watchedAt: '2026-09-28T01:00:00.000Z' }
  initializeTownEconomy(state)
  assert.equal(state.townEconomy.mode, 'legacy')
  assert.equal(getTownBalance(state.townEconomy), 0)
  const imported = preparePortableLearnerProfileEnvelope(state).profile
  recordTownRewards(imported)
  assert.equal(getTownBalance(imported.townEconomy), 0)
})

test('conflict comparison exposes coin and ownership differences without merging balances', async () => {
  const { createLearnerProfileConflictComparison } = await import('../../src/features/profile-access/conflict-comparison.js')
  const device = fresh()
  initializeTownEconomy(device, { newProfile: true })
  progress(device, 600)
  recordTownRewards(device)
  const cloud = structuredClone(device)
  purchaseFirstFlower(device, () => true)
  const rows = createLearnerProfileConflictComparison(device, cloud)
  assert.deepEqual(rows.find(row => row.key === 'town-economy'), { key: 'town-economy', device: { coins: 0, flowers: true }, cloud: { coins: 15, flowers: false } })
})


test('even an existing zero-study town retains its legacy scene and free flowers', () => {
  const state = fresh()
  initializeTownEconomy(state)
  assert.equal(state.townEconomy.mode, 'legacy')
  assert.equal(state.townEconomy.purchases['garden-flower-1'], 0)
  assert.equal(getTownBalance(state.townEconomy), 0)
})
