import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { expect, test } from '@playwright/test'
let script
const initial = JSON.parse(await readFile(new URL('../fixtures/tiny-swords-animal-v37-initial.json', import.meta.url), 'utf8'))
const moved = JSON.parse(await readFile(new URL('../fixtures/tiny-swords-animal-v37-moved.json', import.meta.url), 'utf8'))
const profile = JSON.parse(await readFile(new URL('../fixtures/learner-profile/profile-ready-trial-smoke.json', import.meta.url), 'utf8')).resolution.envelope.profile
const binding = { ownerId: 'animal-owner', profileId: 'animal-profile', generation: 1, revision: 7 }
test.beforeAll(async () => {
  const result = await build({ stdin: { contents: `import {openIndexedDbProfile} from './src/state/indexed-db-profile.js';import {isValidStateShape} from './src/state/persistence-contract.js';window.animalLibrary={openIndexedDbProfile,isValidStateShape}`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife' })
  script = result.outputFiles[0].text
})
test.beforeEach(async ({ page }) => {
  test.skip(!['desktop-standard', 'phone-standard', 'webkit-storage', 'webkit-trial', 'native-chromium', 'native-webkit'].includes(test.info().project.name))
  await page.route('**/*', route => route.request().url().startsWith('http://localhost:18391/')
    ? route.fulfill({ contentType: 'text/html', body: '<html></html>' }) : route.abort())
  await page.goto('http://localhost:18391/')
  await page.addScriptTag({ content: script })
  await page.evaluate(async ({ initial, moved, profile, binding }) => {
    window.initialIsland = initial; window.movedIsland = moved; window.animalBinding = binding
    localStorage.setItem('animal-fixture', JSON.stringify({ ...profile, tinySwordsIsland: initial }))
    localStorage.setItem('animal-access', 'same-owner')
    window.openAnimalRepository = () => animalLibrary.openIndexedDbProfile({ storage: localStorage,
      storageKey: 'animal-fixture', accessKey: 'animal-access', isValidState: animalLibrary.isValidStateShape })
    window.animalRepository = await openAnimalRepository()
  }, { initial, moved, profile, binding })
})
test('positions survive a cold read while canonical profile bytes stay unchanged', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const before = animalRepository.readRaw()
    const saved = await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    const checkpoint = animalRepository.readAnimalCheckpoint(animalBinding)
    const game = animalRepository.readIslandState({ binding: animalBinding })
    const after = animalRepository.readRaw()
    animalRepository.close(); animalRepository = await openAnimalRepository()
    return { saved, before, after, reopened: animalRepository.readRaw(), checkpoint, game,
      canonical: animalRepository.snapshot().tinySwordsIsland,
      cold: animalRepository.readIslandState({ binding: animalBinding }) }
  })
  expect(result.saved).toBe(true)
  expect(result.after).toBe(result.before); expect(result.reopened).toBe(result.before)
  expect(result.canonical.sheep[0][0]).toBe(544)
  expect(result.game.tinySwordsIsland.sheep[0][0]).toBe(560)
  expect(result.cold.tinySwordsIsland.sheep[0][0]).toBe(560)
  expect(result.checkpoint.stamp.binding).toEqual(binding)
})

test('record and explicitly preserved full saves keep positions; replacement clears them', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    let state = animalRepository.snapshot()
    const key = 'lesson'
    state.videos[key] = { id: key, resume: 40 }
    const records = await animalRepository.saveRecords(state, { videos: [key] })
    const afterRecords = animalRepository.readIslandState({ binding: animalBinding }).tinySwordsIsland
    state = animalRepository.snapshot(); state.config.animalStudyFact = 'retained'
    const full = await animalRepository.save(state, { animalCheckpoint: { binding: animalBinding } })
    const afterFull = animalRepository.readIslandState({ binding: animalBinding }).tinySwordsIsland
    const replacement = await animalRepository.save(animalRepository.snapshot(), { replace: true })
    return { records, full, replacement, afterRecords, afterFull,
      checkpoint: animalRepository.readAnimalCheckpoint(animalBinding), state: animalRepository.snapshot() }
  })
  expect(result.records).toBe(true); expect(result.full).toBe(true); expect(result.replacement).toBe(true)
  expect(result.afterRecords.sheep[0][0]).toBe(560); expect(result.afterFull.sheep[0][0]).toBe(560)
  expect(result.checkpoint).toBeNull(); expect(result.state.config.animalStudyFact).toBe('retained')
})

