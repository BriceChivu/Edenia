import { createClient } from '@supabase/supabase-js'

import { probeAuthHealth as runAuthHealthProbe } from '../_shared/auth-health-probe.ts'
import {
  handleAuthHealthMonitorRequest,
  type AuthHealthOutcome,
  type AuthHealthProbeResult,
} from '../_shared/auth-health-monitor.ts'

type RpcError = { message: string }

const requireEnvironment = (name: string) => {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Auth monitor configuration is unavailable: ${name}`)
  return value
}

const supabaseUrl = requireEnvironment('SUPABASE_URL').replace(/\/$/u, '')
const supabase = createClient(
  supabaseUrl,
  requireEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  },
)

const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim()

const probeAuthHealth = () => runAuthHealthProbe({
  publishableKey,
  supabaseUrl,
})

async function recordAuthHealth(result: AuthHealthProbeResult) {
  const { data, error } = await supabase.rpc(
    'record_auth_health_check_from_monitor',
    {
      p_http_status: result.status,
      p_latency_ms: result.latencyMs,
      p_outcome: result.outcome,
    },
  ) as { data: unknown; error: RpcError | null }
  const row = Array.isArray(data) ? data[0] : null
  if (error || !row || typeof row !== 'object') {
    throw new Error('Auth health recorder failed')
  }
}

async function readAuthHealthStatus() {
  const { data, error } = await supabase.rpc(
    'read_auth_health_monitor_status',
  ) as { data: unknown; error: RpcError | null }
  const row = Array.isArray(data) ? data[0] : null
  if (
    error
    || !row
    || typeof row !== 'object'
    || typeof row.fresh !== 'boolean'
    || !['healthy', 'open'].includes(String(row.alert_state))
  ) {
    throw new Error('Auth health status read failed')
  }
  return {
    alertState: String(row.alert_state) as 'healthy' | 'open',
    fresh: row.fresh,
    lastOutcome: row.last_outcome === null
      ? null
      : String(row.last_outcome) as AuthHealthOutcome,
  }
}

Deno.serve(request => handleAuthHealthMonitorRequest(request, {
  canaryEnabled: Deno.env.get('EDENIA_AUTH_MONITOR_CANARY_ENABLED') === 'true',
  monitorToken: Deno.env.get('EDENIA_AUTH_MONITOR_TOKEN')?.trim() || '',
  probeAuthHealth,
  readAuthHealthStatus,
  recordAuthHealth,
}))
