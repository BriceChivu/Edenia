export type AuthHealthOutcome =
  | 'available'
  | 'expected_client_error'
  | 'provider_unavailable'
  | 'network_error'

export type AuthHealthProbeResult = {
  latencyMs: number
  outcome: AuthHealthOutcome
  status: number | null
}

export type AuthHealthMonitorStatus = {
  alertState: 'healthy' | 'open'
  fresh: boolean
  lastOutcome: AuthHealthOutcome | null
}

export type AuthHealthMonitorDependencies = {
  canaryEnabled?: boolean
  monitorToken: string
  probeAuthHealth: () => Promise<AuthHealthProbeResult>
  readAuthHealthStatus: () => Promise<AuthHealthMonitorStatus>
  recordAuthHealth: (result: AuthHealthProbeResult) => Promise<void>
}

const TOKEN_PATTERN = /^[0-9a-f]{64}$/u
const CANARY_OUTCOMES = new Set<AuthHealthOutcome>([
  'network_error',
  'provider_unavailable',
])
const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'",
  'Cross-Origin-Resource-Policy': 'same-site',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
})

export function classifyAuthHealthResponse({
  status,
}: { status: number }): AuthHealthOutcome {
  if (status >= 200 && status < 300) return 'available'
  if (status >= 400 && status < 500) return 'expected_client_error'
  return 'provider_unavailable'
}

function jsonResponse(statusValue: string, status: number, allow?: string) {
  const headers = new Headers({
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
  })
  if (allow) headers.set('Allow', allow)
  return new Response(JSON.stringify({ status: statusValue }), {
    headers,
    status,
  })
}

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || ''
  const match = /^Bearer ([0-9a-f]{64})$/u.exec(authorization)
  return match?.[1] || ''
}

async function tokenMatches(provided: string, expected: string) {
  if (!TOKEN_PATTERN.test(provided) || !TOKEN_PATTERN.test(expected)) {
    return false
  }
  const encoder = new TextEncoder()
  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const providedBytes = new Uint8Array(providedDigest)
  const expectedBytes = new Uint8Array(expectedDigest)
  let mismatch = 0
  for (let index = 0; index < providedBytes.length; index += 1) {
    mismatch |= providedBytes[index] ^ expectedBytes[index]
  }
  return mismatch === 0
}

function canaryResult(outcome: AuthHealthOutcome): AuthHealthProbeResult {
  return {
    latencyMs: outcome === 'network_error' ? 10_000 : 0,
    outcome,
    status: outcome === 'network_error' ? null : 503,
  }
}

export async function handleAuthHealthMonitorRequest(
  request: Request,
  dependencies: AuthHealthMonitorDependencies,
) {
  const authorized = await tokenMatches(
    bearerToken(request),
    dependencies.monitorToken,
  )
  if (!authorized) return jsonResponse('unauthorized', 401)

  if (!['GET', 'POST'].includes(request.method)) {
    return jsonResponse('method_not_allowed', 405, 'GET, POST')
  }

  try {
    if (request.method === 'GET') {
      const report = await dependencies.readAuthHealthStatus()
      if (!report.fresh) return jsonResponse('stale', 503)
      if (report.alertState === 'open') return jsonResponse('alert_open', 503)
      return jsonResponse('healthy', 200)
    }

    const canary = request.headers.get('x-edenia-auth-monitor-canary')
    let result: AuthHealthProbeResult
    if (canary !== null) {
      if (!dependencies.canaryEnabled) {
        return jsonResponse('canary_disabled', 403)
      }
      if (!CANARY_OUTCOMES.has(canary as AuthHealthOutcome)) {
        return jsonResponse('invalid_canary', 400)
      }
      result = canaryResult(canary as AuthHealthOutcome)
    } else {
      result = await dependencies.probeAuthHealth()
    }
    await dependencies.recordAuthHealth(result)
    const responseStatus = result.outcome === 'available'
      || result.outcome === 'expected_client_error'
      ? 200
      : 503
    return jsonResponse(result.outcome, responseStatus)
  } catch {
    return jsonResponse('monitor_unavailable', 503)
  }
}
