import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CanaryExecutionStore, CanaryCoordinationError, isUnavailableExecutionStore } from '../../scripts/canary-execution-store.mjs'

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
  return { first, second, file }
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
  first.reconcileExpired(2005, { previousExecutorStopped: true, candidate: 'e'.repeat(40), gate: 'off', evidenceHash })
  assert.equal(first.state().phase, 'closed')
  first.acquire('runner-c', 2006, 1000)
  assert.throws(() => first.beginOperation('runner-c', 2007, { ...intent, candidate: 'e'.repeat(40), gate: 'off' }), /Closed execution/)
})

function executeChild(file, owner, crash = false) {
  const moduleUrl = new URL('../../scripts/canary-execution-store.mjs', import.meta.url).href
  const code = `
    import { CanaryExecutionStore } from ${JSON.stringify(moduleUrl)};
    const store = new CanaryExecutionStore(process.argv[1]);
    try {
      store.acquire(process.argv[2], 1000, 1000);
      if (process.argv[3] === 'crash') {
        store.beginOperation(process.argv[2], 1001, { id: 'reset-once', candidate: 'a'.repeat(40), gate: 'developer-canary' });
        process.kill(process.pid, 'SIGKILL');
      }
      console.log('acquired');
    } catch (error) {
      if (!error.message.includes('Another executor')) throw error;
      console.log('denied');
    } finally { store.close(); }
  `
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, file, owner, crash ? 'crash' : 'normal'])
    let output = ''
    let errors = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { errors += chunk })
    child.on('error', reject)
    child.on('close', (status, signal) => {
      if (status !== 0 && !(crash && signal === 'SIGKILL')) reject(new Error(errors))
      else resolve({ output: output.trim(), signal })
    })
  })
}

test('simultaneous independent processes acquire exactly one shared lease', async t => {
  const { file } = fixture(t)
  const results = await Promise.all([executeChild(file, 'runner-a'), executeChild(file, 'runner-b')])
  assert.deepEqual(results.map(result => result.output).sort(), ['acquired', 'denied'])
})

test('a killed executor leaves its committed intent durable and cannot be blindly replaced', async t => {
  const { file, second } = fixture(t)
  const result = await executeChild(file, 'runner-a', true)
  assert.equal(result.signal, 'SIGKILL')
  assert.equal(second.state().pending[0].id, intent.id)
  assert.throws(() => second.acquire('runner-b', 2001, 1000), /requires reconciliation/)
})

test('only one watchdog can arm and containment revokes dispatch before recording its outcome', t => {
  const { first, second } = fixture(t)
  first.acquire('runner-a', 1000, 1000)
  first.claimWatchdog('watch-a', 'runner-a', 1001, 5000)
  assert.throws(() => second.claimWatchdog('watch-b', 'runner-a', 1002, 5000), /already owns containment/)
  first.beginContainment('watch-a', 1003)
  assert.throws(() => second.beginOperation('runner-a', 1004, intent), /not current/)
  assert.throws(() => second.beginContainment('watch-a', 1004), /not current/)
  first.finishContainment('watch-a', evidenceHash, false)
  const observation = { previousExecutorStopped: true, candidate, gate: 'off', evidenceHash }
  assert.throws(() => first.reconcileExpired(2001, observation), /containment reconciliation/)
  assert.throws(() => first.acquire('runner-b', 2002, 1000), /containment reconciliation/)
  const recovery = { previousWatchdogStopped: true, terminalRemoteOutcomesVerified: true, gate: 'off', monitorDisabled: true, evidenceHash }
  assert.throws(() => first.reconcileContainment('watch-a', 2002, { ...recovery, terminalRemoteOutcomesVerified: false }), /Verified containment/)
  first.reconcileContainment('watch-a', 2002, recovery)
  first.reconcileExpired(2003, observation)
  first.acquire('runner-b', 2004, 1000)
  assert.throws(() => first.beginContainment('watch-a', 2005), CanaryCoordinationError)
  first.claimWatchdog('watch-b', 'runner-b', 2005, 5000)
})


