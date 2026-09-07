import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chromium } from '@playwright/test'
import { encodeCanaryEvidence } from './canary-evidence.mjs'
import { CanaryExecutionStore } from './canary-execution-store.mjs'
import { containCanary, enableCanarySql, linkedContainmentOperator, READ_GATE_SQL } from './canary-containment-operator.mjs'
import { observeCanaryProfile, compareCanaryProfiles } from './canary-profile-verifier.mjs'
import { prepareOpeningAuthentication, runOpeningCase } from './hosted-profile-opening-smoke.mjs'

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export async function executeOpeningWorkflow({ candidate, reviewed, config }, dependencies = {}) {
  const startedUtc = new Date().toISOString()
  const notify = dependencies.notify || (value => console.log(JSON.stringify(value)))
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(config.expectedOwner || '')) throw new Error('Approved private owner is required')
  const operator = dependencies.operator || linkedContainmentOperator(config)
  const readGate = async () => {
    const rows = await operator.query(READ_GATE_SQL)
    if (rows.length !== 1 || !(rows[0].rollout_state === 'off' && rows[0].owner === null)
      && !(rows[0].rollout_state === 'developer-canary' && rows[0].owner === config.expectedOwner)) throw new Error('Unexpected gate ownership')
    if (!await operator.monitorDisabled()) throw new Error('Bounded monitor must already be disabled')
    return rows[0]
  }
  const verifyGateOff = async () => { if ((await readGate()).rollout_state !== 'off') throw new Error('Gate must be off') }
  const observe = dependencies.observe || (async () => {
    const snapshot = await observeCanaryProfile(sql => operator.query(sql), config.expectedOwner)
    if (!snapshot.validHead || snapshot.headCount !== 1) throw new Error('Head preflight is ambiguous')
    return snapshot
  })
  const readDeployment = dependencies.readDeployment || (async () => {
    const release = await (await fetch('https://www.edenia.study/release.json?opening=' + Date.now())).json()
    const source = await (await fetch('https://www.edenia.study/config.local.js?opening=' + Date.now())).text()
    const runtimeHash = createHash('sha256').update(source).digest('hex')
    const match = source.match(/^window\.EDENIA_CONFIG\s*=\s*([\s\S]*?)\s*;?\s*$/u)
    const runtime = match ? JSON.parse(match[1]) : null
    if (release.deployedCommit !== candidate || release.runtimeConfigSha256 !== runtimeHash
      || runtime?.accountFeaturesRollout !== 'internal' || runtime?.learnerProfileLifecycleEnabled !== true
      || new URL(runtime.supabaseUrl).hostname !== config.projectRef + '.supabase.co') throw new Error('Candidate runtime mismatch')
    if (release.assetVersion !== candidate.slice(0, 12)) throw new Error('Asset version mismatch')
    const asset = await fetch('https://www.edenia.study/app.js?v=' + release.assetVersion)
    if (!asset.ok) throw new Error('Asset missing')
    const assetIdentity = { version: release.assetVersion, sha256: createHash('sha256').update(Buffer.from(await asset.arrayBuffer())).digest('hex') }
    return { assetIdentity, runtimeHash, providerOrigin: new URL(runtime.supabaseUrl).origin }
  })
  const rehearsal = JSON.parse(await readFile(config.rehearsalReceipt, 'utf8'))
  if (!rehearsal.complete || !rehearsal.cleanupVerified || rehearsal.hostedOperations !== 0
    || !['executor-killed', 'hard-deadline', 'execution-store-unavailable', 'containment-before-delayed-enable', 'enable-before-containment']
      .every(name => rehearsal.containment?.some(row => row.scenario === name && row.gateOff))) throw new Error('Reviewed recovery rehearsal is required')
  for (const name of ['canary-containment-operator.mjs', 'canary-profile-verifier.mjs', 'canary-execution-store.mjs', 'watch-canary-execution.mjs']) {
    const digest = createHash('sha256').update(await readFile(new URL('./' + name, import.meta.url))).digest('hex')
    if (rehearsal.scriptSources?.[name] !== digest) throw new Error('Recovery rehearsal source changed')
  }
  const initialGate = (await readGate()).rollout_state
  const initialHead = await observe()
  const verifyInitialHead = async () => {
    const current = await observe()
    if (!Object.values(compareCanaryProfiles(initialHead, current)).every(Boolean)) throw new Error('Original head changed')
    return current
  }
  const deployment = await readDeployment()
  const directory = join(config.workdir, '.cache', 'canary-execution')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const storePath = join(directory, 'packet-1.sqlite')
  const store = new CanaryExecutionStore(storePath)
  try { store.state(); throw new Error('Existing execution requires reconciliation; do not replay') }
  catch (error) { if (error.message !== 'Execution is not initialized') { store.close(); throw error } }
  store.initialize({ candidate, gate: initialGate, phase: 'delivered' })
  const executor = 'opening-' + randomUUID()
  let renewal, watchdog, watchdogExit
  let renewalFailed = false
  let watchdogOutput = ''
  let watchdogError = ''
  let browser
  let pending = null
  let sequence = 0
  let acknowledged = false
  let failed = false
  const results = []
  const receipt = { candidate, reviewed, startedUtc, procedure: 'packet-1-profile-opening-v1', rehearsalSha256: hash(rehearsal), runtimeConfigSha256: deployment.runtimeHash, assetIdentity: deployment.assetIdentity, sourceKind: 'live-browser', complete: false, results, cleanup: null }
  const requireLease = () => { if (renewalFailed) throw new Error('Lease lost'); store.requireLease(executor, Date.now()) }
  try {
    store.acquire(executor, Date.now(), 30000)
    renewal = setInterval(() => {
      try { store.renew(executor, Date.now(), 30000) } catch { renewalFailed = true }
    }, 5000)
    const invocationUtc = config.invocationUtc
    store.writeCheckpoint(executor, Date.now(), { planId: 'internal-canary-codex-autonomous-2026-09-05-v4',
      topLevelIssue: 286, invocationUtc, manifestSha256: hash(await readFile(new URL('../docs/internal-canary-execution-manifest.md', import.meta.url), 'utf8')),
      reviewSha: reviewed, baseSha: config.baseSha, deploymentSha: candidate, artifactHashes: [],
      soakStartUtc: null, soakEndUtc: null, sourceCursor: null, recoveryState: 'prepared', heartbeatReference: config.heartbeatReference })
    const watchdogConfig = join(directory, 'packet-1-watchdog.json')
    await writeFile(watchdogConfig, JSON.stringify({ ...config, mode: 'linked', candidate,
      executor, store: storePath, deadline: Date.now() + 20 * 60000 }), { mode: 0o600 })
    watchdog = dependencies.spawnWatchdog
      ? dependencies.spawnWatchdog({ configPath: watchdogConfig, store, executor })
      : spawn(process.execPath, [new URL('./watch-canary-execution.mjs', import.meta.url).pathname, watchdogConfig], { stdio: ['ignore', 'pipe', 'pipe'] })
    watchdog.stdout.on('data', data => { watchdogOutput += data.toString() })
    // The watchdog emits only its fixed status schema. Keep even failure output private.
    watchdog.stderr.on('data', data => { watchdogError += data.toString() })
    watchdogExit = new Promise(resolve => { watchdog.once('close', code => resolve(code)); watchdog.once('error', () => resolve(-1)) })
    const armedDeadline = Date.now() + 10000
    while (!watchdogOutput.includes('"state":"armed"') && Date.now() < armedDeadline) await new Promise(resolve => setTimeout(resolve, 100))
    if (!watchdogOutput.includes('"state":"armed"')) throw new Error('Independent containment did not arm')
    if (initialGate === 'developer-canary') {
      store.beginOperation(executor, Date.now(), { id: 'gate-entry-off', candidate, gate: initialGate })
      const contained = await containCanary(operator, config.expectedOwner)
      if (!Object.values(compareCanaryProfiles(initialHead, await observe())).every(Boolean)) throw new Error('Entry head changed')
      store.finishGateTransition(executor, Date.now(), { id: 'gate-entry-off', from: initialGate, to: 'off', evidenceHash: hash(contained) })
    }
    await verifyGateOff()
    // Synthetic deployed-client verification always precedes real account entry.
    const runSynthetic = dependencies.runSynthetic || (async () => {
      const child = spawn(process.execPath, [new URL('./hosted-profile-opening-smoke.mjs', import.meta.url).pathname, '--synthetic', candidate], {
        env: { ...process.env, EDENIA_CANARY_OPERATOR_WORKDIR: config.workdir }, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = ''
      child.stdout.on('data', data => { output += data.toString() })
      child.stderr.on('data', () => {})
      const code = await new Promise(resolve => child.once('exit', resolve))
      return { code, output }
    })
    const { code: syntheticCode, output: syntheticOutput } = await runSynthetic()
    await writeFile(join(directory, 'packet-1-synthetic.json'), syntheticOutput, { mode: 0o600 })
    if (syntheticCode !== 0) throw new Error('Synthetic deployed-client verification failed')
    browser = await (dependencies.launchBrowser || (() => chromium.launch({ channel: 'chrome', headless: false })))()
    receipt.browserVersion = browser.version()
    receipt.osVersion = dependencies.osVersion || execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim()
    receipt.procedureSha256 = createHash('sha256').update(await readFile(new URL('./hosted-profile-opening-smoke.mjs', import.meta.url))).digest('hex')
    const session = await (dependencies.authenticate || prepareOpeningAuthentication)({ browser, providerOrigin: deployment.providerOrigin,
      expectedOwner: config.expectedOwner, verifyGateOff: async () => { requireLease(); await verifyGateOff() },
      onReady: () => notify({ state: 'private-authentication-ui-ready', gate: 'off' }) })
    requireLease()
    await verifyInitialHead()
    const offGate = await readGate()
    requireLease()
    store.beginOperation(executor, Date.now(), { id: 'gate-real-enable', candidate, gate: 'off' })
    if (offGate.rollout_state !== 'off') throw new Error('Canary entry requires off gate')
    const enabled = await operator.query(enableCanarySql(config.expectedOwner, offGate.version))
    if (enabled.length !== 1 || (await readGate()).rollout_state !== 'developer-canary') throw new Error('Canary entry did not verify')
    store.finishGateTransition(executor, Date.now(), { id: 'gate-real-enable', from: 'off', to: 'developer-canary', evidenceHash: hash({ gate: 'developer-canary', ownerMatches: true }) })
    store.advancePhase(executor, Date.now(), { phase: 'live-scenario', skipSoak: true, evidenceHash: hash({ packet: 1, soakRequired: false, syntheticPassed: true }) })
    for (const bookkeeping of ['clean', 'malformed', 'stale', 'retry']) {
      const phaseStartedUtc = new Date().toISOString()
      const result = await (dependencies.runCase || runOpeningCase)({ browser, applicationOrigin: 'https://www.edenia.study',
        providerOrigin: deployment.providerOrigin, expectedRuntimeHash: deployment.runtimeHash, assetIdentity: deployment.assetIdentity, session, bookkeeping,
        verifyBefore: verifyInitialHead,
        canDispatch: async classification => {
          requireLease()
          await verifyInitialHead()
          if ((await readGate()).rollout_state !== 'developer-canary') return false
          requireLease()
          if (classification === 'resolve') {
            acknowledged = false
            pending = 'resolve-' + (++sequence)
            store.beginOperation(executor, Date.now(), { id: pending, candidate, gate: 'developer-canary' })
          }
          return true
        },
        onResolutionComplete: () => { acknowledged = true },
        verifyAfter: async before => {
          const equality = compareCanaryProfiles(initialHead, await observe())
          const unchanged = Object.values(equality).every(Boolean)
          if (pending && !acknowledged) return false
          if (unchanged && pending) {
            store.finishOperation(executor, Date.now(), { id: pending, outcome: 'completed', evidenceHash: hash(equality) })
            pending = null
          }
          return unchanged
        } })
      const source = { ...result, startedUtc: phaseStartedUtc, finishedUtc: new Date().toISOString() }
      const sourceHash = hash(source)
      await writeFile(join(directory, sourceHash + '.json'), JSON.stringify(source), { mode: 0o600 })
      results.push({ ...source, sourceSha256: sourceHash })
      if (!result.complete) throw new Error('Live opening phase failed')
    }
    if (hash(await readDeployment()) !== hash(deployment)) throw new Error('Deployment changed')
  } catch { failed = true }
  finally {
    try { await browser?.close() } catch { failed = true }
    clearInterval(renewal)
    watchdog?.kill('SIGTERM')
    const exit = watchdogExit ? await watchdogExit : -1
    // Also contain after all executor requests have settled. The database fence
    // protects runner loss; this path handles setup failures before watchdog arm.
    let fallbackContained = false
    try { await containCanary(operator, config.expectedOwner); fallbackContained = true } catch { failed = true }
    await writeFile(join(directory, 'packet-1-watchdog-result.txt'), watchdogOutput + watchdogError, { mode: 0o600 })
    try {
      await verifyGateOff()
      const equality = compareCanaryProfiles(initialHead, await observe())
      if (!fallbackContained || !Object.values(equality).every(Boolean)) throw new Error('Cleanup is not verified')
      receipt.cleanup = { gateOff: true, ownerRemoved: true, monitorDisabled: true, watchdogStopped: !watchdog || exit !== null, independentContainmentVerified: exit === 0 && watchdogOutput.includes('"state":"contained"'), ...equality }
      if (store.state().pending.length !== 0) throw new Error('Pending remote outcome requires reconciliation')
      store.reconcileExpired(Date.now(), { previousExecutorStopped: true, candidate, gate: 'off', pendingOutcome: null, evidenceHash: hash(receipt.cleanup) })
    } catch { failed = true }
    receipt.finishedUtc = new Date().toISOString()
    receipt.complete = !failed && receipt.cleanup?.independentContainmentVerified === true && results.length === 4 && receipt.cleanup !== null
    for (const [index, result] of results.entries()) {
      const evidence = encodeCanaryEvidence({ schemaVersion: 1, runId: randomUUID(),
        scenario: 'packet-1-profile-opening', subcase: index + 1, procedureSha256: receipt.procedureSha256,
        runnerSha: reviewed, candidateSha: candidate, gate: 'developer-canary', target: 'macos-chrome',
        browserVersion: receipt.browserVersion, osVersion: receipt.osVersion, sourceKind: 'live-browser',
        startedUtc: result.startedUtc, finishedUtc: result.finishedUtc,
        assertions: [{ id: 'ui-correct', passed: result.complete },
          { id: 'counts-match', passed: result.phases.every(phase => phase.complete && phase.unauthorized === 0) },
          { id: 'progress-preserved', passed: receipt.cleanup?.headUnchanged === true }],
        operations: [{ id: 'resolve', expected: index === 3 ? 3 : 2,
          observed: result.phases.reduce((sum, phase) => sum + phase.resolve, 0) }],
        cleanup: receipt.cleanup?.gateOff ? 'verified' : 'failed', sourceHashes: [result.sourceSha256] })
      await writeFile(join(directory, evidence.sha256 + '.json'), evidence.json, { mode: 0o600 })
    }
    await writeFile(join(directory, 'packet-1-live-result.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 })
    store.close()
    notify(receipt)
  }

  return receipt
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  try {
    const [candidate, reviewed] = process.argv.slice(2)
    if (process.argv.length !== 4 || !/^[a-f0-9]{40}$/u.test(candidate || '')
      || !/^[a-f0-9]{40}$/u.test(reviewed || '')
      || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== reviewed
      || execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '') throw new Error('Runner identity mismatch')
    const config = JSON.parse(await readFile(process.env.EDENIA_CANARY_PRIVATE_CONFIG, 'utf8'))
    const result = await executeOpeningWorkflow({ candidate, reviewed, config })
    if (!result.complete) process.exitCode = 1
  } catch { console.error(JSON.stringify({ complete: false, state: 'preflight-or-reconciliation-required' })); process.exitCode = 1 }
}
