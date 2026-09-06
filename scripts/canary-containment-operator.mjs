import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u
const DISABLED_DIGEST = createHash('sha256').update('false').digest('hex')
export const READ_GATE_SQL = 'select rollout_state, developer_user_id::text as owner from private.learner_profile_access_control where singleton = true;'

// Containment changes only the gate and bounded monitor flag. It never repairs
// profile data or chooses a recovery copy. An unknown outcome requires operator
// reconciliation; callers must not convert errors into a successful receipt.
export async function containCanary(operator, expectedOwner) {
  if (typeof expectedOwner !== 'string' || !UUID.test(expectedOwner)) throw new Error('Invalid containment target')
  const read = async () => {
    const rows = await operator.query(READ_GATE_SQL)
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Ambiguous containment gate')
    const state = rows[0]
    if (!(state.rollout_state === 'off' && state.owner === null)
      && !(state.rollout_state === 'developer-canary' && state.owner === expectedOwner)) throw new Error('Containment target does not match')
    return state
  }
  let state = await read()
  let gateWriteAttempted = false
  let monitorWriteAttempted = false
  if (state.rollout_state === 'developer-canary') {
    gateWriteAttempted = true
    await operator.query(`update private.learner_profile_access_control set rollout_state = 'off', developer_user_id = null, updated_at = now() where singleton = true and rollout_state = 'developer-canary' and developer_user_id = '${expectedOwner}'::uuid returning rollout_state;`)
    state = await read()
    if (state.rollout_state !== 'off') throw new Error('Gate containment not verified')
  }
  if (!await operator.monitorDisabled()) {
    monitorWriteAttempted = true
    await operator.disableMonitor()
  }
  state = await read()
  if (state.rollout_state !== 'off' || !await operator.monitorDisabled()) throw new Error('Containment postcondition not verified')
  return { gateOff: true, ownerRemoved: true, monitorDisabled: true, gateWriteAttempted, monitorWriteAttempted }
}

// The linked adapter is prepared for later packet authority. Packet 0 must not
// invoke its mutating methods against a hosted project. Tokens stay in the
// existing Supabase CLI capability; no credentials are read or exported here.
export function linkedContainmentOperator({ workdir, projectRef }) {
  if (typeof projectRef !== 'string' || !/^[a-z]{20}$/u.test(projectRef)) throw new Error('Invalid operator project reference')
  async function command(args) {
    const linkedRef = (await readFile(join(workdir, 'supabase', '.temp', 'project-ref'), 'utf8')).trim()
    if (linkedRef !== projectRef) throw new Error('Linked operator target changed')
    try {
      const { stdout } = await execute('supabase', args, { cwd: workdir, timeout: 20000, maxBuffer: 1024 * 1024 })
      return JSON.parse(stdout)
    } catch { throw new Error('Operator command failed; reconcile its outcome privately') }
  }
  return {
    async query(sql) {
      const result = await command(['db', 'query', '--linked', sql, '--output-format', 'json'])
      if (!Array.isArray(result.rows)) throw new Error('Invalid operator query result')
      return result.rows
    },
    async monitorDisabled() {
      const result = await command(['secrets', 'list', '--project-ref', projectRef, '--output-format', 'json'])
      if (!Array.isArray(result.secrets)) throw new Error('Invalid monitor capability result')
      const secret = result.secrets.find(item => item.name === 'EDENIA_AUTH_MONITOR_CANARY_ENABLED')
      if (!secret) throw new Error('Monitor flag capability missing')
      return secret.value === DISABLED_DIGEST
    },
    async disableMonitor() {
      await command(['secrets', 'set', 'EDENIA_AUTH_MONITOR_CANARY_ENABLED=false', '--project-ref', projectRef, '--output-format', 'json'])
    }
  }
}
