export const ACCOUNT_FEATURE_ROLLOUTS = Object.freeze({
  OFF: 'off',
  INTERNAL: 'internal',
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
  rollout = ACCOUNT_FEATURE_ROLLOUTS.OFF
) {
  if (!runtimeEnvironment || runtimeEnvironment.isSandbox === true) return false

  const normalizedRollout = normalizeAccountFeaturesRollout(rollout)
  if (normalizedRollout === ACCOUNT_FEATURE_ROLLOUTS.PUBLIC) return true

  return normalizedRollout === ACCOUNT_FEATURE_ROLLOUTS.INTERNAL
    && (
      runtimeEnvironment.isInternalTest === true
      || runtimeEnvironment.isLocalDevelopment === true
    )
}
