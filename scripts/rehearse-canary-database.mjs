import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rehearseCanaryProfileVerifier } from './rehearse-canary-profile-verifier.mjs'
import { rehearseCanaryContainment } from './rehearse-canary-containment.mjs'

// No linked-project or connection-string mode. Every database touched by this
// command belongs to the unique disposable project created below.
const repository = fileURLToPath(new URL('../', import.meta.url))
const suites = [
  'first_signed_in_profile', 'learner_profile_progress_sync',
  'learner_profile_conflict_resolution', 'voluntary_accountless_profile_migration',
  'learner_profile_recovery', 'learner_profile_import', 'learner_profile_start_over',
  'learner_profile_retention', 'auth_operations', 'auth_monitoring_freshness',
  'account_owner_policies', 'legacy_progress_transfer_relay'
]
if (process.argv.length !== 2) throw new Error('This local-only rehearsal accepts no target arguments')
const root = join(repository, '.cache', 'canary-database')
await mkdir(root, { recursive: true, mode: 0o700 })
const workdir = await mkdtemp(join(root, 'run-'))
const project = `p290-${randomUUID().replaceAll('-', '')}`
const container = `supabase_db_${project}`
const logs = []
const results = []
const migrationSources = []
let containment = []
let profileVerifier = null
const startedUtc = new Date().toISOString()
let step = 0
let interrupted = false
let currentChild
const onSignal = () => { interrupted = true; currentChild?.kill('SIGTERM') }
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

async function run(command, args, { input, cleanup = false, timeout = 60000 } = {}) {
  if (interrupted && !cleanup) throw new Error('Rehearsal interrupted')
  const number = ++step
  const output = await new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd: workdir, stdio: ['pipe', 'pipe', 'pipe'] })
    currentChild = child
    let text = ''
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeout)
    const collect = chunk => {
      text += chunk.toString()
      if (text.length > 16 * 1024 * 1024) child.kill('SIGKILL')
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.stdin.on('error', () => {})
    child.on('error', error => { clearTimeout(timer); currentChild = undefined; reject(error) })
    child.on('close', code => {
      clearTimeout(timer)
      currentChild = undefined
      accept({ code, timedOut, text })
    })
    child.stdin.end(input)
  })
  const log = join(workdir, `step-${number}.log`)
  await writeFile(log, output.text, { mode: 0o600 })
  logs.push({ step: number, sha256: createHash('sha256').update(output.text).digest('hex') })
  if (output.code !== 0 || output.timedOut) throw new Error(`Local rehearsal step ${number} failed; private log retained`)
  return output.text
}

async function availablePort() {
  const server = createServer()
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
  const port = server.address().port
  await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()))
  return port
}

