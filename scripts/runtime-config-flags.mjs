import {
  ACCOUNT_FEATURE_ROLLOUTS
} from '../src/core/account-feature-rollout.js'

const ACCOUNT_FEATURE_ROLLOUT_VALUES = new Set(
  Object.values(ACCOUNT_FEATURE_ROLLOUTS)
)

export function parseRuntimeConfigFlag(value, name) {
  const normalizedValue = String(value || '').trim().toLowerCase()
  if (!normalizedValue || normalizedValue === 'false') return false
  if (normalizedValue === 'true') return true
  throw new Error(`${name} must be true or false`)
}

export function parseRuntimeConfigRollout(value, name) {
  const normalizedValue = String(value || '').trim().toLowerCase()
  if (!normalizedValue) return ACCOUNT_FEATURE_ROLLOUTS.OFF
  if (ACCOUNT_FEATURE_ROLLOUT_VALUES.has(normalizedValue)) {
    return normalizedValue
  }
  throw new Error(`${name} must be off, internal, or public`)
}
