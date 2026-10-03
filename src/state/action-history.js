import { budgetRecentEntries } from './storage-budget.js'
import { compactChannelRemovalHistory } from './channel-removal-history.js'

export const UNDO_ACTION_TYPES = [
  'video-status',
  'video-resume-time',
  'video-favorite',
  'video-grid-remove',
  'video-organization',
  'channel-remove',
  'manual-video-add'
]

export const UNDO_STACK_LIMIT = 50

export function normalizeUndoState(state) {
  if (!state) return
  if (!Array.isArray(state.undoStack)) state.undoStack = []
  if (!Array.isArray(state.redoStack)) state.redoStack = []
  if (state.lastUndo?.type === 'video-status' && !state.undoStack.length) {
    state.undoStack.push(state.lastUndo)
  }
  state.undoStack = state.undoStack
    .filter(action => UNDO_ACTION_TYPES.includes(action?.type))
    .slice(-UNDO_STACK_LIMIT)
  state.redoStack = state.redoStack
    .filter(action => UNDO_ACTION_TYPES.includes(action?.type))
    .slice(-UNDO_STACK_LIMIT)
  delete state.lastUndo
  compactChannelRemovalHistory(state)
}

// Count caps alone permit dozens of full-library records. Keep recent Undo and
// Redo within a conservative byte budget, with room for the next action.
export const UNDO_STACK_BYTE_LIMIT = 256 * 1024
export function budgetUndoState(state) {
  normalizeUndoState(state)
  for (const key of ['undoStack', 'redoStack']) {
    state[key] = budgetRecentEntries(state[key], {
      maxBytes: UNDO_STACK_BYTE_LIMIT, newestLast: true, preserveNewest: true
    })
  }
}