let failure
let cleanupVerified = false
try {
  const port = await availablePort()
  await mkdir(join(workdir, 'supabase'))
  await writeFile(join(workdir, 'supabase', 'config.toml'), `project_id = "${project}"\n[db]\nport = ${port}\nmajor_version = 17\n[db.seed]\nenabled = false\n`, { mode: 0o600 })
  // Bootstrap Supabase's empty Auth/roles schema. Keep migrations outside its
  // discovery path: db start does not consistently wrap each migration in a
  // transaction, and the existing founding-member migration uses LOCK TABLE.
  await run('supabase', ['db', 'start', '--workdir', workdir])
  const inventory = await run('docker', ['ps', '--format', '{{.Names}}'])
  if (!inventory.split('\n').includes(container)) throw new Error('Generated local database target was not found; no migrations attempted')
  const migrationRoot = join(repository, 'supabase', 'migrations')
  const migrations = (await readdir(migrationRoot)).filter(name => name.endsWith('.sql')).sort()
  for (const name of migrations) {
    const sql = await readFile(join(migrationRoot, name))
    await run('docker', ['exec', '-i', container, 'psql', '-X', '--username', 'postgres', '--dbname', 'postgres', '--set', 'ON_ERROR_STOP=1', '--single-transaction'], { input: sql })
    migrationSources.push({ file: name, sha256: createHash('sha256').update(sql).digest('hex') })
  }
  for (const suite of suites) {
    const file = join(repository, 'supabase', 'tests', `${suite}.test.sql`)
    const text = await run('supabase', ['test', 'db', file, '--local', '--workdir', workdir])
    const tests = text.match(/Files=1, Tests=(\d+)/u)
    if (!tests || !text.includes('Result: PASS') || /(?:not ok|# SKIP|# TODO)/iu.test(text)) throw new Error('Missing or skipped required local database assertions')
    results.push({ suite, tests: Number(tests[1]), result: 'pass', sourceSha256: createHash('sha256').update(await readFile(file)).digest('hex') })
  }
  const localQuery = sql => run('docker', ['exec', container, 'psql', '-XAt', '--username', 'postgres', '--dbname', 'postgres', '--set', 'ON_ERROR_STOP=1', '-c', sql])
  profileVerifier = await rehearseCanaryProfileVerifier(localQuery, async owner => {
    containment = await rehearseCanaryContainment({ workdir, project, query: localQuery, owner })
  })
  const probe = join(repository, 'supabase', 'tests', 'canary_deployed_schema.test.sql')
  const probeText = await run('supabase', ['test', 'db', probe, '--local', '--workdir', workdir])
  if (!probeText.includes('Result: PASS') || !/Files=1, Tests=13\b/u.test(probeText) || /(?:not ok|# SKIP|# TODO)/iu.test(probeText)) throw new Error('Deployed-schema fixture rehearsal failed')
  const probePostflight = JSON.parse((await localQuery("select json_build_object('gateOff', (select rollout_state = 'off' and developer_user_id is null from private.learner_profile_access_control where singleton), 'fixtureOwnersAbsent', not exists(select 1 from auth.users where id in ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002')))::text;")).trim())
  if (!probePostflight.gateOff || !probePostflight.fixtureOwnersAbsent) throw new Error('Schema fixture transaction cleanup failed')
  results.push({ suite: 'canary_deployed_schema', tests: 13, result: 'pass', sourceSha256: createHash('sha256').update(await readFile(probe)).digest('hex'), postflight: probePostflight })
} catch (error) {
  failure = error instanceof Error ? error.message : 'Local rehearsal failed'
} finally {
  try {
    await run('supabase', ['stop', '--no-backup', '--workdir', workdir], { cleanup: true })
    const containers = await run('docker', ['ps', '-a', '--filter', `name=${container}`, '--format', '{{.Names}}'], { cleanup: true })
    const volumes = await run('docker', ['volume', 'ls', '--filter', `label=com.supabase.cli.project=${project}`, '--format', '{{.Name}}'], { cleanup: true })
    cleanupVerified = containers.trim() === '' && volumes.trim() === ''
    if (!cleanupVerified) failure = 'Disposable resource cleanup could not be verified'
  } catch { failure = 'Disposable resource cleanup failed; inspect the retained local run directory' }
  process.off('SIGINT', onSignal)
  process.off('SIGTERM', onSignal)
}
const receipt = {
  schemaVersion: 1, evidenceKind: 'local-synthetic-database', startedUtc,
  finishedUtc: new Date().toISOString(), suites: results, migrationSources, containment, profileVerifier, cleanupVerified,
  hostedOperations: 0, logs, complete: !failure && !interrupted && cleanupVerified
}
await writeFile(join(workdir, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 })
console.log(JSON.stringify({ complete: receipt.complete, suites: results.length, assertions: results.reduce((sum, row) => sum + row.tests, 0), cleanupVerified, receipt: resolve(workdir, 'receipt.json') }))
if (failure || interrupted) { console.error(failure || 'Local rehearsal interrupted'); process.exitCode = 1 }
