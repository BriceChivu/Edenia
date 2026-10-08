import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { executeOpeningWorkflow } from '../../scripts/run-live-profile-opening.mjs'
import { containCanary, containTrial, READ_GATE_SQL, READ_TRIAL_GATE_SQL } from '../../scripts/canary-containment-operator.mjs'
import { CanaryExecutionStore } from '../../scripts/canary-execution-store.mjs'

const candidate = 'a'.repeat(40)
const owner = '11111111-1111-1111-1111-111111111111'
async function fixture(t, options = {}) {
  const trial = options.trial === true
  const stage = trial ? 'tester-trial' : 'developer-canary'
  const testers = [owner, '22222222-2222-2222-2222-222222222222']
  const workdir = await mkdtemp(join(tmpdir(), 'opening-workflow-'))
  t.after(() => rm(workdir, { recursive: true, force: true }))
  const scriptSources = {}
  for (const name of ['canary-containment-operator.mjs', 'canary-profile-verifier.mjs', 'canary-execution-store.mjs', 'watch-canary-execution.mjs', 'opening-gate-binding.mjs', 'run-live-profile-opening.mjs', 'rehearse-canary-containment.mjs']) {
    scriptSources[name] = createHash('sha256').update(await readFile(new URL('../../scripts/' + name, import.meta.url))).digest('hex')
  }
  const rehearsalReceipt = join(workdir, 'rehearsal.json')
  await writeFile(rehearsalReceipt, JSON.stringify({ complete: true, cleanupVerified: true, hostedOperations: 0, scriptSources,
    containment: ['executor-killed', 'hard-deadline', 'execution-store-unavailable', 'containment-before-delayed-enable', 'enable-before-containment'].map(scenario => ({ scenario: trial ? 'trial-' + scenario : scenario, gateOff: true, ...(trial ? { audienceRemoved: true } : {}) })) }))
  const config = { ...(trial ? { surface: 'trial', expectedTesters: testers } : {}), expectedOwner: owner, workdir, rehearsalReceipt, invocationUtc: '2026-09-07T00:00:00.000Z', baseSha: 'b'.repeat(40), heartbeatReference: 'synthetic-heartbeat' }
  let gate = 'off', version = '2026-09-07 00:00:00+00', enabled = 0, calls = 0, containments = 0, head = 'original', closed = false
  const operator = {
    async query(sql) {
      if (sql.startsWith('select count(*)::integer as admitted')) return [{ admitted: testers.length }]
      if (sql === READ_TRIAL_GATE_SQL) return [{ rollout_state: gate, owner: null, testers: gate === 'off' ? [] : testers, version }]
      if (sql === READ_GATE_SQL) return [{ rollout_state: gate, owner: gate === 'off' ? null : owner, version }]
      if (sql.includes("set rollout_state = '" + stage + "'")) {
        if (options.rejectEnable) return []
        gate = stage; enabled++; return [{ rollout_state: gate }]
      }
      containments++; gate = 'off'; version = '2026-09-07 00:00:01+00'; return [{ rollout_state: gate }]
    },
    async monitorDisabled() { return true }, async disableMonitor() { throw new Error('Unexpected monitor mutation') }
  }
  const observe = async () => ({ owner, profileId: owner, headCount: 1, validHead: true, headHash: head,
    profileHash: head, generation: '1', revision: '3', versionHashes: ['version'], protectionHashes: [] })
  const dependencies = {
    operator, observe, notify() {}, osVersion: '26.6.2',
    readDeployment: async () => ({ runtimeHash: 'c'.repeat(64), assetIdentity: { version: candidate.slice(0, 12), sha256: 'd'.repeat(64) }, providerOrigin: 'https://synthetic.supabase.co' }),
    runSynthetic: async () => ({ code: 0, output: '{}' }),
    launchBrowser: async () => ({ version: () => '152.0.7977.76', close: async () => { closed = true } }),
    authenticate: async () => { if (options.driftAtAuth) head = 'changed'; return { user: { id: owner } } },
    spawnWatchdog({ store, executor }) {
      if (options.setupFailure) throw new Error('Synthetic spawn failure')
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
      store.claimWatchdog('synthetic-watchdog', executor, Date.now(), Date.now() + 60000)
      setImmediate(() => child.stdout.emit('data', '{"state":"armed"}'))
      child.kill = () => { setImmediate(async () => {
        store.beginContainment('synthetic-watchdog', Date.now())
        await (trial ? containTrial(operator, testers) : containCanary(operator, owner))
        store.finishContainment('synthetic-watchdog', 'e'.repeat(64), true)
        child.stdout.emit('data', '{"state":"contained"}')
        child.emit('close', 0)
      }) }
      return child
    },
    async runCase(args) {
      assert.equal(args.surface, trial ? 'trial' : 'public')
      calls++
      if (options.driftAtPhase) head = 'changed'
      await args.verifyBefore()
      assert.equal(await args.canDispatch('resolve'), true)
      if (!options.ambiguousResolver) args.onResolutionComplete()
      return { complete: await args.verifyAfter(), bookkeeping: args.bookkeeping, phases: [] }
    }
  }
  return { input: { candidate, reviewed: candidate, config }, dependencies,
    inspect: () => ({ gate, enabled, calls, closed }),
    containmentCount: () => containments,
    state: () => { const store = new CanaryExecutionStore(join(workdir, trial ? '.cache/auth-trial-opening/packet-1.sqlite' : '.cache/canary-execution/packet-1.sqlite')); try { return store.state() } finally { store.close() } } }
}

