import assert from 'node:assert/strict'
import test from 'node:test'

import { probeAuthHealth } from './auth-health-probe.ts'

test('a stalled Auth request aborts within its bounded timeout without retaining the error', async () => {
  let observedSignal: AbortSignal | undefined
  const timestamps = [1_000, 11_000]
  const result = await probeAuthHealth({
    fetchImpl: async (_input, init) => {
      observedSignal = init?.signal as AbortSignal
      await new Promise((_, reject) => {
        observedSignal?.addEventListener(
          'abort',
          () => reject(new Error('fixture endpoint and credential must not leak')),
          { once: true },
        )
      })
      throw new Error('unreachable')
    },
    now: () => timestamps.shift() ?? 11_000,
    publishableKey: 'fixture-publishable-key',
    supabaseUrl: 'https://project.supabase.co',
    timeoutMs: 1,
  })

  assert.equal(observedSignal?.aborted, true)
  assert.deepEqual(result, {
    latencyMs: 10_000,
    outcome: 'network_error',
    status: null,
  })
  assert.doesNotMatch(JSON.stringify(result), /endpoint|credential|fixture/i)
})
