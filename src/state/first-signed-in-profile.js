import { normalizeOnboardingState } from './onboarding-state.js'

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

export async function createInitialSignedInProfileEnvelope(
  onboardingState,
  {
    createEnvelope,
    normalizeLearnerProfile,
    now = () => new Date()
  }
) {
  if (
    typeof createEnvelope !== 'function'
    || typeof normalizeLearnerProfile !== 'function'
    || typeof now !== 'function'
  ) {
    throw new TypeError('Initial signed-in profile creation requires adapters')
  }

  const initialState = cloneJson(onboardingState)
  if (!initialState) return null
  normalizeLearnerProfile(initialState)
  normalizeOnboardingState(initialState)
  const languageId = initialState.learnerProfile.languages[0] || null
  const levelId = initialState.learnerProfile.level
  if (
    !languageId
    || (languageId !== 'other' && !levelId)
    || !initialState.onboarding.accountStepReachedAt
  ) return null

  const completedAt = new Date(now()).toISOString()
  initialState.activityLog = []
  initialState.anki = {}
  initialState.videos = {}
  initialState.cityProgress = {
    maxLevelIndex: 0,
    pendingLevelIndex: null
  }
  initialState.learnerProfile.createdAt = completedAt
  initialState.learnerProfile.updatedAt = completedAt
  initialState.onboarding.accountStepReachedAt = null
  initialState.onboarding.levelUpGuidanceShownAt = null
  initialState.onboarding.recommendationsAppliedAt = null
  initialState.onboarding.setupCompleted = true
  initialState.onboarding.setupCompletedAt = completedAt
  initialState.onboarding.walkthroughCompleted = false
  initialState.onboarding.walkthroughCompletedAt = null

  const result = await createEnvelope(initialState, {
    now: () => new Date(completedAt)
  })
  return result?.envelope || null
}