test('workflow completes four phases with original head, receipt and independent gate cleanup', async t => {
  const f = await fixture(t)
  const result = await executeOpeningWorkflow(f.input, f.dependencies)
  assert.equal(result.complete, true)
  assert.equal(result.results.length, 4)
  assert.equal(result.cleanup.independentContainmentVerified, true)
  assert.deepEqual(f.inspect(), { gate: 'off', enabled: 1, calls: 4, closed: true })
  assert.equal(f.state().pending.length, 0)
  assert.equal(f.state().phase, 'cleanup')
  await assert.rejects(executeOpeningWorkflow(f.input, f.dependencies), /Existing execution requires reconciliation/)
  assert.equal(f.inspect().enabled, 1)
})

test('email setup derives only the approved existing account and keeps its identity out of receipts', async t => {
  const f = await fixture(t)
  f.input.config.authMethod = 'email-code'
  const originalQuery = f.dependencies.operator.query
  let derived = false
  f.dependencies.operator.query = async sql => {
    if (sql.startsWith('select email from auth.users')) {
      assert.equal(sql, `select email from auth.users where id = '${owner}'::uuid and email_confirmed_at is not null and deleted_at is null;`)
      derived = true
      return [{ email: 'approved@example.invalid' }]
    }
    return originalQuery(sql)
  }
  f.dependencies.authenticate = async args => {
    assert.equal(derived, true)
    assert.equal(args.expectedOwner, owner)
    assert.equal(args.expectedEmail, 'approved@example.invalid')
    assert.equal(args.method, 'email-code')
    return { user: { id: owner } }
  }
  const result = await executeOpeningWorkflow(f.input, f.dependencies)
  assert.equal(result.complete, true)
  assert.equal(JSON.stringify(result).includes('approved@example.invalid'), false)
  assert.deepEqual(result.authenticationSetup, { method: 'email-code', accountCreationSuppressed: true, evidenceClass: 'constrained-authentication-setup' })
})
for (const option of ['driftAtAuth', 'driftAtPhase', 'ambiguousResolver', 'setupFailure', 'rejectEnable']) {
  test(`workflow contains and fails closed on ${option}`, async t => {
    const f = await fixture(t, { [option]: true })
    const result = await executeOpeningWorkflow(f.input, f.dependencies)
    assert.equal(result.complete, false)
    assert.equal(f.inspect().gate, 'off')
    if (option === 'driftAtAuth' || option === 'setupFailure') assert.equal(f.inspect().enabled, 0)
    if (option === 'ambiguousResolver' || option === 'rejectEnable') assert.equal(f.state().pending.length, 1)
    if (option === 'driftAtPhase') assert.equal(f.state().pending.length, 0)
  })
}

