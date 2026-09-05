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

  acquire(owner, now, ttl) {
    requireCondition(ID.test(owner), 'Invalid executor reference')
    requireTime(now, ttl)
    return this.transaction(() => {
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
    return state
  }

  renew(owner, now, ttl) {
    requireTime(now, ttl)
    return this.transaction(() => {
      this.requireLease(owner, now)
      this.db.prepare('UPDATE execution SET expires = ? WHERE singleton = 1').run(now + ttl)
    })
  }

  advancePhase(owner, now, { phase, evidenceHash, skipSoak = false }) {
    requireCondition(HASH.test(evidenceHash), 'Phase evidence is required')
    return this.transaction(() => {
      const state = this.requireLease(owner, now)
      requireCondition(state.pending.length === 0, 'Pending operation requires reconciliation')
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
      requireCondition(state.phase !== 'closed', 'Closed execution cannot begin an operation')
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
      requireCondition(state.owner && state.expires <= now, 'Lease is not expired')
      requireCondition(state.pending.length <= 1, 'Multiple pending operations require containment')
      if (state.pending.length) {
        const pending = state.pending[0]
        requireCondition(pendingOutcome?.id === pending.id && ['completed', 'not-applied'].includes(pendingOutcome?.outcome), 'Ambiguous remote outcome requires containment')
        this.db.prepare('UPDATE operations SET state = ?, evidence_hash = ? WHERE id = ?').run(pendingOutcome.outcome, evidenceHash, pending.id)
      }
      const changed = candidate !== state.candidate || gate !== state.gate
      this.db.prepare('UPDATE execution SET owner = NULL, expires = NULL, candidate = ?, gate = ?, phase = ? WHERE singleton = 1').run(candidate, gate, changed ? 'preflight' : state.phase)
      return { reconciled: true, evidenceInvalidated: changed }
    })
  }
}