test('meaningful island promotion compares the effective position snapshot', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    const meaningful = structuredClone(movedIsland); meaningful.resources.wood += 1
    const promoted = await animalRepository.saveAnimalCheckpoint(meaningful, JSON.stringify(movedIsland), { binding: animalBinding })
    const stale = await animalRepository.saveIsland(meaningful, JSON.stringify(initialIsland), { binding: animalBinding })
    const saved = await animalRepository.saveIsland(meaningful, JSON.stringify(movedIsland), { binding: animalBinding })
    return { promoted, stale, saved, checkpoint: animalRepository.readAnimalCheckpoint(animalBinding), canonical: animalRepository.snapshot().tinySwordsIsland }
  })
  expect(result.promoted).toBeNull(); expect(result.stale).toBe(false); expect(result.saved).toBe(true)
  expect(result.checkpoint).toBeNull(); expect(result.canonical.resources.wood).toBe(initial.resources.wood + 1)
})

test('receipt P retains newer Q, cross-tab refresh and crash-gap full install rebind it', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const nextBinding = { ...animalBinding, revision: 8 }
    await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    const p = animalRepository.readAnimalCheckpoint(animalBinding)
    const qLayout = structuredClone(movedIsland); qLayout.sheep[0][0] += 16
    await animalRepository.saveAnimalCheckpoint(qLayout, JSON.stringify(movedIsland), { binding: animalBinding })
    const q = animalRepository.readAnimalCheckpoint(animalBinding)
    const other = await openAnimalRepository()
    const accepted = await animalRepository.acknowledgeAnimalCheckpoint({ stamp: p.stamp, layout: p.layout,
      binding: animalBinding, nextBinding })
    await other.refresh()
    const observed = other.readAnimalCheckpoint(nextBinding)
    other.close()
    const beforeReplay = animalRepository.readAnimalCheckpoint(nextBinding)
    const replacement = animalRepository.snapshot()
    replacement.tinySwordsIsland = p.layout
    replacement.config.recoveredStudyFact = 'yes'
    const replay = await animalRepository.save(replacement, { replace: true,
      animalCheckpoint: { binding: animalBinding, nextBinding, acknowledgedStamp: p.stamp } })
    const afterReplay = animalRepository.readAnimalCheckpoint(nextBinding)
    const replayBoundary = animalRepository.getReplacementRevision()
    const qAccepted = await animalRepository.acknowledgeAnimalCheckpoint({ stamp: q.stamp, layout: q.layout,
      binding: nextBinding, nextBinding: { ...nextBinding, revision: 9 } })
    return { accepted, observed, beforeReplay, afterReplay, replayBoundary, replay, qAccepted,
      canonical: animalRepository.snapshot(), final: animalRepository.readAnimalCheckpoint({ ...nextBinding, revision: 9 }), q }
  })
  expect(result.accepted).toBe(true); expect(result.replay).toBe(true); expect(result.qAccepted).toBe(true)
  expect(result.observed.stamp.stamp).toBe(result.q.stamp.stamp)
  expect(result.observed.stamp.binding.revision).toBe(8)
  expect(result.afterReplay.layout).toEqual(result.beforeReplay.layout)
  expect(result.afterReplay.stamp.stamp).toBe(result.beforeReplay.stamp.stamp)
  expect(result.afterReplay.stamp.binding).toEqual(result.beforeReplay.stamp.binding)
  expect(result.afterReplay.stamp.replacementRevision).toBe(result.replayBoundary)
  expect(result.canonical.tinySwordsIsland.sheep[0][0]).toBe(576)
  expect(result.canonical.config.recoveredStudyFact).toBe('yes'); expect(result.final).toBeNull()
})

test('a newer meaningful island survives a late accepted pose receipt', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    const p = animalRepository.readAnimalCheckpoint(animalBinding)
    const meaningful = structuredClone(movedIsland); meaningful.resources.wood += 5
    const saved = await animalRepository.saveIsland(meaningful, JSON.stringify(movedIsland), { binding: animalBinding })
    const accepted = await animalRepository.acknowledgeAnimalCheckpoint({ stamp: p.stamp, layout: p.layout,
      binding: animalBinding, nextBinding: { ...animalBinding, revision: 8 } })
    return { saved, accepted, island: animalRepository.snapshot().tinySwordsIsland }
  })
  expect(result.saved).toBe(true); expect(result.accepted).toBe(true)
  expect(result.island.resources.wood).toBe(initial.resources.wood + 5)
})

