// Only live activity writers attach XP provenance. Legacy facts remain unmarked.
export function initializeExperience(state, scoringVersion = state.cityProgress?.scoringVersion || 1) {
  if (state.cityProgress?.experienceVersion === 1) return false
  state.cityProgress = { maxLevelIndex: 0, pendingLevelIndex: null, scoringVersion, experienceVersion: 1 }
  return true
}

export function experienceFromSeconds(seconds) {
  return Math.max(0, Number(seconds) || 0) / 60
}

export function observeAnkiExperience(previous, rawReviewed, { eligible = true } = {}) {
  const raw = Math.max(0, Math.floor(Number(rawReviewed) || 0))
  const watermark = previous?.experienceWatermark
  const earned = Math.max(0, Number(previous?.experienceReviews) || 0)
  return {
    experienceWatermark: Math.max(raw, Number(watermark) || 0),
    experienceReviews: earned + (eligible && Number.isFinite(watermark) ? Math.max(0, raw - watermark) : 0)
  }
}

export function historyExperience(row) {
  return experienceFromSeconds(row.experienceSeconds) + Math.max(0, Number(row.experienceReviews) || 0)
}
