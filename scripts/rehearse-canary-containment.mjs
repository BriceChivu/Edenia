import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Called only by the database rehearsal after it creates and verifies its own
// target. This is not a CLI accepting arbitrary database/container arguments.
export async function rehearseCanaryContainment({ workdir, project, query, owner }) {
  if (typeof owner !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(owner)) throw new Error('Invalid synthetic owner')
  const storeModule = new URL('./canary-execution-store.mjs', import.meta.url).href
  const watchdogFile = fileURLToPath(new URL('./watch-canary-execution.mjs', import.meta.url))
  const results = []
  const invariant = async () => (await query("select json_build_object('heads', (select count(*) from public.learner_profile_heads), 'versions', (select count(*) from public.learner_profile_versions))::text;")).trim()
  const before = await invariant()
  for (const scenario of ['executor-killed', 'hard-deadline', 'execution-store-unavailable']) {
    await query(`update private.learner_profile_access_control set rollout_state = 'developer-canary', developer_user_id = '${owner}'::uuid where singleton = true;`)
    await writeFile(join(workdir, 'monitor-fixture'), 'true', { mode: 0o600 })
    const store = join(workdir, `${scenario}.sqlite`)
    const code = `
      import { CanaryExecutionStore } from ${JSON.stringify(storeModule)};
      const store = new CanaryExecutionStore(process.argv[1]);
      store.initialize({ candidate: 'a'.repeat(40), gate: 'developer-canary' });
      store.acquire('fixture-executor', Date.now(), 2000);
      store.beginOperation('fixture-executor', Date.now(), { id: 'pending-fixture', candidate: 'a'.repeat(40), gate: 'developer-canary' });
      console.log('ready');
      const timer = setInterval(() => {
        try { store.renew('fixture-executor', Date.now(), 2000); }
        catch { clearInterval(timer); store.close(); }
      }, 250);
    `
    const executor = spawn(process.execPath, ['--input-type=module', '-e', code, store], { stdio: ['ignore', 'pipe', 'pipe'] })
    const executorDone = new Promise(resolve => executor.once('close', (code, signal) => resolve({ code, signal })))
    let watchdog
    let watchdogDone
    try {
      await waitForText(executor, 'ready')
      const configFile = join(workdir, `${scenario}-watchdog.json`)
      await writeFile(configFile, JSON.stringify({ mode: 'local-rehearsal', workdir, projectRef: project,
        expectedOwner: owner, candidate: 'a'.repeat(40), executor: 'fixture-executor', store,
        deadline: Date.now() + (scenario === 'hard-deadline' ? 2000 : 30000) }), { mode: 0o600 })
      watchdog = spawn(process.execPath, [watchdogFile, configFile], { stdio: ['ignore', 'pipe', 'pipe'] })
      let output = ''
      watchdog.stdout.on('data', chunk => { output += chunk })
      watchdogDone = new Promise(resolve => watchdog.once('close', code => resolve(code)))
      await waitForText(watchdog, '"state":"armed"')
      if (scenario !== 'hard-deadline') { executor.kill('SIGKILL'); await executorDone }
      if (scenario === 'execution-store-unavailable') await writeFile(store, 'corrupt synthetic checkpoint')
      const exit = await Promise.race([watchdogDone, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Independent watchdog deadline exceeded')), 35000); timer.unref() })])
      assert.equal(exit, scenario === 'execution-store-unavailable' ? 1 : 0)
      const receipt = output.trim().split('\n').map(line => JSON.parse(line)).find(row => row.state === (scenario === 'execution-store-unavailable' ? 'contained-checkpoint-unavailable' : 'contained'))
      assert.equal(receipt?.gateOff, true)
      assert.equal(receipt?.monitorDisabled, true)
      assert.equal(await invariant(), before)
      results.push({ scenario, gateOff: true, monitorDisabled: true, profileCountsPreserved: true, independentProcess: true })
    } finally {
      if (executor.exitCode === null && executor.signalCode === null) executor.kill('SIGKILL')
      if (watchdog && watchdog.exitCode === null && watchdog.signalCode === null) watchdog.kill('SIGKILL')
      await executorDone
      await watchdogDone
      await query("update private.learner_profile_access_control set rollout_state = 'off', developer_user_id = null where singleton = true;")
      await writeFile(join(workdir, 'monitor-fixture'), 'false', { mode: 0o600 })
    }
  }
  return results
}

function waitForText(child, marker) {
  return new Promise((resolve, reject) => {
    let text = ''
    const timer = setTimeout(() => { cleanup(); reject(new Error('Rehearsal child did not become ready')) }, 10000)
    const onData = chunk => { text += chunk; if (text.includes(marker)) { cleanup(); resolve() } }
    const onClose = () => { cleanup(); reject(new Error('Rehearsal child exited before readiness')) }
    function cleanup() { clearTimeout(timer); child.stdout.off('data', onData); child.off('close', onClose); child.off('error', onClose) }
    child.stdout.on('data', onData)
    child.once('close', onClose)
    child.once('error', onClose)
  })
}
