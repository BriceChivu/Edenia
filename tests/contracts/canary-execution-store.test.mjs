import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CanaryExecutionStore } from '../../scripts/canary-execution-store.mjs'

const candidate = 'a'.repeat(40)
const evidenceHash = 'b'.repeat(64)
const intent = { id: 'reset-once', candidate, gate: 'developer-canary' }

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'edenia-execution-'))
  const file = join(directory, 'execution.sqlite')
  const first = new CanaryExecutionStore(file)
  const second = new CanaryExecutionStore(file)
  t.after(() => { first.close(); second.close(); rmSync(directory, { recursive: true, force: true }) })
  first.initialize({ candidate, gate: 'developer-canary' })
  return { first, second }
}

test('duplicate executors and expired actors cannot begin a second mutation', t => {
  const { first, second } = fixture(t)
  first.acquire('runner-a', 1000, 1000)
  assert.throws(() => second.acquire('runner-b', 1001, 1000), /Another executor/)
  first.beginOperation('runner-a', 1002, intent)
  assert.throws(() => second.beginOperation('runner-a', 1003, { ...intent, id: 'reset-twice' }), /already pending/)
  assert.throws(() => second.acquire('runner-b', 2001, 1000), /requires reconciliation/)
  assert.throws(() => first.finishOperation('runner-a', 2001, { id: intent.id, outcome: 'completed', evidenceHash }), /not current/)
})

test('completed remote mutation with missing receipt is reconciled without replay', t => {
  const { first, second } = fixture(t)
  first.acquire('runner-a', 1000, 1000)
  first.beginOperation('runner-a', 1001, intent)
  const observation = { previousExecutorStopped: true, candidate, gate: intent.gate, evidenceHash, pendingOutcome: { id: intent.id, outcome: 'completed' } }
  second.reconcileExpired(2001, observation)
  second.acquire('runner-b', 2002, 1000)
  assert.throws(() => second.beginOperation('runner-b', 2003, intent), /must not be repeated/)
  assert.throws(() => first.beginOperation('runner-a', 2003, { ...intent, id: 'late-write' }), /not current/)
  second.release('runner-b', 2004)
})

test('ambiguous outcomes and unverified previous executor keep the lease fenced', t => {
  const { first } = fixture(t)
  first.acquire('runner-a', 1000, 1000)
  first.beginOperation('runner-a', 1001, intent)
  const observation = { previousExecutorStopped: true, candidate, gate: intent.gate, evidenceHash }
  assert.throws(() => first.reconcileExpired(2001, observation), /requires containment/)
  assert.throws(() => first.reconcileExpired(2001, { ...observation, previousExecutorStopped: false }), /reconciliation is required/)
  assert.equal(first.state().pending[0].id, intent.id)
})

test('proven non-application permits retry and changed candidate invalidates the phase', t => {
  const { first } = fixture(t)
  first.acquire('runner-a', 1000, 1000)
  first.beginOperation('runner-a', 1001, intent)
  const result = first.reconcileExpired(2001, { previousExecutorStopped: true, candidate: 'c'.repeat(40), gate: 'off', evidenceHash, pendingOutcome: { id: intent.id, outcome: 'not-applied' } })
  assert.equal(result.evidenceInvalidated, true)
  assert.equal(first.state().phase, 'preflight')
  first.acquire('runner-b', 2002, 1000)
  assert.throws(() => first.beginOperation('runner-b', 2003, intent), /revalidate evidence/)
  first.beginOperation('runner-b', 2003, { ...intent, candidate: 'c'.repeat(40), gate: 'off' })
  assert.equal(first.state().pending[0].candidate, 'c'.repeat(40))
})

test('invalid times cannot acquire, renew, complete, release, or reconcile a lease', t => {
  const { first } = fixture(t)
  for (const now of [-1, NaN, Infinity, 1.5]) {
    assert.throws(() => first.acquire('runner-a', now, 1000), /Invalid lease time/)
  }
  assert.throws(() => first.acquire('runner-a', Number.MAX_SAFE_INTEGER, 1000), /Invalid lease duration/)
  first.acquire('runner-a', 1000, 1000)
  first.beginOperation('runner-a', 1001, intent)
  for (const now of [-1, NaN, Infinity, 1.5]) {
    assert.throws(() => first.renew('runner-a', now, 1000), /Invalid lease time/)
    assert.throws(() => first.beginOperation('runner-a', now, intent), /Invalid lease time/)
    assert.throws(() => first.finishOperation('runner-a', now, { id: intent.id, outcome: 'completed', evidenceHash }), /Invalid lease time/)
    assert.throws(() => first.release('runner-a', now), /Invalid lease time/)
    assert.throws(() => first.reconcileExpired(now, {}), /Invalid lease time/)
  }
  assert.throws(() => first.renew('runner-a', Number.MAX_SAFE_INTEGER, 1000), /Invalid lease duration/)
  assert.equal(first.state().expires, 2000)
  assert.equal(first.state().pending[0].id, intent.id)
})

test('a released executor reference cannot authorize an old callback after reacquisition', t => {
  const { first, second } = fixture(t)
  first.acquire('runner-a', 1000, 1000)
  first.release('runner-a', 1001)
  assert.throws(() => second.acquire('runner-a', 1002, 1000), /must be unique/)
  second.acquire('runner-b', 1002, 1000)
  assert.throws(() => first.beginOperation('runner-a', 1003, intent), /not current/)
})

test('phase progression requires a receipt and cannot skip review or pending outcomes', t => {
  const { first, second } = fixture(t)
  first.acquire('runner-a', 1000, 1000)
  assert.throws(() => first.advancePhase('runner-a', 1001, { phase: 'delivered', evidenceHash }), /Invalid phase/)
  assert.throws(() => first.advancePhase('runner-a', 1001, { phase: 'local-work' }), /evidence is required/)
  first.advancePhase('runner-a', 1001, { phase: 'local-work', evidenceHash })
  assert.equal(second.state().phase, 'local-work')
  first.beginOperation('runner-a', 1002, intent)
  assert.throws(() => first.advancePhase('runner-a', 1003, { phase: 'reviewed', evidenceHash }), /Pending operation/)
  first.finishOperation('runner-a', 1004, { id: intent.id, outcome: 'not-applied', evidenceHash })
  first.advancePhase('runner-a', 1005, { phase: 'reviewed', evidenceHash })
  first.advancePhase('runner-a', 1006, { phase: 'delivered', evidenceHash })
  assert.throws(() => first.advancePhase('runner-a', 1007, { phase: 'live-scenario', evidenceHash }), /Invalid phase/)
  first.advancePhase('runner-a', 1007, { phase: 'live-scenario', evidenceHash, skipSoak: true })
  assert.equal(second.state().phase, 'live-scenario')
})

test('closure reconciliation never permits a new operation', t => {
  const { first } = fixture(t)
  first.acquire('runner-a', 1000, 1000)
  for (const phase of ['local-work', 'reviewed', 'delivered', 'waiting-soak', 'live-scenario', 'cleanup', 'acceptance-audit', 'closed']) {
    first.advancePhase('runner-a', 1001, { phase, evidenceHash })
  }
  assert.throws(() => first.beginOperation('runner-a', 1002, intent), /Closed execution/)
  first.release('runner-a', 1003)
  first.acquire('runner-b', 1004, 1000)
  assert.throws(() => first.beginOperation('runner-b', 1005, intent), /Closed execution/)
  assert.equal(first.state().pending.length, 0)
})