test('explicit post-repair continuation preserves the journal and prior attempt evidence', async t => {
  const f = await fixture(t)
  f.dependencies.runSynthetic = async () => ({ code: 1, output: '{"complete":false}' })
  assert.equal((await executeOpeningWorkflow(f.input, f.dependencies)).complete, false)
  assert.equal(f.state().phase, 'delivered')
  await assert.rejects(executeOpeningWorkflow({ ...f.input, config: { ...f.input.config, resumeAfterRepair: true } }, f.dependencies), /Existing execution requires reconciliation/)
  const store = new CanaryExecutionStore(join(f.input.config.workdir, '.cache/canary-execution/packet-1.sqlite'))
  try {
    store.acquire('repair-owner', Date.now(), 10000)
    store.suspendForRepair('repair-owner', Date.now(), { issue: 305, evidenceHash: 'f'.repeat(64) })
    store.resumeAfterRepair('repair-owner', Date.now(), { issue: 305, closureEvidenceHash: 'e'.repeat(64), candidate, gate: 'off' })
    store.release('repair-owner', Date.now())
  } finally { store.close() }
  f.dependencies.runSynthetic = async () => ({ code: 0, output: '{"complete":true}' })
  const resumed = { ...f.input, config: { ...f.input.config, resumeAfterRepair: true } }
  assert.equal((await executeOpeningWorkflow(resumed, f.dependencies)).complete, true)
  assert.equal(f.state().phase, 'cleanup')
  const { readdir } = await import('node:fs/promises')
  const directory = join(f.input.config.workdir, '.cache/canary-execution')
  const attempts = (await readdir(directory)).filter(name => name.startsWith('attempt-'))
  assert.equal(attempts.length, 2)
  const receipts = await Promise.all(attempts.map(name => readFile(join(directory, name, 'packet-1-live-result.json'), 'utf8').then(JSON.parse)))
  assert.equal(receipts.filter(receipt => receipt.complete).length, 1)
  assert.equal(receipts.filter(receipt => !receipt.complete).length, 1)
  await assert.rejects(executeOpeningWorkflow(resumed, f.dependencies), /Existing execution requires reconciliation/)
})

test('competing resumed invocation cannot contain the executor that owns the lease', async t => {
  const f = await fixture(t)
  f.dependencies.runSynthetic = async () => ({ code: 1, output: '{}' })
  await executeOpeningWorkflow(f.input, f.dependencies)
  const store = new CanaryExecutionStore(join(f.input.config.workdir, '.cache/canary-execution/packet-1.sqlite'))
  try {
    store.acquire('repair-owner', Date.now(), 10000)
    store.suspendForRepair('repair-owner', Date.now(), { issue: 305, evidenceHash: 'f'.repeat(64) })
    store.resumeAfterRepair('repair-owner', Date.now(), { issue: 305, closureEvidenceHash: 'e'.repeat(64), candidate, gate: 'off' })
    store.release('repair-owner', Date.now())
  } finally { store.close() }
  const before = f.containmentCount()
  let arrivals = 0, release
  const barrier = new Promise(resolve => { release = resolve })
  f.dependencies.beforeAcquire = async () => { if (++arrivals === 2) release(); await barrier }
  f.dependencies.runSynthetic = async () => ({ code: 0, output: '{}' })
  const resumed = { ...f.input, config: { ...f.input.config, resumeAfterRepair: true } }
  const outcomes = await Promise.allSettled([executeOpeningWorkflow(resumed, f.dependencies), executeOpeningWorkflow(resumed, f.dependencies)])
  assert.equal(outcomes.filter(result => result.status === 'fulfilled' && result.value.complete).length, 1)
  assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1)
  assert.equal(f.inspect().enabled, 1)
  assert.equal(f.inspect().calls, 4)
  assert.equal(f.containmentCount() - before, 2) // Winner watchdog plus independent final containment only.
})

async function nativeFixture(t) {
  const f = await fixture(t)
  f.input.config.authMethod = 'email-code'
  f.input.config.authTransport = 'native-inspected'
  f.input.config.nativeAuthentication = { manifestSha256: 'e'.repeat(64) }
  const query = f.dependencies.operator.query
  f.dependencies.operator.query = async sql => sql.startsWith('select email from auth.users')
    ? [{ email: 'approved@example.invalid' }] : query(sql)
  f.dependencies.authenticate = async () => { throw new Error('Native mode must not use Playwright authentication') }
  return f
}

