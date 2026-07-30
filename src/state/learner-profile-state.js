import { isValidTimestamp } from '../core/date-keys.js'

export function createLearnerProfileNormalizer({
  languageOptions,
  levelOptions,
  channelCatalog
}) {
  return function normalizeLearnerProfileState(state) {
    if (!state) return false
    const existing = state.learnerProfile && typeof state.learnerProfile === 'object' && !Array.isArray(state.learnerProfile)
      ? state.learnerProfile
      : {}
    const validLanguageIds = new Set(languageOptions.map(option => option.id))
    const validLevelIds = new Set(levelOptions.map(option => option.id))
    const validCatalogIds = new Set(channelCatalog.map(channel => channel.id))
    const languages = Array.from(new Set(
      (Array.isArray(existing.languages) ? existing.languages : [])
        .filter(languageId => validLanguageIds.has(languageId))
    ))
    const selectedChannelCatalogIds = Array.from(new Set(
      (Array.isArray(existing.selectedChannelCatalogIds) ? existing.selectedChannelCatalogIds : [])
        .filter(catalogId => validCatalogIds.has(catalogId))
    ))
    const normalized = {
      languages,
      level: validLevelIds.has(existing.level) ? existing.level : null,
      selectedChannelCatalogIds,
      createdAt: isValidTimestamp(existing.createdAt) ? existing.createdAt : null,
      updatedAt: isValidTimestamp(existing.updatedAt) ? existing.updatedAt : null
    }
    const changed = JSON.stringify(existing) !== JSON.stringify(normalized)
    state.learnerProfile = normalized
    return changed
  }
}
