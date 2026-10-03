// Channel removal changes presentation only. Study progress and metadata stay
// in the library and must not be copied into (or rewound by) channel Undo.
export const CHANNEL_REMOVAL_VIDEO_FIELDS = [
  'hiddenFromGrid', 'hiddenFromGridAt'
]

function removalFields(includeImage) {
  return includeImage ? [...CHANNEL_REMOVAL_VIDEO_FIELDS, 'channelImageUrl'] : CHANNEL_REMOVAL_VIDEO_FIELDS
}

export function getChannelRemovalVideoFields(video, { includeImage = false } = {}) {
  return Object.fromEntries(removalFields(includeImage)
    .filter(key => Object.hasOwn(video, key))
    .map(key => [key, video[key]]))
}

export function restoreChannelRemovalVideoFields(video, snapshot, { includeImage = false } = {}) {
  for (const key of removalFields(includeImage)) {
    if (Object.hasOwn(snapshot, key)) video[key] = snapshot[key]
    else delete video[key]
  }
}

export function compactChannelRemovalHistory(state) {
  for (const stack of [state?.undoStack, state?.redoStack]) {
    if (!Array.isArray(stack)) continue
    for (const action of stack) {
      if (action?.type !== 'channel-remove') continue
      for (const snapshot of [action.before, action.after]) {
        if (!snapshot?.videos) continue
        for (const [id, video] of Object.entries(snapshot.videos)) {
          // Retain full legacy records when the library cannot supply them.
          if (!video || !state.videos?.[id]) continue
          snapshot.videoVisibility ||= {}
          snapshot.videoVisibility[id] = getChannelRemovalVideoFields(video)
          delete snapshot.videos[id]
        }
        if (!Object.keys(snapshot.videos).length) delete snapshot.videos
      }
    }
  }
}