test('native workflow hands off within the same lease before creating the case browser or enabling gate', async t => {
  const f = await nativeFixture(t), events = []
  const launch = f.dependencies.launchBrowser
  f.dependencies.launchBrowser = async () => { events.push('case-browser'); return launch() }
  f.dependencies.authenticateNative = async args => {
    assert.equal(f.inspect().enabled, 0)
    assert.equal(events.length, 0)
    assert.equal(args.browser, undefined)
    assert.equal(args.expectedEmail, 'approved@example.invalid')
    assert.equal(args.expectedOwner, owner)
    assert.equal(args.expectedRuntimeHash, 'c'.repeat(64))
    assert.equal(args.lease.candidate, candidate)
    assert.equal(args.lease.workdir, f.input.config.workdir)
    assert.equal(f.state().owner, args.lease.executor)
    await args.verifyGateOff()
    events.push('native-cleaned')
    return { user: { id: owner } }
  }
  const result = await executeOpeningWorkflow(f.input, f.dependencies)
  assert.equal(result.complete, true)
  assert.deepEqual(events, ['native-cleaned', 'case-browser'])
  assert.equal(result.authenticationSetup.transport, 'native-inspected')
  assert.equal(result.authenticationSetup.preparationSha256, 'e'.repeat(64))
  assert.equal(JSON.stringify(result).includes('approved@example.invalid'), false)
})
for (const failure of ['preparation-denied', 'owner-mismatch', 'gate-change']) {
  test(`native workflow never launches case browser or enables gate on ${failure}`, async t => {
    const f = await nativeFixture(t)
    let launched = false
    f.dependencies.launchBrowser = async () => { launched = true; throw new Error('Unexpected launch') }
    f.dependencies.authenticateNative = async args => {
      if (failure === 'preparation-denied') throw new Error('Preparation not reviewed')
      if (failure === 'gate-change') {
        const original = f.dependencies.operator.query
        let first = true
        f.dependencies.operator.query = async sql => {
          if (sql === READ_GATE_SQL && first) { first = false; return [{ rollout_state: 'developer-canary', owner }] }
          return original(sql)
        }
      }
      return { user: { id: failure === 'owner-mismatch' ? 'different-owner' : owner } }
    }
    const result = await executeOpeningWorkflow(f.input, f.dependencies)
    assert.equal(result.complete, false)
    assert.equal(launched, false)
    assert.equal(f.inspect().enabled, 0)
    assert.equal(f.inspect().calls, 0)
    assert.equal(f.inspect().gate, 'off')
  })
}
test('native mode rejects unsupported authentication before acquiring authority', async t => {
  const f = await nativeFixture(t)
  f.input.config.authMethod = 'google'
  await assert.rejects(executeOpeningWorkflow(f.input, f.dependencies), /Unsupported authentication transport/)
  assert.equal(f.containmentCount(), 0)
})

test('native failure receipt retains sanitized transport evidence and still contains the attempt', async t => {
  const f = await nativeFixture(t)
  f.dependencies.authenticateNative = async args => {
    assert.equal(args.onReady, undefined)
    args.onProgress({ browserStarted: true, documentDelivered: false, url: 'SECRET' })
    throw Object.assign(new Error('SECRET'), { nativeDiagnostic: { browserStarted: true, documentDelivered: false, failure: 'upstream-reset', body: 'SECRET', applicationTransport: { connectAccepted: true, tlsEstablished: false, connectionFailure: 'client-tls', body: 'SECRET' } } })
  }
  const result = await executeOpeningWorkflow(f.input, f.dependencies)
  assert.equal(result.complete, false)
  assert.deepEqual(result.authenticationSetup.diagnostic, { browserStarted: true, documentDelivered: false, failure: 'upstream-reset', connectionFailure: null, applicationTransport: { connectAccepted: true, tlsEstablished: false, connectionFailure: 'client-tls' } })
  assert.equal(JSON.stringify(result).includes('SECRET'), false)
  assert.equal(f.inspect().enabled, 0)
  assert.equal(f.inspect().calls, 0)
  assert.equal(f.inspect().gate, 'off')
})

test('later case failure does not mislabel completed native authentication', async t => {
  const f = await nativeFixture(t)
  f.dependencies.authenticateNative = async args => {
    args.onProgress({ browserStarted: true, documentDelivered: true })
    return { user: { id: owner } }
  }
  f.dependencies.runCase = async () => { throw new Error('Later case failed') }
  const result = await executeOpeningWorkflow(f.input, f.dependencies)
  assert.equal(result.complete, false)
  assert.deepEqual(result.authenticationSetup.diagnostic, { browserStarted: true, documentDelivered: true, failure: null, connectionFailure: null, applicationTransport: { connectAccepted: false, tlsEstablished: false, connectionFailure: null } })
  assert.equal(f.inspect().gate, 'off')
})