test('warm poses and video checkpoints never fetch or write the immutable body', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    const calls = []
    const get = IDBObjectStore.prototype.get, put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.get = function(key) { calls.push(['get', key]); return get.call(this, key) }
    IDBObjectStore.prototype.put = function(value, ...args) { calls.push(['put', value.key]); return put.call(this, value, ...args) }
    const newer = structuredClone(movedIsland); newer.sheep[0][0] += 8
    const pose = await animalRepository.saveAnimalCheckpoint(newer, JSON.stringify(movedIsland), { binding: animalBinding })
    const state = animalRepository.snapshot(); state.videos.lesson = { resume: 40 }
    const study = await animalRepository.saveRecords(state, { videos: ['lesson'] })
    IDBObjectStore.prototype.get = get; IDBObjectStore.prototype.put = put
    return { pose, study, calls }
  })
  expect(result.pose).toBe(true); expect(result.study).toBe(true)
  expect(result.calls.filter(([kind, key]) => kind === 'put' && key === 'active')).toHaveLength(2)
  expect(result.calls.filter(([kind, key]) => kind === 'put' && key === 'animal-checkpoint')).toHaveLength(1)
  expect(result.calls.filter(([kind, key]) => kind === 'get' && key === 'animal-checkpoint')).toHaveLength(1)
  expect(result.calls.filter(([, key]) => key === 'active-body')).toEqual([])
})

test('stale external writes and retired ownership cannot acknowledge or overwrite a pose', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const other = await openAnimalRepository()
    await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    const stale = await other.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    other.close()
    let active = true
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, ...args) {
      const request = put.call(this, value, ...args)
      if (value.key === 'active') request.addEventListener('success', () => { active = false })
      return request
    }
    const newer = structuredClone(movedIsland); newer.sheep[0][0] += 8
    const retired = await animalRepository.saveAnimalCheckpoint(newer, JSON.stringify(movedIsland), { binding: animalBinding, canPersist: () => active })
    IDBObjectStore.prototype.put = put
    animalRepository.close(); animalRepository = await openAnimalRepository()
    return { stale, retired, island: animalRepository.readIslandState({ binding: animalBinding }).tinySwordsIsland }
  })
  expect(result.stale).toBe(false); expect(result.retired).toBe(false)
  expect(result.island).toEqual(moved)
})

test('an unstamped study receipt rebinds later positions without claiming a newer meaningful island', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const meaningful = structuredClone(initialIsland); meaningful.resources.wood += 2
    await animalRepository.saveIsland(meaningful, JSON.stringify(initialIsland), { binding: animalBinding })
    const q = structuredClone(meaningful); q.sheep[0][0] += 16
    await animalRepository.saveAnimalCheckpoint(q, JSON.stringify(meaningful), { binding: animalBinding })
    const before = animalRepository.readAnimalCheckpoint(animalBinding)
    const nextBinding = { ...animalBinding, revision: 8 }
    const accepted = await animalRepository.acknowledgeAnimalCheckpoint({ stamp: null, layout: initialIsland,
      binding: animalBinding, nextBinding })
    const replay = await animalRepository.save(animalRepository.snapshot(), { replace: true, animalCheckpoint: { binding: animalBinding, nextBinding } })
    return { accepted, replay, before, after: animalRepository.readAnimalCheckpoint(nextBinding), canonical: animalRepository.snapshot().tinySwordsIsland }
  })
  expect(result.accepted).toBe(true); expect(result.replay).toBe(true); expect(result.after.layout).toEqual(result.before.layout)
  expect(result.after.stamp.stamp).toBe(result.before.stamp.stamp)
  expect(result.after.stamp.binding.revision).toBe(8)
  expect(result.canonical.resources.wood).toBe(initial.resources.wood + 2)
  expect(result.canonical.sheep[0][0]).toBe(544)
})

test('a verified unchanged activation preserves a pose saved after its captured snapshot', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const captured = animalRepository.snapshot()
    await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    const installed = await animalRepository.save(captured, { replace: true, animalCheckpoint: { binding: animalBinding } })
    return { installed, checkpoint: animalRepository.readAnimalCheckpoint(animalBinding), canonical: animalRepository.snapshot().tinySwordsIsland }
  })
  expect(result.installed).toBe(true); expect(result.checkpoint.layout).toEqual(moved)
  expect(result.canonical).toEqual(initial)
})

