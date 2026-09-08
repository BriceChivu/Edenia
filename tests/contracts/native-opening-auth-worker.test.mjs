import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { runNativeOpeningAuthenticationWorker } from '../../scripts/native-opening-auth-worker.mjs'

for (const stage of ['read', 'proxy']) for (const signal of ['stop', 'disconnect']) {
  test(`native worker cleans resources created during ${signal} at ${stage}`, async () => {
    const channel = new EventEmitter(), messages = [], events = []
    channel.connected = true
    channel.send = (message, callback) => { messages.push(message); callback?.() }
    channel.disconnect = () => { channel.connected = false; channel.emit('disconnect') }
    let release, entered
    const barrier = new Promise(resolve => { release = resolve })
    const reached = new Promise(resolve => { entered = resolve })
    const worker = runNativeOpeningAuthenticationWorker(channel, {
      makeStore: () => ({ requireLease() {}, state: () => ({ candidate: 'candidate', gate: 'off' }), close: () => events.push('store-closed') }),
      io: { readFile: async () => { if (stage === 'read') { entered(); await barrier } return Buffer.from('fixture') }, rm: async () => events.push('profile-removed') },
      makeProxy: async () => { entered(); if (stage === 'proxy') await barrier; return { seal: () => events.push('sealed'), close: async () => events.push('proxy-closed'), stats: {}, port: 1234 } },
      launch: () => { throw new Error('Browser must not launch after stop') }
    })
    channel.emit('message', { type: 'start', config: { candidate: 'candidate', executor: 'executor', profileDirectory: '/synthetic/profile', certificates: [{ origin: 'https://synthetic.invalid', certificateFile: 'cert', keyFile: 'key' }] } })
    await reached
    if (signal === 'stop') channel.emit('message', { type: 'stop' })
    else { channel.connected = false; channel.emit('disconnect') }
    release()
    await new Promise(resolve => setImmediate(resolve))
    await worker.stop()
    assert.ok(events.includes('store-closed'))
    assert.ok(events.includes('profile-removed'))
    if (stage === 'proxy') assert.ok(events.includes('proxy-closed'))
    if (signal === 'stop') assert.equal(messages.at(-1).cleanupVerified, true)
  })
}

test('owned browser lock never announces UI readiness without document evidence', async () => {
  const channel = new EventEmitter(), browser = new EventEmitter(), messages = []
  channel.connected = true
  channel.send = (message, callback) => {
    messages.push(message)
    if (message.type === 'authorize') queueMicrotask(() => channel.emit('message', { type: 'permission', id: message.id, allowed: true }))
    callback?.()
  }
  channel.disconnect = () => { channel.connected = false; channel.emit('disconnect') }
  browser.pid = 1234; browser.kill = () => browser.emit('exit', 0)
  const worker = runNativeOpeningAuthenticationWorker(channel, {
    makeStore: () => ({ requireLease() {}, state: () => ({ candidate: 'fixture', gate: 'off' }), close() {} }),
    io: { readlink: async () => 'fixture-1234', rm: async () => {} },
    makeProxy: async () => ({ port: 12345, stats: {}, seal() {}, close: async () => {} }), launch: () => browser
  })
  try {
    channel.emit('message', { type: 'start', config: { candidate: 'fixture', certificates: [], profileDirectory: '/synthetic/never-created', applicationOrigin: 'https://app.example.invalid', deadlineMs: 10000 } })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(messages.some(message => message.type === 'ready'), false)
    assert.equal(messages.some(message => message.type === 'progress' && message.diagnostic.browserStarted === true && message.diagnostic.documentDelivered === false), true)
  } finally { await worker.stop() }
})
