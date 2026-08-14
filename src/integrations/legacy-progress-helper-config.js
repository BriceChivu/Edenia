export const LEGACY_PROGRESS_CREATE_FUNCTION_PATH =
  '/functions/v1/create-legacy-progress-transfer'
export const LEGACY_PROGRESS_PRODUCTION_HELPER_ORIGIN =
  'https://bricechivu.github.io'
export const LEGACY_PROGRESS_PRODUCTION_RETURN_URL =
  'https://www.edenia.study/'
export const LEGACY_PROGRESS_LOCAL_HELPER_ORIGIN =
  'http://localhost:8002'
export const LEGACY_PROGRESS_LOCAL_RETURN_URL =
  'http://localhost:8000/?legacy_migration_test=1'

const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{8,}$/
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/
const CONFIG_KEYS = [
  'createTransferUrl',
  'returnUrl',
  'supabasePublishableKey',
  'supabaseUrl'
]

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const actual = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
}

function normalizeProjectUrl(value, { localTest }) {
  let url
  try {
    url = new URL(String(value || '').trim())
  } catch {
    return null
  }
  const hosted = url.protocol === 'https:'
    && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)
  const local = localTest && url.origin === LEGACY_PROGRESS_LOCAL_HELPER_ORIGIN
  if (
    (!hosted && !local)
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) return null
  return url
}

function isExactLocalTestLocation(url) {
  return url.origin === LEGACY_PROGRESS_LOCAL_HELPER_ORIGIN
    && url.searchParams.size === 1
    && url.searchParams.getAll('legacy_migration_test').length === 1
    && url.searchParams.get('legacy_migration_test') === '1'
    && !url.hash
}

export function deriveLegacyProgressHelperRuntime(target = globalThis) {
  let locationUrl
  try {
    locationUrl = new URL(target?.location?.href)
  } catch {
    return Object.freeze({ valid: false })
  }
  const localTest = isExactLocalTestLocation(locationUrl)
  const production = locationUrl.origin
      === LEGACY_PROGRESS_PRODUCTION_HELPER_ORIGIN
    && ['/edenia-migrate/', '/edenia-migrate/index.html'].includes(
      locationUrl.pathname
    )
    && !locationUrl.search
    && !locationUrl.hash
  const config = target?.EDENIA_LEGACY_MIGRATION_CONFIG
  if ((!localTest && !production) || !hasExactKeys(config, CONFIG_KEYS)) {
    return Object.freeze({ valid: false })
  }

  const projectUrl = normalizeProjectUrl(config.supabaseUrl, { localTest })
  const expectedReturnUrl = localTest
    ? LEGACY_PROGRESS_LOCAL_RETURN_URL
    : LEGACY_PROGRESS_PRODUCTION_RETURN_URL
  const expectedCreateUrl = projectUrl
    ? new URL(LEGACY_PROGRESS_CREATE_FUNCTION_PATH, projectUrl.origin).href
    : ''
  if (
    !projectUrl
    || config.createTransferUrl !== expectedCreateUrl
    || config.returnUrl !== expectedReturnUrl
    || !PUBLISHABLE_KEY_PATTERN.test(config.supabasePublishableKey)
  ) return Object.freeze({ valid: false })

  return Object.freeze({
    createTransferUrl: expectedCreateUrl,
    disclosureDelayMs: 1_500,
    localTest,
    returnUrl: expectedReturnUrl,
    supabasePublishableKey: config.supabasePublishableKey,
    valid: true
  })
}

export function createLegacyProgressReturnUrl(
  runtime,
  outcome,
  capability = null
) {
  if (!runtime?.valid) return ''
  const fragment = outcome === 'transfer' && CAPABILITY_PATTERN.test(
    capability || ''
  )
    ? `transfer.${capability}`
    : outcome === 'none'
      ? 'none'
      : outcome === 'deferred'
        ? 'deferred'
        : ''
  if (!fragment) return ''
  const url = new URL(runtime.returnUrl)
  url.hash = `edenia-legacy-progress=${fragment}`
  return url.href
}
