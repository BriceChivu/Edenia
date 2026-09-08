import { sanitizeNativeAuthenticationDiagnostic } from './native-opening-auth-diagnostics.mjs'
import { readFile, rm, readlink } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CanaryExecutionStore } from './canary-execution-store.mjs'
import { createNativeOpeningAuthenticationProxy } from './native-opening-auth-proxy.mjs'

// Private IPC only. This process never acquires/initializes a lease or prints
// request bodies, URLs, sessions, keys, profile paths or exception strings.
export function runNativeOpeningAuthenticationWorker(channel = process, dependencies = {}) {
  const io = { readFile, rm, readlink, ...dependencies.io }
  const makeStore = dependencies.makeStore || (path => new CanaryExecutionStore(path))
  const makeProxy = dependencies.makeProxy || createNativeOpeningAuthenticationProxy
  const launch = dependencies.launch || spawn
  let initialization = Promise.resolve(), cleanupPromise = null
  let proxy, browser, store, checkTimer, config, exiting = false, browserExited = false
  let diagnostic = sanitizeNativeAuthenticationDiagnostic()
  const progress = update => {
    diagnostic = sanitizeNativeAuthenticationDiagnostic({ ...diagnostic, ...update,
      browserStarted: diagnostic.browserStarted || update?.browserStarted,
      failure: diagnostic.failure || update?.failure })
    // Diagnostics must not interrupt containment when IPC closes concurrently.
    try { if (channel.connected) channel.send({ type: 'progress', diagnostic }, () => {}) } catch {}
  }
  let sequence = 0
  const permissions = new Map()
  function requireLease() {
    if (!store || !config || exiting) throw new Error('Native worker unavailable')
    store.requireLease(config.executor, Date.now())
    const state = store.state()
    if (state.candidate !== config.candidate || state.gate !== 'off') throw new Error('Native execution changed')
  }
  async function cleanup() {
    if (cleanupPromise) return cleanupPromise
    exiting = true; clearInterval(checkTimer); proxy?.seal()
    cleanupPromise = (async () => {
    for (const value of permissions.values()) { clearTimeout(value.timer); value.resolve(false) }
    permissions.clear()
    await initialization.catch(() => {})
    clearInterval(checkTimer); proxy?.seal()
    let stopped = !browser || browserExited
    if (browser && !browserExited) {
      browser.kill('SIGTERM')
      for (let i = 0; i < 100 && !browserExited; i++) await new Promise(resolve => setTimeout(resolve, 100))
      if (!browserExited) {
        browser.kill('SIGKILL')
        for (let i = 0; i < 50 && !browserExited; i++) await new Promise(resolve => setTimeout(resolve, 100))
      }
      stopped = browserExited
    }
    await proxy?.close()
    store?.close()
    if (stopped && config?.profileDirectory) await io.rm(config.profileDirectory, { recursive: true, force: true })
    if (!stopped) throw new Error('Native browser exit is unverified')
    })()
    return cleanupPromise
  }
  async function finish(session = null, failure = null) {
    if (cleanupPromise) return
    try {
      if (failure) progress({ failure })
      await cleanup()
      if (channel.connected) channel.send({ type: 'finished', complete: Boolean(session), cleanupVerified: true, session, diagnostic }, () => channel.disconnect())
    } catch { diagnostic = sanitizeNativeAuthenticationDiagnostic({ ...diagnostic, failure: diagnostic.failure || 'cleanup-failed' }); if (channel.connected) channel.send({ type: 'finished', complete: false, cleanupVerified: false, diagnostic }, () => channel.disconnect()) }
  }
  const authorize = async kind => {
    requireLease()
    if (!channel.connected) return false
    const id = ++sequence
    const allowed = await new Promise(resolve => {
      const timer = setTimeout(() => { permissions.delete(id); resolve(false) }, 10000)
      permissions.set(id, { timer, resolve }); channel.send({ type: 'authorize', id, kind })
    })
    requireLease()
    return allowed === true
  }
  async function initialize(value) {
      if (exiting) throw new Error('Native initialization stopped')
      config = value
      store = makeStore(config.storePath)
      requireLease()
      const certificates = {}
      for (const item of config.certificates) {
        certificates[item.origin] = { cert: await io.readFile(item.certificateFile), key: await io.readFile(item.keyFile), sha256: item.sha256 }
        requireLease()
      }
      proxy = await makeProxy({ ...config, certificates, authorize, onProgress: progress,
        onSession: session => { requireLease(); queueMicrotask(() => { void finish(session) }) } })
      requireLease()
      checkTimer = setInterval(() => { try { requireLease(); if (proxy.stats.sealed) void finish() } catch { void finish(null, 'lease-invalid') } }, 100)
      if (!await authorize('native-browser-start')) throw new Error('Native browser start denied')
      if (exiting) return
      browser = launch('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
        '--user-data-dir=' + config.profileDirectory, '--no-first-run', '--no-default-browser-check',
        '--proxy-server=http://127.0.0.1:' + proxy.port, '--proxy-bypass-list=<-loopback>',
        '--disable-quic', '--webrtc-ip-handling-policy=disable_non_proxied_udp',
        config.applicationOrigin + '/?internal_test=1'
      ], { stdio: 'ignore' })
      browser.once('exit', () => { browserExited = true; if (!exiting) void finish(null, 'browser-exit') })
      browser.once('error', () => { browserExited = true; if (!exiting) void finish(null, 'browser-start') })
      let ready = false
      for (let i = 0; i < 100 && !exiting && !browserExited; i++) {
        try { ready = Number((await io.readlink(join(config.profileDirectory, 'SingletonLock'))).split('-').at(-1)) === browser.pid } catch {}
        if (ready) break
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      if (!ready || exiting) { progress({ failure: 'browser-lock' }); throw new Error('Native browser readiness failed') }
      progress({ browserStarted: true })
      setTimeout(() => { void finish(null, diagnostic.documentDelivered ? 'deadline' : 'document-not-delivered') }, config.deadlineMs).unref()
  }
  channel.on('message', message => {
    if (message?.type === 'permission') {
      const pending = permissions.get(message.id)
      if (pending) { permissions.delete(message.id); clearTimeout(pending.timer); pending.resolve(message.allowed === true) }
      return
    }
    if (message?.type === 'stop') { void finish(); return }
    if (message?.type !== 'start' || config || exiting) { void finish(); return }
    initialization = initialize(message.config)
    void initialization.catch(() => { void finish(null, 'worker-initialization') })
  })
  channel.on('disconnect', () => { void finish() })
  channel.on('SIGINT', () => { void finish() })
  channel.on('SIGTERM', () => { void finish() })
  return { stop: finish }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runNativeOpeningAuthenticationWorker()