test('trial workflow binds authentication, entry, journal and cleanup to the exact audience', async t => {
  const f = await fixture(t, { trial: true })
  f.dependencies.authenticate = async args => {
    assert.equal(args.surface, 'trial')
    await args.verifyGateOff()
    return { user: { id: owner } }
  }
  const result = await executeOpeningWorkflow(f.input, f.dependencies)
  assert.equal(result.complete, true)
  assert.equal(result.surface, 'trial')
  assert.equal(result.cleanup.audienceRemoved, true)
  assert.equal(f.state().phase, 'cleanup')
  assert.equal(JSON.stringify(result).includes(owner), false)
  const { readdir } = await import('node:fs/promises')
  const dir = join(f.input.config.workdir, '.cache/auth-trial-opening')
  const attempt = (await readdir(dir)).find(name => name.startsWith('attempt-'))
  const config = JSON.parse(await readFile(join(dir, attempt, 'packet-1-watchdog.json'), 'utf8'))
  assert.equal(config.surface, 'trial')
  assert.deepEqual(config.expectedTesters, f.input.config.expectedTesters)
  await assert.rejects(readFile(join(f.input.config.workdir, '.cache/canary-execution/packet-1.sqlite')), /ENOENT/)
})

for (const option of ['setupFailure', 'driftAtAuth', 'ambiguousResolver', 'rejectEnable']) {
  test(`trial ${option} remains incomplete and clears admission`, async t => {
    const f = await fixture(t, { trial: true, [option]: true })
    const result = await executeOpeningWorkflow(f.input, f.dependencies)
    assert.equal(result.complete, false)
    assert.equal(f.inspect().gate, 'off')
    if (option === 'driftAtAuth') assert.equal(result.cleanup, null)
    else assert.equal(result.cleanup.audienceRemoved, true)
  })
}

test('trial rejects changed admission, missing owner and legacy rehearsal before authority', async t => {
  for (const failure of ['audience', 'owner', 'legacy-rehearsal', 'native']) {
    const f = await fixture(t, { trial: true })
    if (failure === 'audience') {
      const query = f.dependencies.operator.query
      f.dependencies.operator.query = async sql => sql === READ_TRIAL_GATE_SQL
        ? [{ rollout_state: 'tester-trial', owner: null, testers: [owner], version: '2026-09-07 00:00:00+00' }] : query(sql)
    }
    if (failure === 'owner') f.input.config.expectedTesters = ['22222222-2222-2222-2222-222222222222']
    if (failure === 'native') { f.input.config.authTransport = 'native-inspected'; f.input.config.authMethod = 'email-code' }
    if (failure === 'legacy-rehearsal') {
      const receipt = JSON.parse(await readFile(f.input.config.rehearsalReceipt, 'utf8'))
      receipt.containment = receipt.containment.map(row => ({ ...row, scenario: row.scenario.slice(6) }))
      await writeFile(f.input.config.rehearsalReceipt, JSON.stringify(receipt))
    }
    await assert.rejects(executeOpeningWorkflow(f.input, f.dependencies))
    assert.equal(f.containmentCount(), 0)
    assert.equal(f.inspect().enabled, 0)
  }
})

test('trial repaired execution cannot resume with another exact audience', async t => {
  const f = await fixture(t, { trial: true })
  f.dependencies.runSynthetic = async () => ({ code: 1, output: '{}' })
  await executeOpeningWorkflow(f.input, f.dependencies)
  const store = new CanaryExecutionStore(join(f.input.config.workdir, '.cache/auth-trial-opening/packet-1.sqlite'))
  try {
    store.acquire('repair-owner', Date.now(), 10000)
    store.suspendForRepair('repair-owner', Date.now(), { issue: 305, evidenceHash: 'f'.repeat(64) })
    store.resumeAfterRepair('repair-owner', Date.now(), { issue: 305, closureEvidenceHash: 'e'.repeat(64), candidate, gate: 'off' })
    store.release('repair-owner', Date.now())
  } finally { store.close() }
  const resumed = { ...f.input, config: { ...f.input.config, resumeAfterRepair: true, expectedTesters: [owner] } }
  const before = f.containmentCount()
  const query = f.dependencies.operator.query
  f.dependencies.operator.query = async sql => sql.startsWith('select count(*)::integer as admitted') ? [{ admitted: 1 }] : query(sql)
  await assert.rejects(executeOpeningWorkflow(resumed, f.dependencies), /Existing execution requires reconciliation/)
  assert.equal(f.containmentCount(), before)
  f.dependencies.operator.query = query
  resumed.config.expectedTesters = [...f.input.config.expectedTesters].reverse()
  f.dependencies.runSynthetic = async () => ({ code: 0, output: '{}' })
  assert.equal((await executeOpeningWorkflow(resumed, f.dependencies)).complete, true)
})


