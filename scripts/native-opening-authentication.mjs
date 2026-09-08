import { fork } from 'node:child_process'
import { readFile, realpath, lstat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, isAbsolute, relative } from 'node:path'

// A trusted manifest alone is not native acceptance. The coordinator supplies
// the exact reviewed preparation verifier; default denial prevents selecting
// this new path until native egress and trust evidence have both been audited.
export async function prepareNativeOpeningAuthentication({ applicationOrigin = 'https://www.edenia.study', providerOrigin,
  expectedOwner, expectedEmail, verifyGateOff, onReady = () => {}, timeoutMs = 300000,
  native, lease, expectedRuntimeHash, assetIdentity, verifyPreparation = async () => false }, dependencies = {}) {
  if (typeof verifyGateOff !== 'function' || !native || !lease || !isAbsolute(native.manifestFile || '')
    || !isAbsolute(native.preparationRoot || '') || !/^[a-f0-9]{64}$/u.test(native.manifestSha256 || '')
    || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) throw new Error('Native authentication preparation required')
  const bytes = await readFile(native.manifestFile)
  if (createHash('sha256').update(bytes).digest('hex') !== native.manifestSha256) throw new Error('Native preparation identity changed')
  const manifest = JSON.parse(bytes)
  const root = await realpath(native.preparationRoot)
  const profileDirectory = await realpath(manifest.profileDirectory)
  const profileRelative = relative(root, profileDirectory)
  if (!profileRelative || profileRelative.startsWith('..') || isAbsolute(profileRelative)
    || (await lstat(manifest.profileDirectory)).isSymbolicLink() || manifest.candidate !== lease.candidate
    || manifest.procedure !== 'native-opening-authentication-v1' || manifest.authenticationMethod !== 'email-code'
    || manifest.profileContainsOnlyReviewedPreparation !== true || !Array.isArray(manifest.certificates)
    || !await verifyPreparation(manifest)) throw new Error('Native preparation has not passed review')
  const origins = [applicationOrigin, providerOrigin, 'https://challenges.cloudflare.com']
  if (manifest.certificates.length !== origins.length || new Set(manifest.certificates.map(row => row.origin)).size !== origins.length
    || manifest.certificates.some(row => !origins.includes(row.origin))) throw new Error('Native certificate origin mismatch')
  for (const certificate of manifest.certificates) for (const field of ['certificateFile', 'keyFile']) {
    const path = await realpath(certificate[field]), child = relative(root, path), stat = await lstat(certificate[field])
    if (!child || child.startsWith('..') || isAbsolute(child) || stat.isSymbolicLink() || !stat.isFile() || stat.size > 32768 || stat.size === 0 || (field === 'keyFile' && (stat.mode & 0o077) !== 0)) throw new Error('Native certificate escaped preparation')
  }
  try { await lstat(join(profileDirectory, 'SingletonLock')); throw new Error('Native preparation browser must be stopped') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  await verifyGateOff()
  // A failed or interrupted attempt must be reconciled, never replayed with
  // the same profile/keys and reviewed acceptance capability.
  await writeFile(join(root, 'native-authentication-used'), native.manifestSha256, { flag: 'wx', mode: 0o600 })
  const worker = (dependencies.fork || fork)(new URL('./native-opening-auth-worker.mjs', import.meta.url), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  return await new Promise((resolve, reject) => {
    let complete = false, finished = null, escalation, revoked = false
    const clearTimers = () => { clearTimeout(timer); clearTimeout(escalation) }
    const fail = () => { if (!complete) { complete = true; clearTimers(); reject(new Error('Native authentication incomplete; inspect sanitized containment result')) } }
    const send = message => {
      try { if (worker.connected) { worker.send(message); return true } } catch {}
      return false
    }
    const stop = () => {
      revoked = true; finished = null
      send({ type: 'stop' })
      if (escalation) return
      escalation = setTimeout(() => {
        // Killing the proxy worker seals its sockets, but does not prove that
        // Chrome exited. Never return a session or claim verified cleanup.
        worker.kill('SIGKILL')
        fail()
      }, 20000)
    }
    const timer = setTimeout(stop, timeoutMs + 15000)
    worker.on('message', async message => {
      if (complete) return
      try {
        if (message?.type === 'authorize') {
          let allowed = false
          try { await verifyGateOff(); allowed = !revoked && !complete } catch {}
          if (!allowed && !complete) stop()
          if (!complete && !send({ type: 'permission', id: message.id, allowed })) stop()
        } else if (message?.type === 'ready') await onReady()
        else if (message?.type === 'finished' && !revoked) finished = message
      } catch { if (!complete) stop() }
    })
    worker.once('exit', (code, signal) => {
      if (complete) return
      if (!revoked && code === 0 && !signal && finished?.complete === true && finished.cleanupVerified === true && finished.session?.user?.id === expectedOwner) {
        complete = true; clearTimers(); resolve(finished.session)
      } else fail()
    })
    worker.once('error', () => { if (!complete) stop() })
    if (!send({ type: 'start', config: { applicationOrigin, providerOrigin, expectedEmail, expectedOwner,
      profileDirectory, certificates: manifest.certificates, expectedRuntimeHash, assetIdentity, deadlineMs: timeoutMs,
      storePath: join(lease.workdir, '.cache/canary-execution/packet-1.sqlite'), candidate: lease.candidate, executor: lease.executor } })) stop()
  })
}
