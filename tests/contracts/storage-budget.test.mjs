import assert from 'node:assert/strict'
import test from 'node:test'
import { budgetObjectCache, budgetRecentEntries, storageBytes } from '../../src/state/storage-budget.js'
import { budgetUndoState, UNDO_STACK_BYTE_LIMIT } from '../../src/state/action-history.js'
import { budgetYoutubeMetadata } from '../../src/integrations/youtube-metadata-cache.js'
import { ACTIVITY_LOG_BYTE_LIMIT, normalizeActivityLogState } from '../../src/state/activity-log.js'

// Large records defeat count limits even with only a few entries.
test('cache budgets include conservative bytes and retain headroom and newest records', () => {
  const cache = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [String(index), {
    savedAt: index, results: ['界'.repeat(6000)]
  }]))
  const retained = budgetObjectCache(cache)
  assert.ok(storageBytes(retained) < 64 * 1024 * 0.8)
  assert.ok(retained['19'])
  assert.equal(retained['0'], undefined)
})

test('Undo keeps recent complete actions under its byte limit and preserves learner data', () => {
  const state = {
    undoStack: Array.from({ length: 50 }, (_, id) => ({ id, type: 'video-status', before: 'x'.repeat(6000), after: 'watched' })),
    redoStack: [], videos: { study: { watchProgress: [{ seconds: 80 }], favorite: true, watchLater: true } },
    anki: { day: { reviewed: 8 } }, config: { removedChannelIds: ['removed'], channels: [] }
  }
  const facts = structuredClone({ videos: state.videos, anki: state.anki, config: state.config })
  budgetUndoState(state)
  assert.ok(state.undoStack.length < 50)
  assert.equal(state.undoStack.at(-1).id, 49)
  assert.ok(storageBytes(state.undoStack) <= UNDO_STACK_BYTE_LIMIT)
  assert.deepEqual({ videos: state.videos, anki: state.anki, config: state.config }, facts)
  assert.throws(() => budgetRecentEntries(['x'.repeat(300_000)], {
    maxBytes: UNDO_STACK_BYTE_LIMIT, preserveNewest: true
  }), { name: 'QuotaExceededError' })
})

test('metadata eviction preserves progress, saved organization, selections and intentional removals', () => {
  const state = {
    videos: Object.fromEntries(Array.from({ length: 15 }, (_, id) => [id, {
      id: String(id), title: 'replaceable '.repeat(1000), thumbnail: 'provider.jpg',
      metadataFetchedAt: new Date(id * 1000).toISOString(), channelId: 'channel',
      status: 'partial', duration: 600, isShort: true, aspectRatio: 0.5625, resumeAtSeconds: 90, favorite: true, watchLater: true,
      hiddenFromGrid: true, watchProgress: [{ seconds: 90, studyDay: '2026-10-03' }]
    }])),
    config: { channels: [{ id: 'channel' }], removedChannelIds: ['other'], learningLanguages: ['ja'] },
    anki: { day: { reviewed: 42 } }
  }
  const before = structuredClone(state)
  assert.equal(budgetYoutubeMetadata(state, 30_000), true)
  assert.equal(state.videos[0].title, undefined)
  for (const [id, video] of Object.entries(state.videos)) {
    for (const field of ['id', 'channelId', 'status', 'duration', 'isShort', 'aspectRatio', 'resumeAtSeconds', 'favorite', 'watchLater', 'hiddenFromGrid', 'watchProgress']) {
      assert.deepEqual(video[field], before.videos[id][field])
    }
  }
  assert.deepEqual(state.config, before.config)
  assert.deepEqual(state.anki, before.anki)
})

test('activity byte pruning reports a change once and retains recent entries with headroom', () => {
  const state = { activityLog: Array.from({ length: 30 }, (_, index) => ({
    id: String(index), createdAt: new Date(index * 1000).toISOString(), actor: 'user', type: 'general',
    status: 'info', title: 'Fixture', detail: 'x'.repeat(4000)
  })) }
  assert.equal(normalizeActivityLogState(state), true)
  assert.ok(storageBytes(state.activityLog) < ACTIVITY_LOG_BYTE_LIMIT * 0.8)
  assert.equal(state.activityLog[0].id, '29')
  assert.equal(normalizeActivityLogState(state), false)
})
