import assert from 'node:assert/strict'
import test from 'node:test'
import { createProfileOpeningDiagnostics } from '../../src/integrations/profile-opening-diagnostics.js'

test('trial opening timings are bounded, detached, and accept fixed categories only', () => {
  let now = 0
  const diagnostics = createProfileOpeningDiagnostics({ enabled: true, now: () => ++now })
  diagnostics.markStartup('journal-ready')
  diagnostics.markStartup('journal-ready')
  diagnostics.markStartup('secret-owner@example.com')
  for (let attempt = 0; attempt < 12; attempt += 1) {
    diagnostics.begin()
    const trace = diagnostics.capture()
    trace.mark('opening-rpc-start')
    trace.mark('secret profile content')
    for (let i = 0; i < 25; i += 1) trace.mark('opening-rpc-end')
    diagnostics.finish('secret-owner')
    diagnostics.finish('active')
    trace.mark('usable-frame')
  }
  const result = diagnostics.read()
  assert.deepEqual(result.startup, { 'journal-ready': 1 })
  assert.equal(result.attempts.length, 8)
  assert.ok(result.attempts.every(attempt => attempt.phases.length === 16 && attempt.outcome === 'active'))
  assert.doesNotMatch(JSON.stringify(result), /secret/)
  result.startup['journal-ready'] = 999
  result.attempts[0].phases[0].phase = 'secret'
  assert.equal(diagnostics.read().startup['journal-ready'], 1)
  assert.equal(diagnostics.read().attempts[0].phases[0].phase, 'opening-start')
})

test('late completion cannot annotate another attempt and disabled diagnostics do no clock work', () => {
  const diagnostics = createProfileOpeningDiagnostics({ enabled: true, now: () => 1 })
  diagnostics.begin()
  const retired = diagnostics.capture()
  diagnostics.finish('locked')
  diagnostics.begin()
  retired.mark('opening-rpc-end')
  assert.deepEqual(diagnostics.read().attempts[1].phases, [{ phase: 'opening-start', at: 1 }])
  const disabled = createProfileOpeningDiagnostics({ now: () => { throw Error('must not read') } })
  disabled.begin()
  disabled.markStartup('script-ready')
  disabled.capture().mark('activation')
  disabled.finish('active')
  assert.deepEqual(disabled.read(), { schema: 1, startup: {}, attempts: [] })
})
