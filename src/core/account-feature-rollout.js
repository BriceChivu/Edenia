export const ACCOUNT_FEATURE_ROLLOUTS = Object.freeze({
  OFF: 'off',
  PUBLIC: 'public'
})

const ACCOUNT_FEATURE_ROLLOUT_VALUES = new Set(
  Object.values(ACCOUNT_FEATURE_ROLLOUTS)
)

export function normalizeAccountFeaturesRollout(value) {
  const normalizedValue = String(value || '').trim().toLowerCase()
  return ACCOUNT_FEATURE_ROLLOUT_VALUES.has(normalizedValue)
    ? normalizedValue
    : ACCOUNT_FEATURE_ROLLOUTS.OFF
}

export function deriveAccountFeaturesEnabled(
  runtimeEnvironment,
  rollout = ACCOUNT_FEATURE_ROLLOUTS.OFF,
  authTrialEnabled = false
) {
  if (!runtimeEnvironment || runtimeEnvironment.isSandbox === true
    || runtimeEnvironment.isTinySwordsTester === true) return false

  // Trial admission is enforced by the server. Public rollout cannot enable it.
  if (runtimeEnvironment.isAuthTrial === true) return authTrialEnabled === true
  const normalizedRollout = normalizeAccountFeaturesRollout(rollout)
  return normalizedRollout === ACCOUNT_FEATURE_ROLLOUTS.PUBLIC
}
