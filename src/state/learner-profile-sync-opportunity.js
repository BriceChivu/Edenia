// The host supplies visibility/playback; Godot supplies gameplay activity.
// This is an opportunity signal only, never persistence or upload authority.
export function createLearnerProfileSyncOpportunity({ isHidden, isWatchingVideo, now }) {
  let visible = false
  let active = true
  let lastHostInputAt = -Infinity
  return Object.freeze({
    reportGame(state) {
      if (typeof state?.visible === 'boolean' && typeof state?.active === 'boolean') {
        visible = state.visible
        active = state.active
      }
    },
    reportHostInput() { lastHostInputAt = now() },
    isQuiet() {
      return isHidden() || !visible || isWatchingVideo()
        || (!active && now() - lastHostInputAt >= 5000)
    }
  })
}
