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
