import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { CITY_LEVELS, getCityLevelIndex, normalizeCityProgress } from '../../src/features/city/model.js'
import { clampNumber } from '../../src/core/numbers.js'

const app = fs.readFileSync('src/app.js','utf8')
const claimSource = app.slice(app.indexOf('let cityClaimInFlight = false'), app.indexOf('\nfunction getFirstStudyActionDateKey'))
const updateSource = app.slice(app.indexOf('async function updatePersistentCityLevel'),app.indexOf('\nfunction renderLevelUpButton'))

test('the real claim action waits for persistence and suppresses duplicate host celebrations', async () => {
  const state = {cityProgress:{maxLevelIndex:8,pendingLevelIndex:9,experienceVersion:1}}
  let settle; let writes = 0; let rendered = 0; let success = 0
  const context = {CITY_LEVELS,normalizeCityProgress,getCityLevelIndex,clampNumber,
    loadState:()=>state,getCurrentCityScore:()=>675,appendActivityLog(){},t:()=>'',getCityLevelLabel:()=>'',
    saveState(){writes++;return new Promise(resolve=>{settle=resolve})},
    isCurrentLearnerProfileOperation:()=>true,renderAll(){rendered++},
    launchCityLevelUpConfetti(){success++},showToast(){success++},window:{edeniaTinySwordsPersistence:{}}}
  vm.runInNewContext(claimSource,context)
  const failed = context.claimCityLevelUp()
  assert.equal(await context.claimCityLevelUp(),false,'double click cannot create another save')
  assert.equal(writes,1)
  assert.equal(rendered,0)
  settle(false)
  assert.equal(await failed,false)
  assert.equal(rendered,0)
  assert.equal(success,0)
  // The owning saveState restores a rejected state; replay the restored pending claim.
  state.cityProgress = {maxLevelIndex:8,pendingLevelIndex:9,experienceVersion:1}
  const saved = context.claimCityLevelUp()
  settle(true)
  assert.equal(await saved,true)
  assert.equal(state.cityProgress.maxLevelIndex,9)
  assert.equal(rendered,1)
  assert.equal(success,0,'Godot owns the integrated unlock celebration')
})

test('reduced study XP retains claimed levels and clears ineligible pending claims', async () => {
  const state={cityProgress:{maxLevelIndex:7,pendingLevelIndex:8,scoringVersion:1,experienceVersion:1},tinySwordsIsland:{level:8},townEconomy:{coins:99}}
  const island=state.tinySwordsIsland
  let writes=0
  const context={normalizeCityProgress,getCityLevelIndex,SCORING_RULES_VERSION:1,saveState:()=>{writes++;return true}}
  vm.runInNewContext(updateSource,context)
  assert.equal(await context.updatePersistentCityLevel(state,40),7)
  assert.equal(state.cityProgress.maxLevelIndex,7)
  assert.equal(state.cityProgress.pendingLevelIndex,null)
  assert.equal(state.tinySwordsIsland,island)
  assert.deepEqual(state.townEconomy,{coins:99})
  assert.equal(writes,1)
  await context.updatePersistentCityLevel(state,539)
  assert.equal(state.cityProgress.pendingLevelIndex,null)
  await context.updatePersistentCityLevel(state,540)
  assert.equal(state.cityProgress.pendingLevelIndex,8)
})
