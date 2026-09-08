import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { prepareNativeOpeningAuthentication } from '../../scripts/native-opening-authentication.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'native-preparation-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const profileDirectory = join(root, 'profile')
  await mkdir(profileDirectory)
  const applicationOrigin = 'https://app.example.invalid', providerOrigin = 'https://provider.example.invalid'
  const certificates = []
  for (const [i, origin] of [applicationOrigin, providerOrigin, 'https://challenges.cloudflare.com'].entries()) {
    const certificateFile = join(root, `${i}.crt`), keyFile = join(root, `${i}.key`)
    await writeFile(certificateFile, 'synthetic certificate')
    await writeFile(keyFile, 'synthetic key', { mode: 0o600 })
    certificates.push({ origin, certificateFile, keyFile })
  }
  const manifest = JSON.stringify({ profileDirectory, candidate: 'candidate', procedure: 'native-opening-authentication-v1', authenticationMethod: 'email-code', profileContainsOnlyReviewedPreparation: true, certificates })
  const manifestFile = join(root, 'manifest.json')
  await writeFile(manifestFile, manifest)
  const messages = [], kills = [], worker = new EventEmitter()
  worker.connected = true
  worker.send = message => { messages.push(message) }
  worker.kill = signal => { kills.push(signal) }
  let started
  const ready = new Promise(resolve => { started = resolve })
  return { worker, messages, kills, ready,
    options: { applicationOrigin, providerOrigin, expectedOwner: 'owner', expectedEmail: 'synthetic@example.invalid', verifyGateOff: async () => {}, timeoutMs: 1000,
      native: { preparationRoot: root, manifestFile, manifestSha256: createHash('sha256').update(manifest).digest('hex') },
      lease: { candidate: 'candidate', workdir: root, executor: 'executor' } },
    dependencies: { fork: () => { started(); return worker } } }
}

test('native preparation defaults to denial before starting worker', async t => {
  const f = await fixture(t)
  await assert.rejects(prepareNativeOpeningAuthentication(f.options, f.dependencies), /has not passed review/)
  assert.equal(f.messages.length, 0)
})
test('native session remains private until worker exits after verified cleanup', async t => {
  const f = await fixture(t)
  const result = prepareNativeOpeningAuthentication({ ...f.options, verifyPreparation: async () => true }, f.dependencies)
  await f.ready
  let resolved = false
  void result.then(() => { resolved = true })
  const session = { user: { id: 'owner' }, access_token: 'synthetic' }
  f.worker.emit('message', { type: 'finished', complete: true, cleanupVerified: true, session })
  await Promise.resolve()
  assert.equal(resolved, false)
  f.worker.emit('exit', 0)
  assert.deepEqual(await result, session)
})
test('hung worker times out with explicit failure and no accepted session', async t => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const result = prepareNativeOpeningAuthentication({ ...f.options, verifyPreparation: async () => true }, f.dependencies)
  const rejected = assert.rejects(result, /Native authentication incomplete/)
  await f.ready
  t.mock.timers.tick(16000)
  assert.equal(f.messages.at(-1).type, 'stop')
  t.mock.timers.tick(20000)
  await rejected
  assert.deepEqual(f.kills, ['SIGKILL'])
})

for (const failure of ['unverified-cleanup', 'abnormal-exit', 'wrong-owner', 'authorization-loss', 'ready-failed']) {
  test(`native wrapper rejects a claimed session after ${failure}`, async t => {
    const f = await fixture(t)
    let gateChecks = 0
    const result = prepareNativeOpeningAuthentication({ ...f.options, verifyPreparation: async () => true,
      verifyGateOff: async () => { if (++gateChecks > 1 && failure === 'authorization-loss') throw new Error('Gate changed') },
      onReady: async () => { if (failure === 'ready-failed') throw new Error('UI unavailable') }
    }, f.dependencies)
    const rejected = assert.rejects(result, /Native authentication incomplete/)
    await f.ready
    if (failure === 'authorization-loss') f.worker.emit('message', { type: 'authorize', id: 1 })
    if (failure === 'ready-failed') f.worker.emit('message', { type: 'ready' })
    await new Promise(resolve => setImmediate(resolve))
    f.worker.emit('message', { type: 'finished', complete: true, cleanupVerified: failure !== 'unverified-cleanup',
      session: { user: { id: failure === 'wrong-owner' ? 'other' : 'owner' } } })
    f.worker.emit('exit', failure === 'abnormal-exit' ? null : 0, failure === 'abnormal-exit' ? 'SIGKILL' : null)
    await rejected
    if (['authorization-loss', 'ready-failed'].includes(failure)) assert.ok(f.messages.some(message => message.type === 'stop'))
  })
}


test('a stopped failed attempt cannot reuse its preparation capability', async t => {
  const f = await fixture(t)
  const options = { ...f.options, verifyPreparation: async () => true }
  const result = prepareNativeOpeningAuthentication(options, f.dependencies)
  const rejected = assert.rejects(result, /Native authentication incomplete/)
  await f.ready
  f.worker.emit('exit', 1)
  await rejected
  await assert.rejects(prepareNativeOpeningAuthentication(options, f.dependencies), { code: 'EEXIST' })
})
