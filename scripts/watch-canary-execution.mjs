import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { CanaryExecutionStore, isUnavailableExecutionStore } from './canary-execution-store.mjs'
import { containCanary, linkedContainmentOperator, READ_GATE_SQL } from './canary-containment-operator.mjs'

const execute = promisify(execFile)
if (process.argv.length !== 3) throw new Error('A private reviewed watchdog configuration is required')
const config = JSON.parse(await readFile(process.argv[2], 'utf8'))
if (!['local-rehearsal', 'linked'].includes(config.mode)) throw new Error('Invalid watchdog operator mode')
if (typeof config.candidate !== 'string' || !/^[a-f0-9]{40}$/u.test(config.candidate)) throw new Error('Invalid watchdog candidate')
let operator
if (config.mode === 'linked') {
  // Invoke only under the selected later packet's reviewed live authority.
  operator = linkedContainmentOperator({ workdir: config.workdir, projectRef: config.projectRef })
} else {
  if (!/^p290-[a-f0-9]{32}$/u.test(config.projectRef)) throw new Error('Invalid disposable target')
  const localConfig = await readFile(join(config.workdir, 'supabase', 'config.toml'), 'utf8')
  if (!localConfig.includes(`project_id = "${config.projectRef}"`)) throw new Error('Disposable target changed')
  operator = {
    async query(sql) {
      const statement = sql.replace(/;$/u, '')
      const wrapped = sql === READ_GATE_SQL
        ? `select coalesce(json_agg(row_to_json(value)), '[]'::json) from (${statement}) value;`
        : `with changed as (${statement}) select coalesce(json_agg(row_to_json(changed)), '[]'::json) from changed;`
      const { stdout } = await execute('docker', ['exec', `supabase_db_${config.projectRef}`, 'psql', '-XAt', '--username', 'postgres', '--dbname', 'postgres', '--set', 'ON_ERROR_STOP=1', '-c', wrapped], { timeout: 20000 })
      return JSON.parse(stdout)
    },
    async monitorDisabled() { return (await readFile(join(config.workdir, 'monitor-fixture'), 'utf8')).trim() === 'false' },
    async disableMonitor() {
      const path = join(config.workdir, 'monitor-fixture')
      await writeFile(path + '.new', 'false', { mode: 0o600 })
      await rename(path + '.new', path)
    }
  }
}
const store = new CanaryExecutionStore(config.store)
const reference = `watch-${randomUUID()}`
let armed = false
let containing = false
let interrupted = false
process.on('SIGINT', () => { interrupted = true })
process.on('SIGTERM', () => { interrupted = true })
try {
  store.claimWatchdog(reference, config.executor, Date.now(), config.deadline)
  armed = true
  console.log(JSON.stringify({ state: 'armed' }))
  const monotonicStart = performance.now()
  const maximumElapsed = config.deadline - Date.now()
  let previousWallTime = Date.now()
  for (;;) {
    const wallTime = Date.now()
    if (wallTime < previousWallTime || performance.now() - monotonicStart >= maximumElapsed) break
    previousWallTime = wallTime
    let state
    try { state = store.state() } catch { break }
    if (interrupted || state.owner !== config.executor || state.candidate !== config.candidate
      || state.expires <= Date.now() || Date.now() >= config.deadline || state.phase === 'closed') break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  // Revoke the local execution lease before dispatching any containment command.
  let journalAvailable = true
  try { store.beginContainment(reference, Date.now()); containing = true }
  catch (error) {
    if (!isUnavailableExecutionStore(error)) throw error
    journalAvailable = false
  }
  const result = await containCanary(operator, config.expectedOwner)
  let json = JSON.stringify({ state: 'contained', ...result })
  if (journalAvailable) {
    try { store.finishContainment(reference, createHash('sha256').update(json).digest('hex'), true) }
    catch { journalAvailable = false }
  }
  if (!journalAvailable) {
    json = JSON.stringify({ state: 'contained-checkpoint-unavailable', ...result })
    process.exitCode = 1
  }
  console.log(json)
} catch {
  const json = JSON.stringify({ state: armed ? 'containment-unverified' : 'not-armed' })
  if (containing) {
    try { store.finishContainment(reference, createHash('sha256').update(json).digest('hex'), false) } catch { /* Retain ambiguous journal state for reconciliation. */ }
  }
  console.error(json)
  process.exitCode = 1
} finally { store.close() }
