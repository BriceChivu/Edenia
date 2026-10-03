import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeUndoState } from '../../src/state/action-history.js'
import {
  getChannelRemovalVideoFields,
  restoreChannelRemovalVideoFields
} from '../../src/state/channel-removal-history.js'

test('channel Undo restores only presentation, including absent fields', () => {
  const video = { title: 'Original', status: 'partial', resumeAtSeconds: 30 }
  const before = getChannelRemovalVideoFields(video)
  Object.assign(video, {
    hiddenFromGrid: true, hiddenFromGridAt: '2026-10-03T00:00:00Z',
    channelImageUrl: '/avatar.png', title: 'Refreshed', resumeAtSeconds: 90,
    watchProgress: [[0, 90]], favorite: true
  })
  restoreChannelRemovalVideoFields(video, before)
  assert.deepEqual(video, {
    title: 'Refreshed', status: 'partial', resumeAtSeconds: 90,
    watchProgress: [[0, 90]], favorite: true, channelImageUrl: '/avatar.png'
  })
})

test('failed writes can roll back an avatar backfill as well as visibility', () => {
  const video = { status: 'partial' }
  const before = getChannelRemovalVideoFields(video, { includeImage: true })
  video.channelImageUrl = '/avatar.png'
  video.hiddenFromGrid = true
  restoreChannelRemovalVideoFields(video, before, { includeImage: true })
  assert.deepEqual(video, { status: 'partial' })
})

test('legacy channel Undo copies compact in both stacks without losing missing videos', () => {
  const current = { id: 'a', title: 'Current', resumeAtSeconds: 90, watchProgress: [[0, 90]] }
  const old = { ...current, title: 'Old', resumeAtSeconds: 30, watchProgress: [[0, 30]] }
  const missing = { id: 'missing', title: 'Recoverable', status: 'watched', watchedAt: '2026-10-02T00:00:00Z' }
  const action = {
    type: 'channel-remove', channelId: 'channel',
    before: { videos: { a: old, missing } },
    after: { videos: { a: { ...old, hiddenFromGrid: true, hiddenFromGridAt: '2026-10-03T00:00:00Z' } } }
  }
  const state = { videos: { a: current }, undoStack: [action], redoStack: [structuredClone(action)] }
  normalizeUndoState(state)
  for (const stack of [state.undoStack, state.redoStack]) {
    assert.deepEqual(stack[0].before.videoVisibility, { a: {} })
    assert.deepEqual(stack[0].before.videos, { missing })
    assert.deepEqual(stack[0].after.videoVisibility, {
      a: { hiddenFromGrid: true, hiddenFromGridAt: '2026-10-03T00:00:00Z' }
    })
    assert.equal(Object.hasOwn(stack[0].after, 'videos'), false)
  }
  assert.deepEqual(state.videos.a, current)
  const once = JSON.stringify(state)
  normalizeUndoState(state)
  assert.equal(JSON.stringify(state), once)
})

test('compaction does not alter video-action snapshots needed for their own Undo', () => {
  const action = { type: 'video-status', before: { videos: { a: { status: 'partial' } } } }
  const state = { videos: { a: {} }, undoStack: [action] }
  normalizeUndoState(state)
  assert.deepEqual(action.before, { videos: { a: { status: 'partial' } } })
})
