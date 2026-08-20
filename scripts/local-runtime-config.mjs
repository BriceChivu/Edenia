import { readFile, writeFile } from 'node:fs/promises'
import vm from 'node:vm'
import {
  normalizeAccountFeaturesRollout
} from '../src/core/account-feature-rollout.js'
import {
  normalizeGoogleIdentityClientId,
  normalizeGoogleSignInMode
} from '../src/integrations/runtime-config.js'

const YOUTUBE_PLACEHOLDER_KEYS = new Set([
  'PASTE_YOUR_RESTRICTED_YOUTUBE_API_KEY_HERE',
  'YOUR_RESTRICTED_KEY'
])
const SUPABASE_PUBLISHABLE_KEY_PLACEHOLDERS = new Set([
  'PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE'
])
const PLACEHOLDER_URLS = new Set([
  'PASTE_YOUR_SUPABASE_PROJECT_URL_HERE'
])

export const LOCAL_CONFIG_SETUP_COMMAND = 'cp config.example.js config.local.js'

function localConfigSetupMessage() {
  return `Run "${LOCAL_CONFIG_SETUP_COMMAND}", then add a restricted development YouTube API key.`
}

export function normalizeLocalYoutubeApiKey(value) {
  const key = String(value || '').trim()
  if (!key || YOUTUBE_PLACEHOLDER_KEYS.has(key.toUpperCase())) return ''
  return key
}

function normalizeOptionalRuntimeValue(value, placeholders) {
  const normalizedValue = String(value || '').trim()
  if (!normalizedValue || placeholders.has(normalizedValue.toUpperCase())) {
    return ''
  }
  return normalizedValue
}

export function normalizeLocalRuntimeConfig(value) {
  return {
    youtubeApiKey: normalizeLocalYoutubeApiKey(value?.youtubeApiKey),
    freePlusEnabled: value?.freePlusEnabled === true,
    plusCheckoutEnabled: value?.plusCheckoutEnabled === true,
    accountFeaturesRollout: normalizeAccountFeaturesRollout(
      value?.accountFeaturesRollout
    ),
    googleSignInMode: normalizeGoogleSignInMode(value?.googleSignInMode),
    googleIdentityClientId: normalizeGoogleIdentityClientId(
      normalizeOptionalRuntimeValue(
        value?.googleIdentityClientId,
        new Set(['PASTE_YOUR_GOOGLE_WEB_CLIENT_ID_HERE'])
      )
    ),
    turnstileSiteKey: normalizeOptionalRuntimeValue(
      value?.turnstileSiteKey,
      new Set(['PASTE_YOUR_TURNSTILE_SITE_KEY_HERE'])
    ),
    // Compatibility markers for cached pre-retirement app.js assets.
    videoOrganizationEnabled: true,
    channelVideoFormatToggleEnabled: true,
    studyGuidanceEnabled: value?.studyGuidanceEnabled === true,
    indexedDbBackupsEnabled: value?.indexedDbBackupsEnabled === true,
    indexedDbBackupCleanupEnabled:
      value?.indexedDbBackupCleanupEnabled === true,
    legacyProgressMigrationEnabled:
      value?.legacyProgressMigrationEnabled === true,
    supabaseUrl: normalizeOptionalRuntimeValue(
      value?.supabaseUrl,
      PLACEHOLDER_URLS
    ),
    supabasePublishableKey: normalizeOptionalRuntimeValue(
      value?.supabasePublishableKey,
      SUPABASE_PUBLISHABLE_KEY_PLACEHOLDERS
    )
  }
}

export async function readLocalRuntimeConfig(configPath) {
  let source
  try {
    source = await readFile(configPath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Local config.local.js is missing. ${localConfigSetupMessage()}`)
    }
    throw new Error(`Could not read local config.local.js. ${error.message}`)
  }

  const sandbox = { window: {} }
  try {
    vm.runInNewContext(source, sandbox, {
      filename: 'config.local.js',
      timeout: 1000
    })
  } catch {
    throw new Error(`Local config.local.js has invalid JavaScript. ${localConfigSetupMessage()}`)
  }

  const runtimeConfig = normalizeLocalRuntimeConfig(
    sandbox.window?.EDENIA_CONFIG
  )
  if (!runtimeConfig.youtubeApiKey) {
    throw new Error(`Local config.local.js has no usable YouTube API key. ${localConfigSetupMessage()}`)
  }
  return runtimeConfig
}

export async function readLocalYoutubeApiKey(configPath) {
  return (await readLocalRuntimeConfig(configPath)).youtubeApiKey
}

export async function writeLocalRuntimeConfig(outputPath, value) {
  const runtimeConfig = normalizeLocalRuntimeConfig(
    typeof value === 'object' && value !== null
      ? value
      : { youtubeApiKey: value }
  )
  if (!runtimeConfig.youtubeApiKey) {
    throw new Error('Refusing to write a local runtime config without a usable YouTube API key.')
  }

  const source = `window.EDENIA_CONFIG = ${JSON.stringify(
    runtimeConfig,
    null,
    2
  )}\n`
  await writeFile(outputPath, source)
}