test('expired and containing watchdogs fence replacement even from a competing OS process', async t => {
  const { first, file } = fixture(t)
  first.acquire('runner-a', 1000, 1000)
  first.claimWatchdog('watch-a', 'runner-a', 1001, 5000)
  const moduleUrl = new URL('../../scripts/canary-execution-store.mjs', import.meta.url).href
  const code = `
    import assert from 'node:assert/strict';
    import { CanaryExecutionStore } from ${JSON.stringify(moduleUrl)};
    const store = new CanaryExecutionStore(process.argv[1]);
    const observation = { previousExecutorStopped: true, candidate: 'a'.repeat(40), gate: 'off', evidenceHash: 'b'.repeat(64) };
    assert.throws(() => store.reconcileExpired(2001, observation), /containment reconciliation/);
    assert.throws(() => store.acquire('runner-b', 2002, 1000), /containment reconciliation/);
    assert.throws(() => store.beginOperation('runner-a', 2003, { id: 'late', candidate: 'a'.repeat(40), gate: 'developer-canary' }), /not current/);
    store.close();
  `
  async function compete() {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', code, file], { stdio: 'pipe' })
      let errors = ''
      child.stderr.on('data', chunk => { errors += chunk })
      child.on('error', reject)
      child.on('close', status => status === 0 ? resolve() : reject(new Error(errors)))
    })
  }
  await compete()
  first.beginContainment('watch-a', 2004)
  await compete()
  assert.equal(first.state().owner, 'runner-a')
  first.finishContainment('watch-a', evidenceHash, true)
  first.reconcileExpired(2005, { previousExecutorStopped: true, candidate, gate: 'off', evidenceHash })
  first.acquire('runner-b', 2006, 1000)
  assert.throws(() => first.beginContainment('watch-a', 2007), CanaryCoordinationError)
  assert.equal(first.state().expires, 3006)
})

test('only storage unavailability permits containment outside the journal', () => {
  for (const errcode of [10, 11, 14, 26, 10 + 256]) assert.equal(isUnavailableExecutionStore({ code: 'ERR_SQLITE_ERROR', errcode }), true)
  for (const error of [new CanaryCoordinationError('stale'), new Error('failed'), { code: 'ERR_SQLITE_ERROR', errcode: 5 }]) {
    assert.equal(isUnavailableExecutionStore(error), false)
  }
})


test('private checkpoint survives executor loss and rejects invocation changes or private fields', t => {
  const { first, second } = fixture(t)
  first.acquire('runner-a', 1000, 1000)
  const metadata = {
    planId: 'internal-canary-codex-autonomous-2026-09-05-v4', topLevelIssue: 290,
    invocationUtc: '2026-09-05T14:51:00.000Z', manifestSha256: evidenceHash,
    reviewSha: candidate, baseSha: candidate, deploymentSha: null, artifactHashes: [evidenceHash],
    soakStartUtc: null, soakEndUtc: null, sourceCursor: null,
    recoveryState: 'prepared', heartbeatReference: null
  }
  first.writeCheckpoint('runner-a', 1001, metadata)
  first.beginOperation('runner-a', 1002, intent)
  assert.deepEqual(second.checkpoint().metadata, metadata)
  assert.equal(second.checkpoint().execution.pending[0].id, intent.id)
  assert.throws(() => first.writeCheckpoint('runner-a', 1003, { ...metadata, email: 'private@example.test' }), /Invalid checkpoint/)
  assert.throws(() => first.writeCheckpoint('runner-a', 1003, { ...metadata, topLevelIssue: 291 }), /invocation changed/)
  const hashes = [evidenceHash]
  Object.defineProperty(hashes, '0', { get() { throw new Error('must not invoke') } })
  assert.throws(() => first.writeCheckpoint('runner-a', 1003, { ...metadata, artifactHashes: hashes }), /Invalid checkpoint/)
})

test('derived repair preserves the interrupted phase and resumes only through fresh preflight', t => {
  const { first, second } = fixture(t)
  first.acquire('runner-a', 1000, 1000)
  assert.throws(() => first.suspendForRepair('runner-a', 1001, { issue: 300, evidenceHash }), /settled safe/)
  first.reconcileExpired(2001, { previousExecutorStopped: true, candidate, gate: 'off', evidenceHash })
  first.acquire('runner-b', 2002, 1000)
  first.advancePhase('runner-b', 2003, { phase: 'local-work', evidenceHash })
  first.suspendForRepair('runner-b', 2004, { issue: 300, evidenceHash })
  assert.equal(second.checkpoint().repairs[0].parent_phase, 'local-work')
  assert.equal(second.state().phase, 'repairing-derived')
  assert.throws(() => second.advancePhase('runner-b', 2005, { phase: 'preflight', evidenceHash }), /verified repair closure/)
  second.reconcileExpired(3003, { previousExecutorStopped: true, candidate: 'd'.repeat(40), gate: 'off', evidenceHash })
  assert.equal(second.state().phase, 'repairing-derived')
  second.acquire('runner-c', 3004, 1000)
  assert.throws(() => second.beginOperation('runner-c', 3005, { ...intent, gate: 'off' }), /suspended parent/)
  assert.throws(() => second.resumeAfterRepair('runner-c', 3005, { issue: 301, closureEvidenceHash: evidenceHash, candidate, gate: 'off' }), /not current/)
  second.resumeAfterRepair('runner-c', 3006, { issue: 300, closureEvidenceHash: evidenceHash, candidate: 'c'.repeat(40), gate: 'off' })
  assert.equal(first.state().phase, 'preflight')
  assert.equal(first.state().candidate, 'c'.repeat(40))
  assert.equal(first.checkpoint().repairs[0].state, 'closed')
})