test('quota failure aborts the side record and head together without acknowledging', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    const before = animalRepository.readAnimalCheckpoint(animalBinding)
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (value.key === 'animal-checkpoint') throw new DOMException('Synthetic quota exhausted', 'QuotaExceededError')
      return put.call(this, value, ...args)
    }
    const newer = structuredClone(movedIsland); newer.sheep[0][0] += 8
    const saved = await animalRepository.saveAnimalCheckpoint(newer, JSON.stringify(movedIsland), { binding: animalBinding })
    IDBObjectStore.prototype.put = put
    animalRepository.close(); animalRepository = await openAnimalRepository()
    return { saved, before, after: animalRepository.readAnimalCheckpoint(animalBinding) }
  })
  expect(result.saved).toBe(false); expect(result.after).toEqual(result.before)
})

test('a failed durable blob readback rolls back both the new pointer and its side record', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    const before = animalRepository.readAnimalCheckpoint(animalBinding)
    const get = IDBObjectStore.prototype.get
    let rejected = false
    IDBObjectStore.prototype.get = function(key) {
      if (key === 'animal-checkpoint' && this.transaction.mode === 'readonly' && !rejected) {
        rejected = true; throw new DOMException('Synthetic readback failure', 'UnknownError')
      }
      return get.call(this, key)
    }
    const newer = structuredClone(movedIsland); newer.sheep[0][0] += 8
    const saved = await animalRepository.saveAnimalCheckpoint(newer, JSON.stringify(movedIsland), { binding: animalBinding })
    IDBObjectStore.prototype.get = get
    animalRepository.close(); animalRepository = await openAnimalRepository()
    return { saved, rejected, before, after: animalRepository.readAnimalCheckpoint(animalBinding) }
  })
  expect(result.rejected).toBe(true); expect(result.saved).toBe(false); expect(result.after).toEqual(result.before)
})

test('canonical before-image excludes local poses and full-save rollback retains them', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    const prior = animalRepository.readAnimalCheckpoint(animalBinding)
    const study = animalRepository.snapshot(); study.videos.lesson = { resume: 40 }
    await animalRepository.saveRecords(study, { videos: ['lesson'] }, { syncBase: animalBinding })
    const beforeImage = await animalRepository.readSyncBase(animalBinding)
    let active = true
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, ...args) {
      const request = put.call(this, value, ...args)
      if (value.key === 'active') request.addEventListener('success', () => { active = false })
      return request
    }
    const edited = animalRepository.snapshot(); edited.config.shouldNotCommit = true
    const saved = await animalRepository.save(edited, { canPersist: () => active })
    IDBObjectStore.prototype.put = put
    animalRepository.close(); animalRepository = await openAnimalRepository()
    return { saved, prior, beforeImage, after: animalRepository.readAnimalCheckpoint(animalBinding), state: animalRepository.snapshot(),
      wrongOwner: animalRepository.readAnimalCheckpoint({ ...animalBinding, ownerId: 'other' }) }
  })
  expect(result.saved).toBe(false); expect(result.after).toEqual(result.prior)
  expect(result.beforeImage.tinySwordsIsland).toEqual(initial)
  expect(result.beforeImage.videos.lesson).toBeUndefined()
  expect(result.state.videos.lesson.resume).toBe(40); expect(result.state.config.shouldNotCommit).toBeUndefined()
  expect(result.wrongOwner).toBeNull()
})

test('a stale explicit full-save preservation proof cannot discard an already rebound pose', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    const nextBinding = { ...animalBinding, revision: 8 }
    await animalRepository.acknowledgeAnimalCheckpoint({ stamp: null, layout: initialIsland, binding: animalBinding, nextBinding })
    const prior = animalRepository.readAnimalCheckpoint(nextBinding)
    const study = animalRepository.snapshot(); study.config.newStudyFact = true
    const stale = await animalRepository.save(study, { animalCheckpoint: { binding: animalBinding } })
    const after = animalRepository.readAnimalCheckpoint(nextBinding)
    const retainedCandidate = study.config.newStudyFact
    const fresh = await animalRepository.save(study, { animalCheckpoint: { binding: nextBinding } })
    return { stale, prior, after, fresh, retainedCandidate, state: animalRepository.snapshot(), checkpoint: animalRepository.readAnimalCheckpoint(nextBinding) }
  })
  expect(result.stale).toBe(false); expect(result.after).toEqual(result.prior)
  expect(result.retainedCandidate).toBe(true); expect(result.fresh).toBe(true); expect(result.state.config.newStudyFact).toBe(true)
  expect(result.checkpoint.layout).toEqual(moved)
})

