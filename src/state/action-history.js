export const UNDO_ACTION_TYPES = [
  'video-status',
  'video-resume-time',
  'video-favorite',
  'video-grid-remove',
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
}
