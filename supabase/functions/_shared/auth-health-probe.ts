import {
  classifyAuthHealthResponse,
  type AuthHealthProbeResult,
} from './auth-health-monitor.ts'

type AuthHealthProbeOptions = {
  fetchImpl?: typeof fetch
  now?: () => number
  publishableKey?: string
  supabaseUrl: string
  timeoutMs?: number
}

export async function probeAuthHealth({
  fetchImpl = fetch,
  now = Date.now,
  publishableKey,
  supabaseUrl,
  timeoutMs = 10_000,
}: AuthHealthProbeOptions): Promise<AuthHealthProbeResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = now()
  try {
    const response = await fetchImpl(`${supabaseUrl}/auth/v1/health`, {
      headers: publishableKey ? { apikey: publishableKey } : undefined,
      signal: controller.signal,
    })
    return {
      outcome: classifyAuthHealthResponse({ status: response.status }),
      status: response.status,
      latencyMs: Math.max(0, now() - startedAt),
    }
  } catch {
    return {
      outcome: 'network_error',
      status: null,
      latencyMs: Math.max(0, now() - startedAt),
    }
  } finally {
    clearTimeout(timeout)
  }
}
