const DEFAULT_TIMEOUT_MS = 10000

const requireEnvironment = name => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for Auth monitor freshness`)
  return value
}

export const checkAuthHealthFreshness = async ({
  endpoint,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  token,
} = {}) => {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Auth monitor freshness requires fetch')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'GET',
      signal: controller.signal,
    })
    return { healthy: response.ok, status: response.status }
  } catch {
    return { healthy: false, status: null }
  } finally {
    clearTimeout(timeout)
  }
}

const run = async () => {
  const supabaseUrl = requireEnvironment('SUPABASE_URL').replace(/\/$/u, '')
  const token = requireEnvironment('EDENIA_AUTH_MONITOR_TOKEN')
  const result = await checkAuthHealthFreshness({
    endpoint: `${supabaseUrl}/functions/v1/auth-health-monitor`,
    token,
  })
  console.log(`Auth monitor freshness status=${result.status ?? 'none'}`)
  if (!result.healthy) {
    throw new Error('Auth health records are stale, alerting, or unavailable')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(error => {
    console.error(error?.message ?? 'Auth monitor freshness failed')
    process.exitCode = 1
  })
}
