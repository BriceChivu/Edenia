// The host supplies visibility/input; Godot supplies gameplay activity.
// This is an opportunity signal only, never persistence or upload authority.
export function createLearnerProfileSyncOpportunity({ isHidden, now }) {
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
      // Video playback can overlap with island input or pawn work. It cannot
      // make visible gameplay a safe time for expensive profile processing.
      return isHidden() || !visible || (!active && now() - lastHostInputAt >= 5000)
    }
  })
}
