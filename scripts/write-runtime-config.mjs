import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertLegacyProgressRuntimeConfig,
  parseGoogleIdentityClientId,
  parseGoogleSignInMode,
  parseRuntimeConfigFlag,
  parseRuntimeConfigRollout
} from './runtime-config-flags.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const outputPath = resolve(projectRoot, '_site', 'config.local.js')
const requireKey = process.argv.includes('--require-key')
const youtubeApiKey = process.env.YOUTUBE_API_KEY || ''
const supabaseUrl = process.env.SUPABASE_URL || ''
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || ''
const legacyProgressMigrationEnabled = parseRuntimeConfigFlag(
  process.env.EDENIA_LEGACY_PROGRESS_MIGRATION_ENABLED,
  'EDENIA_LEGACY_PROGRESS_MIGRATION_ENABLED'
)

if (requireKey && !youtubeApiKey) {
  throw new Error('YOUTUBE_API_KEY is required for the production runtime config')
}
assertLegacyProgressRuntimeConfig({
  enabled: legacyProgressMigrationEnabled,
  supabasePublishableKey,
  supabaseUrl
})

const runtimeConfig = `window.EDENIA_CONFIG = ${JSON.stringify({
  youtubeApiKey,
  freePlusEnabled: parseRuntimeConfigFlag(
    process.env.EDENIA_FREE_PLUS_ENABLED,
    'EDENIA_FREE_PLUS_ENABLED'
  ),
  plusCheckoutEnabled: parseRuntimeConfigFlag(
    process.env.EDENIA_PLUS_CHECKOUT_ENABLED,
    'EDENIA_PLUS_CHECKOUT_ENABLED'
  ),
  accountFeaturesRollout: parseRuntimeConfigRollout(
    process.env.EDENIA_ACCOUNT_FEATURES_ROLLOUT,
    'EDENIA_ACCOUNT_FEATURES_ROLLOUT'
  ),
  googleSignInMode: parseGoogleSignInMode(
    process.env.EDENIA_GOOGLE_SIGN_IN_MODE,
    'EDENIA_GOOGLE_SIGN_IN_MODE'
  ),
  googleOneTapEnabled: parseRuntimeConfigFlag(
    process.env.EDENIA_GOOGLE_ONE_TAP_ENABLED,
    'EDENIA_GOOGLE_ONE_TAP_ENABLED'
  ),
  googleIdentityClientId: parseGoogleIdentityClientId(
    process.env.EDENIA_GOOGLE_IDENTITY_CLIENT_ID,
    'EDENIA_GOOGLE_IDENTITY_CLIENT_ID'
  ),
  turnstileSiteKey: String(
    process.env.EDENIA_TURNSTILE_SITE_KEY || ''
  ).trim(),
  // Compatibility markers for cached pre-retirement app.js assets.
  videoOrganizationEnabled: true,
  channelVideoFormatToggleEnabled: true,
  studyGuidanceEnabled: parseRuntimeConfigFlag(
    process.env.EDENIA_STUDY_GUIDANCE_ENABLED,
    'EDENIA_STUDY_GUIDANCE_ENABLED'
  ),
  indexedDbBackupsEnabled: parseRuntimeConfigFlag(
    process.env.EDENIA_INDEXED_DB_BACKUPS_ENABLED,
    'EDENIA_INDEXED_DB_BACKUPS_ENABLED'
  ),
  indexedDbBackupCleanupEnabled: parseRuntimeConfigFlag(
    process.env.EDENIA_INDEXED_DB_BACKUP_CLEANUP_ENABLED,
    'EDENIA_INDEXED_DB_BACKUP_CLEANUP_ENABLED'
  ),
  legacyProgressMigrationEnabled,
  learnerProfileLifecycleEnabled: parseRuntimeConfigFlag(
    process.env.EDENIA_LEARNER_PROFILE_LIFECYCLE_ENABLED,
    'EDENIA_LEARNER_PROFILE_LIFECYCLE_ENABLED'
  ),
  supabaseUrl,
  supabasePublishableKey
}, null, 2)}\n`

await writeFile(outputPath, runtimeConfig)
console.log(`Wrote runtime config to ${outputPath}`)
