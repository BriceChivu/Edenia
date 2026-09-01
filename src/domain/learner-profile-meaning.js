const PORTABLE_PROFILE_KEYS = Object.freeze([
  'activityLog',
  'anki',
  'cityProgress',
  'config',
  'learnerProfile',
  'noAnkiFrequentUserPrompt',
  'onboarding',
  'videos'
])

const PORTABLE_CONFIG_KEYS = Object.freeze([
  'ankiEnabled',
  'channelShelfOrder',
  'channelVideoFormats',
  'channels',
  'includeShorts',
  'locale',
  'removedChannelIds',
  'removedDefaultChannelIds',
  'weeklyGoalHours'
])

const PORTABLE_CITY_PROGRESS_KEYS = Object.freeze(['maxLevelIndex'])

const PORTABLE_LEARNER_SELECTION_KEYS = Object.freeze([
  'createdAt',
  'languages',
  'level',
  'selectedChannelCatalogIds',
  'updatedAt'
])

const PORTABLE_ONBOARDING_KEYS = Object.freeze([
  'introSeenAt',
  'levelUpGuidanceShownAt',
  'recommendationsAppliedAt',
  'setupCompleted',
  'setupCompletedAt',
  'walkthroughCompleted',
  'walkthroughCompletedAt'
])

const PORTABLE_PROMPT_KEYS = Object.freeze(['respondedAt', 'response'])

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false
  const actualKeys = Object.keys(value).sort()
  const sortedExpected = [...expectedKeys].sort()
  return actualKeys.length === sortedExpected.length
    && actualKeys.every((key, index) => key === sortedExpected[index])
}

function isEmptyList(value) {
  return Array.isArray(value) && value.length === 0
}

function isEmptyRecord(value) {
  return isRecord(value) && Object.keys(value).length === 0
}

export function isMeaningfullyEmptyLearnerProfile(profile) {
  if (
    !hasExactKeys(profile, PORTABLE_PROFILE_KEYS)
    || !isEmptyList(profile.activityLog)
    || !isEmptyRecord(profile.anki)
    || !hasExactKeys(profile.cityProgress, PORTABLE_CITY_PROGRESS_KEYS)
    || Number(profile.cityProgress.maxLevelIndex) !== 0
    || !hasExactKeys(profile.config, PORTABLE_CONFIG_KEYS)
    || !hasExactKeys(
      profile.learnerProfile,
      PORTABLE_LEARNER_SELECTION_KEYS
    )
    || !hasExactKeys(
      profile.noAnkiFrequentUserPrompt,
      PORTABLE_PROMPT_KEYS
    )
    || !hasExactKeys(profile.onboarding, PORTABLE_ONBOARDING_KEYS)
    || !isEmptyRecord(profile.videos)
  ) return false

  const config = profile.config
  if (
    config.ankiEnabled !== true
    || !isEmptyList(config.channelShelfOrder)
    || !isEmptyRecord(config.channelVideoFormats)
    || !isEmptyList(config.channels)
    || config.includeShorts !== true
    || !isEmptyList(config.removedChannelIds)
    || !isEmptyList(config.removedDefaultChannelIds)
    || Number(config.weeklyGoalHours) !== 4
  ) return false

  const learnerProfile = profile.learnerProfile
  if (
    !isEmptyList(learnerProfile.languages)
    || learnerProfile.level !== null
    || !isEmptyList(learnerProfile.selectedChannelCatalogIds)
  ) return false

  const prompt = profile.noAnkiFrequentUserPrompt
  if (prompt.response !== null || prompt.respondedAt !== null) return false

  return Object.values(profile.onboarding).every(value => (
    value === false || value === null
  ))
}
