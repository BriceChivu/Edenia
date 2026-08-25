import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

const AUTH_HEALTH_PATH = '/auth/v1/health'
const DEFAULT_TIMEOUT_MS = 10000
const MISSING_RECORDER_PATTERN = /private\.record_auth_health_check[\s\S]*does not exist/iu

export const classifyAuthHealthResponse = ({ status, error } = {}) => {
  if (error) return 'network_error'
  if (status >= 200 && status < 300) return 'available'
  if (status >= 400 && status < 500) return 'expected_client_error'
  return 'provider_unavailable'
}

export const probeAuthHealth = async ({
  endpoint,
  apiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) => {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Auth health monitoring requires fetch')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()

  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: apiKey ? { apikey: apiKey } : undefined,
      signal: controller.signal
    })
    return {
      outcome: classifyAuthHealthResponse({ status: response.status }),
      status: response.status,
      latencyMs: Math.max(0, Date.now() - startedAt)
    }
  } catch (error) {
    return {
      outcome: classifyAuthHealthResponse({ error }),
      status: null,
      latencyMs: Math.max(0, Date.now() - startedAt)
    }
  } finally {
    clearTimeout(timeout)
  }
}

const requireEnvironment = name => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for Auth health monitoring`)
  return value
}

const describeRecorderFailure = error => {
  if (MISSING_RECORDER_PATTERN.test(error?.stderr ?? '')) {
    return 'Auth health recorder schema is not deployed'
  }
  if (error?.code === 'ENOENT') {
    return 'Auth health recorder client is unavailable'
  }
  return 'Auth health recorder failed'
}

const run = async () => {
  const supabaseUrl = requireEnvironment('SUPABASE_URL').replace(/\/$/u, '')
  const databaseUrl = requireEnvironment('SUPABASE_DB_URL')
  const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
  const result = await probeAuthHealth({
    endpoint: `${supabaseUrl}${AUTH_HEALTH_PATH}`,
    apiKey
  })
  const sql = [
    'select outcome || \'|\' || alert_state || \'|\' || alert_action || \'|\' || consecutive_provider_failures',
    `from private.record_auth_health_check('${result.outcome}', ${result.status ?? 'null'}, ${result.latencyMs})`
  ].join(' ')
  let stdout
  try {
    ({ stdout } = await execFile('psql', [
      '--no-psqlrc',
      '--dbname',
      databaseUrl,
      '--tuples-only',
      '--no-align',
      '--command',
      sql
    ], { maxBuffer: 1024 * 1024 }))
  } catch (error) {
    throw new Error(describeRecorderFailure(error))
  }
  const [outcome, alertState, alertAction, failures] = stdout.trim().split('|')
  if (!outcome || !alertState || !alertAction || !failures) {
    throw new Error('Auth health recorder returned no aggregate result')
  }
  console.log(
    `Auth health outcome=${outcome} status=${result.status ?? 'none'} `
      + `latency_ms=${result.latencyMs} alert=${alertState} failures=${failures}`
  )
  if (alertState === 'open') {
    throw new Error(`Auth health alert is ${alertAction}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(error => {
    console.error(error?.message ?? 'Auth health monitoring failed')
    process.exitCode = 1
  })
}
