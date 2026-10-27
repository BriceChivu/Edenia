import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  animalIslandsHaveSameProgress,
  animalIslandSha256,
  createAnimalCheckpointStamp,
  composeAnimalCheckpointProfile,
  getAnimalCheckpoint
} from '../../src/state/tiny-swords-animal-checkpoint.js'

const initial = JSON.parse(await readFile(new URL('../fixtures/tiny-swords-animal-v37-initial.json', import.meta.url)))
const moved = JSON.parse(await readFile(new URL('../fixtures/tiny-swords-animal-v37-moved.json', import.meta.url)))
const binding = { ownerId: '123e4567-e89b-42d3-a456-426614174000', profileId: '223e4567-e89b-42d3-a456-426614174001', generation: 1, revision: 7 }
const uuid = '323e4567-e89b-42d3-a456-426614174001'

test('outgoing positions retain a trusted stamp without changing the canonical profile', () => {
  assert.equal(initial.sheep[0][0], 544)
  assert.equal(moved.sheep[0][0], 560)
  assert.equal(animalIslandsHaveSameProgress(initial, moved), true)
  const profile = { videos: { lesson: { watched: true } }, tinySwordsIsland: initial }
  const raw = JSON.stringify(profile)
  const stamp = createAnimalCheckpointStamp(moved, binding, uuid)
  const outgoing = composeAnimalCheckpointProfile(profile, { stamp, layout: moved, baseIslandSha256: animalIslandSha256(initial) })
  assert.equal(JSON.stringify(profile), raw)
  assert.deepEqual(outgoing.tinySwordsIsland, moved)
  assert.equal(outgoing.videos, profile.videos)
  assert.deepEqual(getAnimalCheckpoint(outgoing), stamp)
  assert.equal(getAnimalCheckpoint(profile), null)
  assert.equal(getAnimalCheckpoint(JSON.parse(JSON.stringify(outgoing))), null)
})

test('an unverified tag cannot hide meaningful edits or undeclared fields', () => {
  const resources = structuredClone(moved); resources.resources.wood += 1
  assert.equal(animalIslandsHaveSameProgress(initial, resources), false)
  const unknown = structuredClone(moved); unknown.future_conserved_fact = 1
  assert.equal(animalIslandsHaveSameProgress(initial, unknown), false)
  const noDeclaration = structuredClone(moved); delete noDeclaration.sync_semantics
  assert.equal(animalIslandsHaveSameProgress(initial, noDeclaration), false)
  const falseDeclaration = structuredClone(moved); falseDeclaration.sync_semantics.ambient_arrays.push('resources')
  assert.equal(animalIslandsHaveSameProgress(initial, falseDeclaration), false)
  const untrustedFingerprint = structuredClone(moved); untrustedFingerprint.sync_semantics.sha256 = 'f'.repeat(64)
  assert.equal(animalIslandsHaveSameProgress(initial, untrustedFingerprint), false)
})

test('a trusted outgoing stamp is invalidated when the island changes', () => {
  const stamp = createAnimalCheckpointStamp(moved, binding, uuid)
  const outgoing = composeAnimalCheckpointProfile({ tinySwordsIsland: initial }, { stamp, layout: moved })
  outgoing.tinySwordsIsland.sheep[0][0] += 1
  assert.equal(getAnimalCheckpoint(outgoing), null)
  assert.throws(() => composeAnimalCheckpointProfile({}, { stamp, layout: initial }), TypeError)
})

test('checkpoint payload and binding validation are bounded and exact', async () => {
  const { copyAnimalCheckpointLayout, isAnimalCheckpointBinding, isAnimalCheckpointStamp } = await import('../../src/state/tiny-swords-animal-checkpoint.js')
  assert.throws(() => copyAnimalCheckpointLayout({ ...initial, oversized: 'x'.repeat(512 * 1024) }), RangeError)
  assert.throws(() => copyAnimalCheckpointLayout([]), TypeError)
  assert.equal(isAnimalCheckpointBinding({ ...binding, revision: 0 }), false)
  assert.equal(isAnimalCheckpointBinding({ ...binding, unexpected: true }), false)
  assert.equal(isAnimalCheckpointBinding({ ownerId: null, profileId: 'accountless', generation: null, revision: null }), true)
  assert.equal(isAnimalCheckpointBinding({ ownerId: null, profileId: 'accountless', generation: 1, revision: 1 }), false)
  const stamp = createAnimalCheckpointStamp(moved, binding, uuid)
  assert.equal(isAnimalCheckpointStamp(stamp), true)
  assert.equal(isAnimalCheckpointStamp({ ...stamp, extra: true }), false)
  assert.equal(isAnimalCheckpointStamp({ ...stamp, layoutSha256: 'wrong' }), false)
})
