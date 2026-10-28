import assert from 'node:assert/strict'
import test from 'node:test'
import { harness } from '../support/tiny-swords-parent-harness.mjs'
const island = { version: 23, level: 4, tiles: [[0, 0, 'meadow']], stock: { meadow: 3 }, resources: { wood: 6 }, house_bundle: 6 }

test('real parent automatically replaces a failed iframe and restores the same island without a write', async () => {
  const h = harness({ island }); const old = h.frames[0]
  await h.emit({ type: 'edenia-game-startup-failed', reason: 'integrity' })
  assert.equal(old.removed, true); assert.equal(h.surface.dataset.gameState, 'retry-wait')
  h.advance(650); assert.equal(h.frames.length, 2)
  assert.equal(new URL(h.frames[1].src).searchParams.get('startup_delivery'), 'ordinary')
  await h.ready(); assert.equal(h.surface.dataset.gameState, 'ready')
  assert.deepEqual(h.sent.findLast(x => x.type === 'edenia-study-level').layout, island)
  assert.deepEqual(h.durable.tinySwordsIsland, island); assert.equal(h.writes, 0)
  assert.equal(h.timers.size, 0); assert.equal(h.intervals.size, 0)
})

test('late old DOM callbacks and messages cannot fail a ready replacement', async () => {
  const h = harness({ island }); const old = h.frames[0]
  h.replace({ cityProgress: { maxLevelIndex: 2 }, tinySwordsIsland: island }); await h.ready()
  old.events.error(); old.events.load(); await h.emit({ type: 'edenia-game-startup-failed' }, old)
  await h.emit({ type: 'edenia-game-startup-failed' })
  assert.equal(h.surface.dataset.gameState, 'ready'); assert.equal(h.frames.length, 2)
  assert.equal(h.writes, 0); assert.equal(h.timers.size, 0)
})

test('owner loss during a retry wait cancels every remount', async () => {
  const h = harness({ island }); await h.emit({ type: 'edenia-game-startup-failed' })
  h.lock(); h.advance(1000000)
  assert.equal(h.frames.length, 1); assert.equal(h.writes, 0); assert.equal(h.timers.size, 0)
})

test('reset during a retry wait cannot resurrect the previous island', async () => {
  const h = harness({ island }); await h.emit({ type: 'edenia-game-startup-failed' })
  h.replace({ cityProgress: { maxLevelIndex: 0 }, tinySwordsIsland: null }); await h.ready(); h.advance(1000000)
  assert.equal(h.frames.length, 2); assert.equal(h.sent.findLast(x => x.type === 'edenia-study-level').layout, null)
  assert.equal(h.durable.tinySwordsIsland, null)
})

test('rejected restoration stays quiet, preserves exact input, and never retries an empty island', async () => {
  const h = harness({ island }); await h.emit({ type: 'edenia-game-progression', thresholds: [0, 15, 45, 90] })
  const session = h.sent.findLast(x => x.type === 'edenia-study-level').session
  await h.emit({ type: 'edenia-tiny-restored', session, accepted: false }); h.advance(1000000)
  assert.equal(h.surface.dataset.gameState, 'restore-blocked'); assert.deepEqual(h.durable.tinySwordsIsland, island)
  assert.equal(h.frames.length, 1); assert.equal(h.writes, 0); assert.equal(h.timers.size, 0)
})

test('an unrelated storage notification cannot restart a failed attempt or its retry budget', async () => {
  const h = harness({ island }); await h.emit({ type: 'edenia-game-startup-failed' })
  for (let i = 0; i < 20; i++) h.handlers.storage()
  assert.equal(h.frames.length, 1); h.advance(650); assert.equal(h.frames.length, 2)
})
