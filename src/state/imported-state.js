export function createImportedStateReader({
  createDefaultState,
  removeLegacyVideoWatchReminderState
}) {
  if (typeof createDefaultState !== 'function') {
    throw new TypeError('Imported state reader requires a default-state factory')
  }
  if (typeof removeLegacyVideoWatchReminderState !== 'function') {
    throw new TypeError('Imported state reader requires legacy-state cleanup')
  }

  return function readImportedState(payload) {
    const state = payload?.app === 'edenia' ? payload.state : payload
    if (!state || typeof state !== 'object') return null
    if (!state.config || typeof state.config !== 'object') return null
    if (
      !state.videos
      || typeof state.videos !== 'object'
      || Array.isArray(state.videos)
    ) return null
    if (
      !state.anki
      || typeof state.anki !== 'object'
      || Array.isArray(state.anki)
    ) return null

    const baseState = createDefaultState(
      state.config.weeklyGoalHours || 4,
      state.config.channels,
      state.config.theme,
      state.config.removedDefaultChannelIds,
      state.config.locale
    )
    const importedState = {
      ...baseState,
      ...state,
      config: {
        ...baseState.config,
        ...state.config
      }
    }
    removeLegacyVideoWatchReminderState(importedState)
    return importedState
  }
}
