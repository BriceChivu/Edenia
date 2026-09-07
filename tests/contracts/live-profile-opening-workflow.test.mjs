import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { executeOpeningWorkflow } from '../../scripts/run-live-profile-opening.mjs'
import { containCanary, READ_GATE_SQL } from '../../scripts/canary-containment-operator.mjs'
import { CanaryExecutionStore } from '../../scripts/canary-execution-store.mjs'

const candidate = 'a'.repeat(40)
const owner = '11111111-1111-1111-1111-111111111111'
async function fixture(t, options = {}) {
  const workdir = await mkdtemp(join(tmpdir(), 'opening-workflow-'))
  t.after(() => rm(workdir, { recursive: true, force: true }))
  const scriptSources = {}
  for (const name of ['canary-containment-operator.mjs', 'canary-profile-verifier.mjs', 'canary-execution-store.mjs', 'watch-canary-execution.mjs']) {
    scriptSources[name] = createHash('sha256').update(await readFile(new URL('../../scripts/' + name, import.meta.url))).digest('hex')
  }
  const rehearsalReceipt = join(workdir, 'rehearsal.json')
  await writeFile(rehearsalReceipt, JSON.stringify({ complete: true, cleanupVerified: true, hostedOperations: 0, scriptSources,
    containment: ['executor-killed', 'hard-deadline', 'execution-store-unavailable', 'containment-before-delayed-enable', 'enable-before-containment'].map(scenario => ({ scenario, gateOff: true })) }))
  const config = { expectedOwner: owner, workdir, rehearsalReceipt, invocationUtc: '2026-09-07T00:00:00.000Z', baseSha: 'b'.repeat(40), heartbeatReference: 'synthetic-heartbeat' }
  let gate = 'off', version = '2026-09-07 00:00:00+00', enabled = 0, calls = 0, head = 'original', closed = false
  const operator = {
    async query(sql) {
      if (sql === READ_GATE_SQL) return [{ rollout_state: gate, owner: gate === 'off' ? null : owner, version }]
      if (sql.includes("set rollout_state = 'developer-canary'")) {
        if (options.rejectEnable) return []
        gate = 'developer-canary'; enabled++; return [{ rollout_state: gate }]
      }
      gate = 'off'; version = '2026-09-07 00:00:01+00'; return [{ rollout_state: gate }]
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
        await containCanary(operator, owner)
        store.finishContainment('synthetic-watchdog', 'e'.repeat(64), true)
        child.stdout.emit('data', '{"state":"contained"}')
        child.emit('close', 0)
      }) }
      return child
    },
    async runCase(args) {
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
    state: () => { const store = new CanaryExecutionStore(join(workdir, '.cache/canary-execution/packet-1.sqlite')); try { return store.state() } finally { store.close() } } }
}

test('workflow completes four phases with original head, receipt and independent gate cleanup', async t => {
  const f = await fixture(t)
  const result = await executeOpeningWorkflow(f.input, f.dependencies)
  assert.equal(result.complete, true)
  assert.equal(result.results.length, 4)
  assert.equal(result.cleanup.independentContainmentVerified, true)
  assert.deepEqual(f.inspect(), { gate: 'off', enabled: 1, calls: 4, closed: true })
  assert.equal(f.state().pending.length, 0)
  await assert.rejects(executeOpeningWorkflow(f.input, f.dependencies), /Existing execution requires reconciliation/)
  assert.equal(f.inspect().enabled, 1)
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
