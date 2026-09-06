import { DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const SHA = /^[a-f0-9]{40}$/u
const HASH = /^[a-f0-9]{64}$/u
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/u
const GATES = new Set(['off', 'developer-canary'])
const PHASE_ORDER = [
  'preflight', 'local-work', 'reviewed', 'delivered', 'waiting-soak',
  'live-scenario', 'cleanup', 'acceptance-audit', 'closed'
]
const PHASES = new Set([...PHASE_ORDER, 'repairing-derived'])

function requireCondition(condition, message) {
  if (!condition) throw new Error(message)
}

function requireTime(now, ttl) {
  requireCondition(Number.isSafeInteger(now) && now >= 0, 'Invalid lease time')
  if (ttl !== undefined) {
    requireCondition(Number.isSafeInteger(ttl) && ttl >= 1000 && ttl <= 60000 && Number.isSafeInteger(now + ttl), 'Invalid lease duration')
  }
}

// This store records execution mechanics only. It neither grants live authority
// nor substitutes a caller's reconciliation evidence for the required verifier.
export class CanaryCoordinationError extends Error {}

export function isUnavailableExecutionStore(error) {
  // SQLITE_IOERR, CORRUPT, CANTOPEN, NOTADB. Busy/constraint/ownership failures
  // must never grant a watchdog permission to bypass coordination.
  return error?.code === 'ERR_SQLITE_ERROR' && [10, 11, 14, 26].includes(error.errcode & 255)
}

export class CanaryExecutionStore {
  constructor(file) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(file)
    chmodSync(file, 0o600)
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS execution (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        owner TEXT, expires INTEGER, candidate TEXT NOT NULL,
        gate TEXT NOT NULL, phase TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS watchdog (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        reference TEXT NOT NULL, executor TEXT NOT NULL, deadline INTEGER NOT NULL,
        state TEXT NOT NULL, evidence_hash TEXT
      );
      CREATE TABLE IF NOT EXISTS checkpoint (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), metadata TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS repairs (
        issue INTEGER PRIMARY KEY, parent_phase TEXT NOT NULL,
        suspended_evidence TEXT NOT NULL, closure_evidence TEXT, state TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS executors (owner TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS phase_receipts (
        sequence INTEGER PRIMARY KEY, phase TEXT NOT NULL,
        evidence_hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY, candidate TEXT NOT NULL,
        state TEXT NOT NULL, evidence_hash TEXT
      );
    `)
  }

  close() { this.db.close() }

  transaction(action) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = action()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  initialize({ candidate, gate, phase = 'preflight' }) {
    requireCondition(SHA.test(candidate) && GATES.has(gate) && PHASES.has(phase), 'Invalid execution identity')
    this.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM execution').get()
      requireCondition(!existing, 'Execution already initialized; reconcile instead')
      this.db.prepare('INSERT INTO execution VALUES (1, NULL, NULL, ?, ?, ?)').run(candidate, gate, phase)
    })
  }

  state() {
    const execution = this.db.prepare('SELECT * FROM execution').get()
    requireCondition(execution, 'Execution is not initialized')
    return { ...execution, pending: this.db.prepare("SELECT id, candidate, state FROM operations WHERE state = 'pending'").all() }
  }

  requireContainmentSettled() {
    const watchdog = this.db.prepare('SELECT * FROM watchdog').get()
    requireCondition(!watchdog || watchdog.state === 'completed', 'Prior watchdog requires containment reconciliation')
  }

  writeCheckpoint(owner, now, metadata) {
    // This private checkpoint accepts only operational identities, never a raw
    // provider response, capability location, profile, or arbitrary free text.
    const keys = ['planId', 'topLevelIssue', 'invocationUtc', 'manifestSha256', 'reviewSha', 'baseSha', 'deploymentSha', 'artifactHashes', 'soakStartUtc', 'soakEndUtc', 'sourceCursor', 'recoveryState', 'heartbeatReference']
    requireCondition(metadata && Object.getPrototypeOf(metadata) === Object.prototype
      && Reflect.ownKeys(metadata).length === keys.length
      && keys.every(key => Object.hasOwn(metadata, key) && !Object.getOwnPropertyDescriptor(metadata, key).get), 'Invalid checkpoint fields')
    const utc = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
    const hash = value => typeof value === 'string' && HASH.test(value)
    const sha = value => typeof value === 'string' && SHA.test(value)
    requireCondition(Array.isArray(metadata.artifactHashes) && Object.getPrototypeOf(metadata.artifactHashes) === Array.prototype
      && Reflect.ownKeys(metadata.artifactHashes).length === metadata.artifactHashes.length + 1
      && Reflect.ownKeys(metadata.artifactHashes).every(key => key === 'length' || (/^(0|[1-9][0-9]*)$/u.test(key) && Number(key) < metadata.artifactHashes.length && !Object.getOwnPropertyDescriptor(metadata.artifactHashes, key).get)), 'Invalid checkpoint artifacts')
    requireCondition(metadata.planId === 'internal-canary-codex-autonomous-2026-09-05-v4'
      && Number.isSafeInteger(metadata.topLevelIssue) && metadata.topLevelIssue > 0
      && utc(metadata.invocationUtc) && hash(metadata.manifestSha256)
      && sha(metadata.reviewSha) && sha(metadata.baseSha)
      && (metadata.deploymentSha === null || sha(metadata.deploymentSha))
      && Array.isArray(metadata.artifactHashes) && metadata.artifactHashes.every(hash)
      && (metadata.soakStartUtc === null || utc(metadata.soakStartUtc))
      && (metadata.soakEndUtc === null || (utc(metadata.soakEndUtc) && metadata.soakStartUtc !== null && metadata.soakEndUtc >= metadata.soakStartUtc))
      && (metadata.sourceCursor === null || (typeof metadata.sourceCursor === 'string' && ID.test(metadata.sourceCursor)))
      && ['not-required', 'prepared', 'containing', 'verified', 'ambiguous'].includes(metadata.recoveryState)
      && (metadata.heartbeatReference === null || (typeof metadata.heartbeatReference === 'string' && ID.test(metadata.heartbeatReference))), 'Invalid checkpoint identity')
    const safe = Object.fromEntries(keys.map(key => [key, key === 'artifactHashes' ? Array.from(metadata.artifactHashes, value => value) : metadata[key]]))
    return this.transaction(() => {
      this.requireLease(owner, now)
      const previous = this.db.prepare('SELECT metadata FROM checkpoint').get()
      if (previous) {
        const identity = JSON.parse(previous.metadata)
        requireCondition(identity.topLevelIssue === safe.topLevelIssue && identity.invocationUtc === safe.invocationUtc, 'Checkpoint invocation changed')
      }
      this.db.prepare('INSERT INTO checkpoint VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET metadata = excluded.metadata').run(JSON.stringify(safe))
    })
  }

  checkpoint() {
    const row = this.db.prepare('SELECT metadata FROM checkpoint').get()
    return {
      metadata: row ? JSON.parse(row.metadata) : null,
      execution: this.state(),
      watchdog: this.db.prepare('SELECT * FROM watchdog').get() ?? null,
      repairs: this.db.prepare('SELECT * FROM repairs ORDER BY issue').all()
    }
  }

  suspendForRepair(owner, now, { issue, evidenceHash }) {
    requireCondition(Number.isSafeInteger(issue) && issue > 0 && HASH.test(evidenceHash), 'Repair identity and safe-state evidence are required')
    return this.transaction(() => {
      const state = this.requireLease(owner, now)
      this.requireContainmentSettled()
      requireCondition(state.gate === 'off' && state.pending.length === 0 && !['closed', 'repairing-derived'].includes(state.phase), 'Repair requires settled safe parent state')
      this.db.prepare("INSERT INTO repairs VALUES (?, ?, ?, NULL, 'open')").run(issue, state.phase, evidenceHash)
      this.db.prepare("UPDATE execution SET phase = 'repairing-derived' WHERE singleton = 1").run()
    })
  }

  resumeAfterRepair(owner, now, { issue, closureEvidenceHash, candidate, gate }) {
    requireCondition(HASH.test(closureEvidenceHash) && SHA.test(candidate) && gate === 'off', 'Verified repair closure and safe candidate are required')
    return this.transaction(() => {
      const state = this.requireLease(owner, now)
      this.requireContainmentSettled()
      requireCondition(state.phase === 'repairing-derived' && state.pending.length === 0, 'Parent is not safely suspended')
      requireCondition(this.db.prepare("SELECT issue FROM repairs WHERE issue = ? AND state = 'open'").get(issue), 'Repair closure is not current')
      this.db.prepare("UPDATE repairs SET state = 'closed', closure_evidence = ? WHERE issue = ?").run(closureEvidenceHash, issue)
      // Always re-enter preflight: reviewed delivery and affected evidence must
      // be re-inspected even when a repair changed no source bytes.
      this.db.prepare("UPDATE execution SET phase = 'preflight', candidate = ?, gate = ? WHERE singleton = 1").run(candidate, gate)
    })
  }

  acquire(owner, now, ttl) {
    requireCondition(ID.test(owner), 'Invalid executor reference')
    requireTime(now, ttl)
    return this.transaction(() => {
      this.requireContainmentSettled()
      const state = this.state()
      requireCondition(!state.owner, state.expires > now ? 'Another executor holds the lease' : 'Expired lease requires reconciliation')
      requireCondition(state.pending.length === 0, 'Pending operation requires reconciliation')
      requireCondition(!this.db.prepare('SELECT owner FROM executors WHERE owner = ?').get(owner), 'Executor reference must be unique per acquisition')
      this.db.prepare('INSERT INTO executors VALUES (?)').run(owner)
      this.db.prepare('UPDATE execution SET owner = ?, expires = ? WHERE singleton = 1').run(owner, now + ttl)
      return { acquired: true, expires: now + ttl }
    })
  }

  requireLease(owner, now) {
    requireTime(now)
    const state = this.state()
    requireCondition(state.owner === owner && state.expires > now, 'Executor lease is not current')
    const watchdog = this.db.prepare('SELECT * FROM watchdog').get()
    requireCondition(!watchdog || (watchdog.executor === owner && watchdog.state === 'armed' && watchdog.deadline > now)
      || (watchdog.executor !== owner && watchdog.state === 'completed'), 'Executor is fenced by containment')
    return state
  }

  renew(owner, now, ttl) {
    requireTime(now, ttl)
    return this.transaction(() => {
      this.requireLease(owner, now)
      this.db.prepare('UPDATE execution SET expires = ? WHERE singleton = 1').run(now + ttl)
    })
  }

  claimWatchdog(reference, executor, now, deadline) {
    requireTime(now)
    requireCondition(ID.test(reference) && Number.isSafeInteger(deadline) && deadline > now && deadline - now <= 3600000, 'Invalid watchdog identity or deadline')
    return this.transaction(() => {
      this.requireLease(executor, now)
      const previous = this.db.prepare('SELECT * FROM watchdog').get()
      requireCondition(!previous || previous.state === 'completed', 'An independent watchdog already owns containment')
      this.db.prepare("INSERT INTO watchdog VALUES (1, ?, ?, ?, 'armed', NULL) ON CONFLICT(singleton) DO UPDATE SET reference = excluded.reference, executor = excluded.executor, deadline = excluded.deadline, state = 'armed', evidence_hash = NULL").run(reference, executor, deadline)
    })
  }

  beginContainment(reference, now) {
    requireTime(now)
    return this.transaction(() => {
      const watchdog = this.db.prepare('SELECT * FROM watchdog').get()
      const execution = this.state()
      if (watchdog?.reference !== reference || watchdog.state !== 'armed' || execution.owner !== watchdog.executor) {
        throw new CanaryCoordinationError('Watchdog containment is not current')
      }
      this.db.prepare("UPDATE watchdog SET state = 'containing' WHERE singleton = 1").run()
      this.db.prepare('UPDATE execution SET expires = min(expires, ?) WHERE singleton = 1').run(now)
    })
  }

  finishContainment(reference, evidenceHash, verified) {
    requireCondition(HASH.test(evidenceHash) && typeof verified === 'boolean', 'Containment evidence is required')
    return this.transaction(() => {
      const watchdog = this.db.prepare('SELECT * FROM watchdog').get()
      requireCondition(watchdog?.reference === reference && watchdog.state === 'containing', 'Watchdog containment is not current')
      this.db.prepare('UPDATE watchdog SET state = ?, evidence_hash = ? WHERE singleton = 1').run(verified ? 'completed' : 'failed', evidenceHash)
    })
  }

  reconcileContainment(reference, now, { previousWatchdogStopped, terminalRemoteOutcomesVerified, gate, monitorDisabled, evidenceHash }) {
    requireTime(now)
    requireCondition(previousWatchdogStopped === true && terminalRemoteOutcomesVerified === true
      && gate === 'off' && monitorDisabled === true && HASH.test(evidenceHash), 'Verified containment reconciliation is required')
    return this.transaction(() => {
      const watchdog = this.db.prepare('SELECT * FROM watchdog').get()
      requireCondition(watchdog?.reference === reference && ['armed', 'containing', 'failed'].includes(watchdog.state), 'Watchdog reconciliation is not current')
      requireCondition(this.state().owner === watchdog.executor, 'Watchdog executor changed')
      this.db.prepare('UPDATE execution SET expires = min(expires, ?) WHERE singleton = 1').run(now)
      this.db.prepare("UPDATE watchdog SET state = 'completed', evidence_hash = ? WHERE singleton = 1").run(evidenceHash)
    })
  }

  advancePhase(owner, now, { phase, evidenceHash, skipSoak = false }) {
    requireCondition(HASH.test(evidenceHash), 'Phase evidence is required')
    return this.transaction(() => {
      const state = this.requireLease(owner, now)
      requireCondition(state.pending.length === 0, 'Pending operation requires reconciliation')
      requireCondition(state.phase !== 'repairing-derived', 'Suspended parent requires verified repair closure')
      const next = PHASE_ORDER[PHASE_ORDER.indexOf(state.phase) + 1]
      requireCondition(phase === next || (skipSoak === true && state.phase === 'delivered' && phase === 'live-scenario'), 'Invalid phase progression')
      requireCondition(PHASES.has(phase), 'Invalid phase progression')
      this.db.prepare('INSERT INTO phase_receipts (phase, evidence_hash) VALUES (?, ?)').run(phase, evidenceHash)
      this.db.prepare('UPDATE execution SET phase = ? WHERE singleton = 1').run(phase)
    })
  }

  beginOperation(owner, now, { id, candidate, gate }) {
    requireCondition(ID.test(id), 'Invalid operation reference')
    return this.transaction(() => {
      const state = this.requireLease(owner, now)
      requireCondition(!['closed', 'repairing-derived'].includes(state.phase), 'Closed execution or suspended parent cannot begin an operation')
      requireCondition(state.candidate === candidate && state.gate === gate, 'Candidate or gate changed; revalidate evidence')
      requireCondition(state.pending.length === 0, 'A remote outcome is already pending')
      const previous = this.db.prepare('SELECT state FROM operations WHERE id = ?').get(id)
      requireCondition(!previous || previous.state === 'not-applied', 'Operation must not be repeated')
      this.db.prepare("INSERT INTO operations VALUES (?, ?, 'pending', NULL) ON CONFLICT(id) DO UPDATE SET candidate = excluded.candidate, state = 'pending', evidence_hash = NULL").run(id, candidate)
    })
  }

  finishOperation(owner, now, { id, outcome, evidenceHash }) {
    requireCondition(['completed', 'not-applied'].includes(outcome) && HASH.test(evidenceHash), 'Verified operation evidence is required')
    return this.transaction(() => {
      this.requireLease(owner, now)
      const pending = this.db.prepare("SELECT id FROM operations WHERE id = ? AND state = 'pending'").get(id)
      requireCondition(pending, 'No matching pending operation')
      this.db.prepare('UPDATE operations SET state = ?, evidence_hash = ? WHERE id = ?').run(outcome, evidenceHash, id)
    })
  }

  release(owner, now) {
    return this.transaction(() => {
      const state = this.requireLease(owner, now)
      this.requireContainmentSettled()
      requireCondition(state.pending.length === 0, 'Cannot release an ambiguous remote outcome')
      this.db.exec('UPDATE execution SET owner = NULL, expires = NULL WHERE singleton = 1')
    })
  }

  // The caller must first stop/observe the prior executor and query the actual
  // remote outcome. Expiration alone is never evidence that a mutation failed.
  reconcileExpired(now, { previousExecutorStopped, candidate, gate, pendingOutcome, evidenceHash }) {
    requireTime(now)
    requireCondition(previousExecutorStopped === true && SHA.test(candidate) && GATES.has(gate) && HASH.test(evidenceHash), 'Verified reconciliation is required')
    return this.transaction(() => {
      const state = this.state()
      this.requireContainmentSettled()
      requireCondition(state.owner && state.expires <= now, 'Lease is not expired')
      requireCondition(state.pending.length <= 1, 'Multiple pending operations require containment')
      if (state.pending.length) {
        const pending = state.pending[0]
        requireCondition(pendingOutcome?.id === pending.id && ['completed', 'not-applied'].includes(pendingOutcome?.outcome), 'Ambiguous remote outcome requires containment')
        this.db.prepare('UPDATE operations SET state = ?, evidence_hash = ? WHERE id = ?').run(pendingOutcome.outcome, evidenceHash, pending.id)
      }
      const changed = candidate !== state.candidate || gate !== state.gate
      this.db.prepare('UPDATE execution SET owner = NULL, expires = NULL, candidate = ?, gate = ?, phase = ? WHERE singleton = 1').run(candidate, gate, changed && !['closed', 'repairing-derived'].includes(state.phase) ? 'preflight' : state.phase)
      return { reconciled: true, evidenceInvalidated: changed }
    })
  }
}
