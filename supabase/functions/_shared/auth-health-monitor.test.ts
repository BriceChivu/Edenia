import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyAuthHealthResponse,
  handleAuthHealthMonitorRequest,
  type AuthHealthMonitorDependencies,
  type AuthHealthProbeResult,
} from './auth-health-monitor.ts'

const ENDPOINT = 'https://project.supabase.co/functions/v1/auth-health-monitor'
const TOKEN = 'a'.repeat(64)

function request({
  canary,
  method = 'POST',
  token = TOKEN,
}: { canary?: string; method?: string; token?: string } = {}) {
  const headers = new Headers({ Authorization: `Bearer ${token}` })
  if (canary) headers.set('X-Edenia-Auth-Monitor-Canary', canary)
  return new Request(ENDPOINT, { headers, method })
}

function harness({
  canaryEnabled = false,
  probe = { latencyMs: 8, outcome: 'available', status: 200 },
  status = { alertState: 'healthy', fresh: true, lastOutcome: 'available' },
  throwOn = '',
}: {
  canaryEnabled?: boolean
  probe?: AuthHealthProbeResult
  status?: Awaited<ReturnType<AuthHealthMonitorDependencies['readAuthHealthStatus']>>
  throwOn?: 'probe' | 'read' | 'record' | ''
} = {}) {
  const calls = {
    probe: 0,
    read: 0,
    record: [] as AuthHealthProbeResult[],
  }
  const dependencies: AuthHealthMonitorDependencies = {
    canaryEnabled,
    monitorToken: TOKEN,
    async probeAuthHealth() {
      calls.probe += 1
      if (throwOn === 'probe') throw new Error('fixture credential must not leak')
      return probe
    },
    async readAuthHealthStatus() {
      calls.read += 1
      if (throwOn === 'read') throw new Error('fixture credential must not leak')
      return status
    },
    async recordAuthHealth(result) {
      calls.record.push(result)
      if (throwOn === 'record') throw new Error('fixture credential must not leak')
    },
  }
  return { calls, dependencies }
}

async function responseJson(response: Response) {
  return await response.json() as Record<string, unknown>
}

test('classifies expected client errors separately from provider failures', () => {
  assert.equal(classifyAuthHealthResponse({ status: 204 }), 'available')
  assert.equal(classifyAuthHealthResponse({ status: 400 }), 'expected_client_error')
  assert.equal(classifyAuthHealthResponse({ status: 503 }), 'provider_unavailable')
})

test('rejects missing or malformed bearer capabilities before any operation', async () => {
  for (const token of ['', 'short', 'g'.repeat(64), 'b'.repeat(64)]) {
    const current = harness()
    const response = await handleAuthHealthMonitorRequest(
      request({ token }),
      current.dependencies,
    )
    assert.equal(response.status, 401)
    assert.deepEqual(await responseJson(response), { status: 'unauthorized' })
    assert.deepEqual(current.calls, { probe: 0, read: 0, record: [] })
  }
})

test('the external POST probes and records only aggregate availability', async () => {
  const current = harness()
  const response = await handleAuthHealthMonitorRequest(
    request(),
    current.dependencies,
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await responseJson(response), { status: 'available' })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.deepEqual(current.calls, {
    probe: 1,
    read: 0,
    record: [{ latencyMs: 8, outcome: 'available', status: 200 }],
  })
})

test('expected client errors stay up while provider and network failures alert', async () => {
  const cases: Array<[AuthHealthProbeResult, number]> = [
    [{ latencyMs: 4, outcome: 'expected_client_error', status: 400 }, 200],
    [{ latencyMs: 7, outcome: 'provider_unavailable', status: 503 }, 503],
    [{ latencyMs: 10_000, outcome: 'network_error', status: null }, 503],
  ]
  for (const [probe, expectedStatus] of cases) {
    const current = harness({ probe })
    const response = await handleAuthHealthMonitorRequest(
      request(),
      current.dependencies,
    )
    assert.equal(response.status, expectedStatus)
    assert.deepEqual(await responseJson(response), { status: probe.outcome })
    assert.deepEqual(current.calls.record, [probe])
  }
})

test('the GET watchdog fails closed for stale, open, or unreadable status', async () => {
  const cases = [
    [
      { alertState: 'healthy' as const, fresh: true, lastOutcome: 'available' as const },
      '',
      200,
      'healthy',
    ],
    [
      { alertState: 'healthy' as const, fresh: false, lastOutcome: 'available' as const },
      '',
      503,
      'stale',
    ],
    [
      { alertState: 'open' as const, fresh: true, lastOutcome: 'network_error' as const },
      '',
      503,
      'alert_open',
    ],
    [
      { alertState: 'healthy' as const, fresh: true, lastOutcome: 'available' as const },
      'read' as const,
      503,
      'monitor_unavailable',
    ],
  ] as const
  for (const [status, throwOn, expectedStatus, expectedBody] of cases) {
    const current = harness({ status, throwOn })
    const response = await handleAuthHealthMonitorRequest(
      request({ method: 'GET' }),
      current.dependencies,
    )
    assert.equal(response.status, expectedStatus)
    assert.deepEqual(await responseJson(response), { status: expectedBody })
    assert.equal(current.calls.probe, 0)
    assert.deepEqual(current.calls.record, [])
  }
})

test('a canary is flag-gated, bounded, and records no caller input', async () => {
  const disabled = harness()
  const disabledResponse = await handleAuthHealthMonitorRequest(
    request({ canary: 'provider_unavailable' }),
    disabled.dependencies,
  )
  assert.equal(disabledResponse.status, 403)
  assert.deepEqual(disabled.calls.record, [])

  const invalid = harness({ canaryEnabled: true })
  const invalidResponse = await handleAuthHealthMonitorRequest(
    request({ canary: 'available' }),
    invalid.dependencies,
  )
  assert.equal(invalidResponse.status, 400)
  assert.deepEqual(invalid.calls.record, [])

  const enabled = harness({ canaryEnabled: true })
  const response = await handleAuthHealthMonitorRequest(
    request({ canary: 'provider_unavailable' }),
    enabled.dependencies,
  )
  assert.equal(response.status, 503)
  assert.deepEqual(await responseJson(response), {
    status: 'provider_unavailable',
  })
  assert.equal(enabled.calls.probe, 0)
  assert.deepEqual(enabled.calls.record, [{
    latencyMs: 0,
    outcome: 'provider_unavailable',
    status: 503,
  }])
})

test('unsupported methods and dependency errors return bounded diagnostics', async () => {
  const method = harness()
  const methodResponse = await handleAuthHealthMonitorRequest(
    request({ method: 'PUT' }),
    method.dependencies,
  )
  assert.equal(methodResponse.status, 405)
  assert.equal(methodResponse.headers.get('allow'), 'GET, POST')

  for (const throwOn of ['probe', 'record'] as const) {
    const current = harness({ throwOn })
    const response = await handleAuthHealthMonitorRequest(
      request(),
      current.dependencies,
    )
    assert.equal(response.status, 503)
    const serialized = JSON.stringify(await responseJson(response))
    assert.equal(serialized, '{"status":"monitor_unavailable"}')
    assert.doesNotMatch(serialized, /credential|token|email|uuid/i)
  }
})
