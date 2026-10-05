import { getCityLevelIndex, normalizeCityProgress } from '../features/city/model.js'

// PR #381 reset town progress while leaving the underlying study facts intact.
// Only profiles marked by that release receive the one-time reconstruction.
export function recoverProductionCityProgress(state, score, scoringVersion) {
  if (state?.cityProgress?.experienceVersion !== 1) return false
  normalizeCityProgress(state)
  state.cityProgress.maxLevelIndex = getCityLevelIndex(score)
  state.cityProgress.pendingLevelIndex = null
  state.cityProgress.scoringVersion = scoringVersion
  delete state.cityProgress.experienceVersion
  return true
}
