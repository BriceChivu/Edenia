export function sanitizeConfigForStorage(config = {}) {
  const {
    apiKey,
    ankiDisabledAt,
    ankiResumeBaselines,
    ankiPendingResumeBaseline,
    ...safeConfig
  } = config
  return safeConfig
}

export function isValidStateShape(state) {
  return Boolean(
    state &&
    typeof state === 'object' &&
    state.config &&
    typeof state.config === 'object' &&
    state.videos &&
    typeof state.videos === 'object' &&
    !Array.isArray(state.videos) &&
    state.anki &&
    typeof state.anki === 'object' &&
    !Array.isArray(state.anki)
  )
}
