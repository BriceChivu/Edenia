import { EventEmitter } from 'node:events'
import { runNativeOpeningAuthenticationWorker } from '../../scripts/native-opening-auth-worker.mjs'
import { createNativeOpeningAuthenticationProxy } from '../../scripts/native-opening-auth-proxy.mjs'
runNativeOpeningAuthenticationWorker(process, {
  makeProxy: async config => {
    const proxy = await createNativeOpeningAuthenticationProxy(config)
    process.send({ type: 'test-proxy', port: proxy.port })
    return proxy
  },
  io: { readlink: async () => 'fixture-' + process.pid },
  launch: () => {
    const browser = new EventEmitter()
    browser.pid = process.pid
    browser.kill = () => setImmediate(() => browser.emit('exit', 0))
    return browser
  }
})