test('trial rejects authentication owner mismatch before admission', async t => {
  const f = await fixture(t, { trial: true })
  f.dependencies.authenticate = async () => ({ user: { id: '22222222-2222-2222-2222-222222222222' } })
  const result = await executeOpeningWorkflow(f.input, f.dependencies)
  assert.equal(result.complete, false)
  assert.equal(f.inspect().enabled, 0)
  assert.equal(result.cleanup.audienceRemoved, true)
})

for (const mismatch of ['none', 'trial-disabled', 'public-accounts', 'wrong-project', 'wrong-version', 'entry-missing', 'drift-at-auth']) {
  test(`trial delivery preflight handles ${mismatch} without widening audience`, async t => {
    const f = await fixture(t, { trial: true })
    delete f.dependencies.readDeployment
    f.input.config.projectRef = 'abcdefghijklmnopqrst'
    const runtime = { authTrialEnabled: mismatch !== 'trial-disabled', accountFeaturesRollout: mismatch === 'public-accounts' ? 'public' : 'off',
      learnerProfileLifecycleEnabled: false, supabaseUrl: 'https://' + (mismatch === 'wrong-project' ? 'different' : f.input.config.projectRef) + '.supabase.co' }
    const source = 'window.EDENIA_CONFIG = ' + JSON.stringify(runtime) + ';'
    const sha = createHash('sha256').update(source).digest('hex')
    let assetDrift = false
    const requested = []
    f.dependencies.fetchDeployment = async url => {
      const path = new URL(url).pathname
      requested.push(path)
      if (path === '/release.json') return { json: async () => ({ deployedCommit: candidate, runtimeConfigSha256: sha,
        assetVersion: (mismatch === 'wrong-version' ? 'b'.repeat(12) : candidate.slice(0, 12)) + '-p1-g1' }) }
      if (path === '/config.local.js') return { text: async () => source }
      return { ok: !(mismatch === 'entry-missing' && path === '/auth-trial-entry.js'), arrayBuffer: async () => Buffer.from(assetDrift ? 'changed' : path) }
    }
    if (mismatch === 'drift-at-auth') f.dependencies.authenticate = async () => { assetDrift = true; return { user: { id: owner } } }
    if (['none', 'drift-at-auth'].includes(mismatch)) {
      const result = await executeOpeningWorkflow(f.input, f.dependencies)
      assert.equal(result.complete, mismatch === 'none')
      assert.equal(f.inspect().enabled, mismatch === 'none' ? 1 : 0)
      assert.ok(requested.includes('/site-entry.js'))
      assert.ok(requested.includes('/auth-trial-entry.js'))
    } else {
      await assert.rejects(executeOpeningWorkflow(f.input, f.dependencies))
      assert.equal(f.containmentCount(), 0)
      assert.equal(f.inspect().enabled, 0)
    }
  })
}


test('trial requires every selected account to be verified and unlocked, including after authentication', async t => {
  for (const moment of ['preflight', 'after-authentication']) {
    const f = await fixture(t, { trial: true })
    const query = f.dependencies.operator.query
    let eligible = moment !== 'preflight'
    f.dependencies.operator.query = async sql => sql.startsWith('select count(*)::integer as admitted')
      ? [{ admitted: eligible ? f.input.config.expectedTesters.length : 1 }] : query(sql)
    f.dependencies.authenticate = async () => { eligible = false; return { user: { id: owner } } }
    if (moment === 'preflight') await assert.rejects(executeOpeningWorkflow(f.input, f.dependencies), /not all eligible/)
    else assert.equal((await executeOpeningWorkflow(f.input, f.dependencies)).complete, false)
    assert.equal(f.inspect().enabled, 0)
    assert.equal(f.inspect().gate, 'off')
  }
})
