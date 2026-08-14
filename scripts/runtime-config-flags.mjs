import {
  ACCOUNT_FEATURE_ROLLOUTS
} from '../src/core/account-feature-rollout.js'
import {
  normalizeGoogleIdentityClientId
} from '../src/integrations/runtime-config.js'

const ACCOUNT_FEATURE_ROLLOUT_VALUES = new Set(
  Object.values(ACCOUNT_FEATURE_ROLLOUTS)
)
const GOOGLE_SIGN_IN_MODES = new Set([
  'off',
  'oauth_redirect',
  'id_token'
])
const SUPABASE_PUBLISHABLE_KEY_PATTERN =
  /^sb_publishable_[A-Za-z0-9_-]{8,}$/

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

export function parseGoogleSignInMode(value, name) {
  const normalizedValue = String(value || '').trim().toLowerCase()
  if (!normalizedValue) return 'oauth_redirect'
  if (GOOGLE_SIGN_IN_MODES.has(normalizedValue)) return normalizedValue
  throw new Error(`${name} must be off, oauth_redirect, or id_token`)
}

export function parseGoogleIdentityClientId(value, name) {
  const clientId = String(value || '').trim()
  if (!clientId) return ''
  if (normalizeGoogleIdentityClientId(clientId) === clientId) return clientId
  throw new Error(`${name} must be a Google Web client ID`)
}

export function assertLegacyProgressRuntimeConfig({
  enabled,
  supabasePublishableKey,
  supabaseUrl
}) {
  if (!enabled) return
  let projectUrl
  try {
    projectUrl = new URL(String(supabaseUrl || '').trim())
  } catch {}
  const hostedProjectUrl = projectUrl?.protocol === 'https:'
    && /^[a-z0-9-]+\.supabase\.co$/.test(projectUrl.hostname)
    && !projectUrl.username
    && !projectUrl.password
    && projectUrl.pathname === '/'
    && !projectUrl.search
    && !projectUrl.hash
  if (
    !hostedProjectUrl
    || !SUPABASE_PUBLISHABLE_KEY_PATTERN.test(
      String(supabasePublishableKey || '').trim()
    )
  ) {
    throw new Error(
      'Legacy progress migration requires a hosted Supabase URL and publishable key'
    )
  }
}