test('explicit same-body island replacement clears poses and fences old candidates', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    const old = animalRepository.snapshot()
    const reset = animalRepository.snapshot()
    const replaced = await animalRepository.save(reset, { replaceIsland: true, animalCheckpoint: { binding: animalBinding } })
    const cleared = animalRepository.readAnimalCheckpoint(animalBinding)
    old.config.obsoleteCandidate = true
    const stale = await animalRepository.save(old, { animalCheckpoint: { binding: animalBinding } })
    const beforeSecondReset = animalRepository.snapshot()
    const resetting = animalRepository.save(beforeSecondReset, { replaceIsland: true, animalCheckpoint: { binding: animalBinding } })
    const oldPose = animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    return { replaced, cleared, stale, resetting: await resetting, oldPose: await oldPose,
      marker: animalRepository.getReplacementRevision(), canonical: animalRepository.snapshot() }
  })
  expect(result.replaced).toBe(true); expect(result.cleared).toBeNull()
  expect(result.stale).toBe(false); expect(result.resetting).toBe(true); expect(result.oldPose).toBe(false)
  expect(result.marker).toBeGreaterThan(0); expect(result.canonical.config.obsoleteCandidate).toBeUndefined()
  expect(result.canonical.tinySwordsIsland).toEqual(initial)
})

for (const withNewPose of [false, true]) test(`a late pose receipt cannot cross an exact island replacement (${withNewPose ? 'new Q' : 'no Q'})`, async ({ page }) => {
  const result = await page.evaluate(async withNewPose => {
    await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    const p = animalRepository.readAnimalCheckpoint(animalBinding)
    await animalRepository.save(animalRepository.snapshot(), { replaceIsland: true, animalCheckpoint: { binding: animalBinding } })
    const boundary = animalRepository.getReplacementRevision()
    const q = structuredClone(initialIsland); q.sheep[0][0] += 32
    if (withNewPose) await animalRepository.saveAnimalCheckpoint(q, JSON.stringify(initialIsland), { binding: animalBinding })
    const nextBinding = { ...animalBinding, revision: 8 }
    const accepted = await animalRepository.acknowledgeAnimalCheckpoint({ stamp: p.stamp, layout: p.layout, binding: animalBinding, nextBinding })
    return { accepted, boundary, checkpoint: animalRepository.readAnimalCheckpoint(nextBinding), canonical: animalRepository.snapshot().tinySwordsIsland }
  }, withNewPose)
  expect(result.accepted).toBe(true); expect(result.canonical).toEqual(moved)
  expect(result.checkpoint).not.toBeNull()
  if (withNewPose) { expect(result.checkpoint.layout.sheep[0][0]).toBe(576); expect(result.checkpoint.stamp.replacementRevision).toBe(result.boundary) }
  else { expect(result.checkpoint.layout).toEqual(initial); expect(result.checkpoint.stamp.replacementRevision).toBe(result.boundary) }
})

for (const withNewPose of [false, true]) test(`lost receipt full install retains the exact post-reset effective island (${withNewPose ? 'new Q' : 'reset A'})`, async ({ page }) => {
  const result = await page.evaluate(async withNewPose => {
    await animalRepository.saveAnimalCheckpoint(movedIsland, JSON.stringify(initialIsland), { binding: animalBinding })
    const p = animalRepository.readAnimalCheckpoint(animalBinding)
    await animalRepository.save(animalRepository.snapshot(), { replaceIsland: true, animalCheckpoint: { binding: animalBinding } })
    const q = structuredClone(initialIsland); q.sheep[0][0] += 32
    if (withNewPose) await animalRepository.saveAnimalCheckpoint(q, JSON.stringify(initialIsland), { binding: animalBinding })
    const nextBinding = { ...animalBinding, revision: 8 }
    const repaired = animalRepository.snapshot(); repaired.tinySwordsIsland = p.layout; repaired.config.repairStudyFact = true
    const saved = await animalRepository.save(repaired, { replace: true,
      animalCheckpoint: { binding: animalBinding, nextBinding, acknowledgedStamp: p.stamp } })
    const marker = animalRepository.getReplacementRevision()
    animalRepository.close(); animalRepository = await openAnimalRepository()
    return { saved, marker, checkpoint: animalRepository.readAnimalCheckpoint(nextBinding),
      canonical: animalRepository.snapshot(), effective: animalRepository.readIslandState({ binding: nextBinding }).tinySwordsIsland }
  }, withNewPose)
  expect(result.saved).toBe(true); expect(result.canonical.tinySwordsIsland).toEqual(moved)
  expect(result.canonical.config.repairStudyFact).toBe(true)
  expect(result.checkpoint).not.toBeNull()
  expect(result.effective.sheep[0][0]).toBe(withNewPose ? 576 : 544)
  expect(result.checkpoint.stamp.replacementRevision).toBe(result.marker)
})
