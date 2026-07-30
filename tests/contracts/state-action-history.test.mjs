import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeUndoState,
  UNDO_ACTION_TYPES,
  UNDO_STACK_LIMIT
} from '../../src/state/action-history.js'

test('action-history constants preserve the exact public state contract', () => {
  assert.equal(UNDO_STACK_LIMIT, 50)
  assert.deepEqual(UNDO_ACTION_TYPES, [
    'video-status',
    'video-resume-time',
    'video-favorite',
    'video-grid-remove',
    'channel-remove',
    'manual-video-add'
  ])
})

test('undo normalization repairs arrays, filters types, and retains the newest 50', () => {
  const retained = Array.from({ length: 55 }, (_, index) => ({
    type: UNDO_ACTION_TYPES[index % UNDO_ACTION_TYPES.length],
    index
  }))
  const invalid = { type: 'future-action', index: -1 }
  const state = {
    undoStack: [invalid, ...retained],
    redoStack: [null, invalid, retained[0]]
  }

  assert.equal(normalizeUndoState(state), undefined)
  assert.equal(state.undoStack.length, 50)
  assert.deepEqual(
    state.undoStack.map(action => action.index),
    retained.slice(-50).map(action => action.index)
  )
  assert.equal(state.undoStack.at(-1), retained.at(-1))
  assert.deepEqual(state.redoStack, [retained[0]])
})

test('legacy lastUndo promotion remains conditional and always cleans up', () => {
  const legacy = { type: 'video-status', videoId: 'legacy' }
  const emptyState = {
    undoStack: [],
    redoStack: [],
    lastUndo: legacy
  }
  normalizeUndoState(emptyState)
  assert.deepEqual(emptyState.undoStack, [legacy])
  assert.equal('lastUndo' in emptyState, false)

  const existing = { type: 'video-favorite', videoId: 'existing' }
  const populatedState = {
    undoStack: [existing],
    redoStack: [],
    lastUndo: legacy
  }
  normalizeUndoState(populatedState)
  assert.deepEqual(populatedState.undoStack, [existing])
  assert.equal('lastUndo' in populatedState, false)

  const unsupportedState = {
    undoStack: 'invalid',
    redoStack: null,
    lastUndo: { type: 'channel-remove' }
  }
  normalizeUndoState(unsupportedState)
  assert.deepEqual(unsupportedState.undoStack, [])
  assert.deepEqual(unsupportedState.redoStack, [])
  assert.equal('lastUndo' in unsupportedState, false)
})

test('undo normalization preserves null and propagated mutation failures', () => {
  assert.equal(normalizeUndoState(null), undefined)
  assert.equal(normalizeUndoState(undefined), undefined)
  assert.throws(
    () => normalizeUndoState(Object.freeze({})),
    TypeError
  )
})
