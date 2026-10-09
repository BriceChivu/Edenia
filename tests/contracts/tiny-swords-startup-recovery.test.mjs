import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const workerSource = (await readFile('scripts/tiny-swords-brotli-worker.js', 'utf8')).replace(/^import .*\n/, '')
function timers() {
  const pending = new Map(); let next = 0; let now = 0
  return {
    setTimeout(fn, ms) { pending.set(++next, { fn, at: now + ms }); return next },
    clearTimeout(id) { pending.delete(id) },
    fire() { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(({ fn }) => fn()) },
    advance(ms) {
      now += ms
      for (const [id, callback] of [...pending]) {
        if (callback.at <= now) { pending.delete(id); callback.fn() }
      }
    }
  }
}
const tick = async () => { for (let i = 0; i < 12; i++) await new Promise(setImmediate) }

for (const operation of ['open', 'match', 'put', 'keys', 'delete']) {
  test(`a stalled engine cache ${operation} cannot prevent decoded stream completion`, async () => {
    const clock = timers(), messages = []
    const cache = { match: async () => undefined, put: async () => {}, keys: async () => [{ url: 'old-engine' }], delete: async () => true }
    if (operation !== 'open') cache[operation] = () => new Promise(() => {})
    const context = { self: {}, caches: { open: operation === 'open' ? () => new Promise(() => {}) : async () => cache },
      postMessage: value => value.type !== 'progress' && messages.push(value.type), fetch: async () => new Response(new Uint8Array([1, 2, 3])),
      DecompressionStream: class { constructor() { return new TransformStream() } }, TransformStream, Response, Uint8Array, ...clock }
    vm.runInNewContext(workerSource, context)
    const start = context.self.onmessage({ data: { type: 'start', bytes: 3, url: 'https://example.invalid/engine.br', cacheEngine: true } })
    await tick(); clock.fire(); await tick()
    assert.deepEqual(messages, ['ready'])
    const pull = context.self.onmessage({ data: { type: 'pull' } })
    await tick(); clock.fire(); await tick()
    assert.deepEqual(messages, ['ready', 'done'])
    await start; await pull
  })
}

async function loaderHarness(mode, { fallbackStalls = false, fetchStalls = false } = {}) {
  const clock = timers(), workers = [], fetches = [], aborted = [], failures = []
  class Worker {
    constructor() { workers.push(this) }
    terminate() { this.terminated = true }
    postMessage(message) {
      if (mode === 'silent' || mode === 'fallback-stalls') return
      if (message.type === 'start') queueMicrotask(() => this.onmessage({ data: { type: 'ready', buffer: new Uint8Array([1, 2]).buffer } }))
      else if (mode === 'corrupt') queueMicrotask(() => this.onmessage({ data: { type: 'error', message: 'Invalid Brotli data' } }))
      else if (mode === 'normal') queueMicrotask(() => this.onmessage({ data: { type: 'done' } }))
    }
  }
  const context = { window: { edeniaGameAssets: { worker: 'worker.js', decoder: 'decoder.wasm', files: { 'index.wasm': { url: 'index.wasm', bytes: mode === 'normal' ? 2 : 4, type: 'application/wasm' } } } },
    document: { baseURI: 'https://example.invalid/game/' }, parent: { postMessage(message) { failures.push(message.type) } }, location: { origin: 'https://example.invalid' },
    Worker, URL, ReadableStream, Response, Uint8Array, AbortController, ...clock,
    fetch: async (url, options) => {
      fetches.push(String(url)); options?.signal?.addEventListener('abort', () => aborted.push(true))
      if (fetchStalls) return new Promise(() => {})
      if (fallbackStalls) return new Response(new ReadableStream({ pull() { return new Promise(() => {}) } }))
      return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'Content-Type': 'application/wasm' } })
    } }
  vm.runInNewContext(await readFile('scripts/tiny-swords-asset-loader.js', 'utf8'), context)
  return { clock, workers, fetches, aborted, failures, load: () => context.window.edeniaFetchGameAsset('index.wasm') }
}

test('a silent worker falls back once to ordinary delivery', async () => {
  const h = await loaderHarness('silent'), pending = h.load()
  await tick(); h.clock.fire(); await tick()
  const response = await pending
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3, 4])
  assert.equal(h.fetches.length, 1); assert.equal(h.workers[0].terminated, true)
})

test('compressed-byte progress extends the deadline for an active download', async () => {
  const h = await loaderHarness('silent'), pending = h.load()
  await tick(); h.clock.advance(14000)
  h.workers[0].onmessage({ data: { type: 'progress' } })
  h.clock.advance(14000); await tick()
  assert.equal(h.fetches.length, 0, 'continued input must not trigger fallback')
  h.clock.advance(1000); await tick()
  assert.deepEqual([...new Uint8Array(await (await pending).arrayBuffer())], [1, 2, 3, 4])
  assert.equal(h.fetches.length, 1)
})

test('a worker stalled after its first chunk resumes without duplicating engine bytes', async () => {
  const h = await loaderHarness('partial'), response = await h.load(), pending = response.arrayBuffer()
  await tick(); h.clock.fire(); await tick()
  assert.deepEqual([...new Uint8Array(await pending)], [1, 2, 3, 4])
  assert.equal(h.fetches.length, 1); assert.equal(h.workers[0].terminated, true)
})

test('invalid compressed bytes fail instead of splicing in a different asset', async () => {
  const h = await loaderHarness('corrupt'), response = await h.load()
  await assert.rejects(response.arrayBuffer(), /Invalid Brotli data/)
  assert.equal(h.fetches.length, 0)
})

test('ordinary delivery also fails promptly when its stream stalls', async () => {
  const h = await loaderHarness('partial', { fallbackStalls: true }), response = await h.load()
  const result = response.arrayBuffer().then(() => 'accepted', error => error.message)
  await tick(); h.clock.fire(); await tick(); h.clock.fire(); await tick()
  assert.match(await result, /timed out/)
  assert.equal(h.fetches.length, 1); assert.equal(h.aborted.length, 1)
  assert.deepEqual(h.failures, ['edenia-game-startup-failed'])
})

test('a fallback with no response headers reports failure before Godot can retry', async () => {
  const h = await loaderHarness('silent', { fetchStalls: true })
  const result = h.load().then(() => 'accepted', error => error.message)
  await tick(); h.clock.fire(); await tick(); h.clock.fire(); await tick()
  assert.match(await result, /timed out/)
  assert.deepEqual(h.failures, ['edenia-game-startup-failed'])
  assert.equal(h.aborted.length, 1)
  await assert.rejects(h.load(), /Game asset startup failed/)
  assert.equal(h.fetches.length, 1, 'Godot retries cannot restart a retired attempt')
})

test('canceling a compressed stream terminates its worker', async () => {
  const h = await loaderHarness('normal'), response = await h.load()
  await response.body.cancel()
  assert.equal(h.workers[0].terminated, true)
})
