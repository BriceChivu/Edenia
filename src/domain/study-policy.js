// Study XP is credited video minutes plus credited Anki reviews. Raw historical
// activity without XP provenance never becomes earned XP retroactively.
export const MIN_DAILY_STREAK_XP = 10
export const STUDY_POLICY_VERSION = 1

export function qualifiesStudyDay(points) {
  return typeof points === 'number' && Number.isFinite(points)
    && points >= MIN_DAILY_STREAK_XP
}
