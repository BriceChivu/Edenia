import {
  deriveLegacyProgressHelperRuntime,
  LEGACY_PROGRESS_CREATE_FUNCTION_PATH,
  LEGACY_PROGRESS_PRODUCTION_HELPER_ORIGIN,
  LEGACY_PROGRESS_PRODUCTION_RETURN_URL
} from '../src/integrations/legacy-progress-helper-config.js'

export function createLegacyMigrationHelperProductionConfig({
  supabasePublishableKey,
  supabaseUrl
}) {
  let projectUrl
  try {
    projectUrl = new URL(String(supabaseUrl || '').trim())
  } catch {
    throw new TypeError('SUPABASE_URL must be a hosted Supabase project URL')
  }
  const config = {
    createTransferUrl: new URL(
      LEGACY_PROGRESS_CREATE_FUNCTION_PATH,
      projectUrl.origin
    ).href,
    returnUrl: LEGACY_PROGRESS_PRODUCTION_RETURN_URL,
    supabasePublishableKey: String(supabasePublishableKey || '').trim(),
    supabaseUrl: projectUrl.href
  }
  const runtime = deriveLegacyProgressHelperRuntime({
    EDENIA_LEGACY_MIGRATION_CONFIG: config,
    location: {
      href: `${LEGACY_PROGRESS_PRODUCTION_HELPER_ORIGIN}/edenia-migrate/`
    }
  })
  if (!runtime.valid) {
    throw new TypeError('Migration helper Supabase configuration is invalid')
  }
  return config
}

export function renderLegacyMigrationHelperConfig(config) {
  return `window.EDENIA_LEGACY_MIGRATION_CONFIG = ${JSON.stringify(
    config,
    null,
    2
  )}\n`
}
