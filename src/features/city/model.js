import { clampNumber } from '../../core/numbers.js'
import { TINY_SWORDS_XP_THRESHOLDS } from './tiny-swords-progression.js'

export const CITY_LEVELS = Object.freeze(TINY_SWORDS_XP_THRESHOLDS.map((threshold, index) =>
  Object.freeze({ threshold, label: `Level ${index + 1}`, level: index + 1 })
))

export function getCityLevel(score) {
  return CITY_LEVELS[getCityLevelIndex(score)]
}

export function getCityLevelIndex(score) {
  let index = 0
  CITY_LEVELS.forEach((level, i) => {
    if (score >= level.threshold) index = i
  })
  return index
}

export function getCityScoreForLevelIndex(index) {
  return CITY_LEVELS[clampNumber(index, 0, CITY_LEVELS.length - 1)]?.threshold || 0
}

export function normalizeCityProgress(state) {
  if (!state) return
  const currentProgress = state.cityProgress || {}
  const revealedLevelIndex = Number.isInteger(currentProgress.maxLevelIndex)
    ? currentProgress.maxLevelIndex
    : 0
  const pendingLevelIndex = Number.isInteger(currentProgress.pendingLevelIndex)
    ? currentProgress.pendingLevelIndex
    : null
  const scoringVersion = Number.isInteger(currentProgress.scoringVersion)
    ? currentProgress.scoringVersion
    : 1
  state.cityProgress = {
    maxLevelIndex: clampNumber(revealedLevelIndex, 0, CITY_LEVELS.length - 1),
    pendingLevelIndex: pendingLevelIndex === null
      ? null
      : clampNumber(pendingLevelIndex, 0, CITY_LEVELS.length - 1),
    scoringVersion,
    experienceVersion: currentProgress.experienceVersion === 1 ? 1 : 0
  }
  if (state.cityProgress.pendingLevelIndex !== null && state.cityProgress.pendingLevelIndex <= state.cityProgress.maxLevelIndex) {
    state.cityProgress.pendingLevelIndex = null
  }
}
