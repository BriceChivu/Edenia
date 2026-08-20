import {
  normalizeAccountFeaturesRollout
} from '../core/account-feature-rollout.js'

const GOOGLE_IDENTITY_CLIENT_ID_PATTERN =
  /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/

export function publicConfig(target = window) {
  return target.EDENIA_CONFIG || {}
}

export function getYoutubeApiKey(target = window) {
  return String(publicConfig(target).youtubeApiKey || '').trim()
}

export function hasYoutubeApiKey(target = window) {
  return Boolean(getYoutubeApiKey(target))
}

export function getFreePlusEnabled(target = window) {
  return publicConfig(target).freePlusEnabled === true
}

export function getPlusCheckoutEnabled(target = window) {
  return publicConfig(target).plusCheckoutEnabled === true
}

export function getAccountFeaturesRollout(target = window) {
  return normalizeAccountFeaturesRollout(
    publicConfig(target).accountFeaturesRollout
  )
}

export function normalizeGoogleSignInMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  return ['off', 'id_token'].includes(mode)
    ? mode
    : 'id_token'
}

export function getGoogleSignInMode(target = window) {
  return normalizeGoogleSignInMode(publicConfig(target).googleSignInMode)
}

export function getGoogleIdentityClientId(target = window) {
  return normalizeGoogleIdentityClientId(
    publicConfig(target).googleIdentityClientId
  )
}

export function normalizeGoogleIdentityClientId(value) {
  const clientId = String(value || '').trim()
  return GOOGLE_IDENTITY_CLIENT_ID_PATTERN.test(clientId) ? clientId : ''
}

export function hasGoogleIdentityServicesRuntimeConfig(target = window) {
  return getGoogleSignInMode(target) === 'id_token'
    && Boolean(getGoogleIdentityClientId(target))
}

export function getTurnstileSiteKey(target = window) {
  return String(publicConfig(target).turnstileSiteKey || '').trim()
}

export function hasTurnstileRuntimeConfig(target = window) {
  return Boolean(getTurnstileSiteKey(target))
}

export function getStudyGuidanceEnabled(target = window) {
  return publicConfig(target).studyGuidanceEnabled === true
}

export function getIndexedDbBackupsEnabled(target = window) {
  return publicConfig(target).indexedDbBackupsEnabled === true
}

export function getIndexedDbBackupCleanupEnabled(target = window) {
  return publicConfig(target).indexedDbBackupCleanupEnabled === true
}

export function getLegacyProgressMigrationEnabled(target = window) {
  return publicConfig(target).legacyProgressMigrationEnabled === true
}

export function getSupabaseUrl(target = window) {
  return String(publicConfig(target).supabaseUrl || '').trim()
}

export function getSupabasePublishableKey(target = window) {
  return String(publicConfig(target).supabasePublishableKey || '').trim()
}

export function hasSupabaseRuntimeConfig(target = window) {
  return Boolean(
    getSupabaseUrl(target) && getSupabasePublishableKey(target)
  )
}
