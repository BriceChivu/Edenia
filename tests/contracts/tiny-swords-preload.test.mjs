import assert from 'node:assert/strict'
import { MessageChannel } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

async function preload({ cached = false, failingFetch = false, failingCache = false } = {}) {
  const url = 'http://localhost/tiny-swords-engine/hash/index.wasm.br'
  const original = new Uint8Array(512 * 1024 + 7).map((_, i) => i % 251)
  const requests = []
  let canceled = false
  const response = () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(original.slice()); },
    pull(controller) { controller.close() },
    cancel() { canceled = true }
  }))
  const window = { edeniaTinySwordsEnabled: true, addEventListener() {} }
  const parent = vm.createContext({ window, MessageChannel, Worker: class {}, URL, AbortController, setTimeout, clearTimeout,
    document: { currentScript: { src: 'http://localhost/game/parent.js' }, readyState: 'loading',
      documentElement: { classList: { add() {} } } },
    caches: { open: async () => { if (failingCache) throw new Error('Storage unavailable'); return { match: async () => cached ? response() : undefined } } },
    fetch: async request => { requests.push(request); if (failingFetch) throw new Error('Network unavailable'); return response() }
  })
  vm.runInContext((await readFile('scripts/tiny-swords-xp-parent.js', 'utf8'))
    .replace('const tinySwordsPreloadAssets = []', `const tinySwordsPreloadAssets = [${JSON.stringify(url)}]`), parent)
  const source = (await readFile('scripts/tiny-swords-brotli-worker.js', 'utf8')).replace(/^import .*\n/, '')
  const worker = vm.createContext({ self: {}, Response, ReadableStream, Uint8Array })
  vm.runInContext(source, worker)
  const handle = window.edeniaTakeTinySwordsPreload(url)
  assert.equal(window.edeniaTakeTinySwordsPreload(url), null, 'an immutable response can be claimed only once')
  assert.equal(window.edeniaTakeTinySwordsPreload('http://localhost/profile'), null, 'only build-supplied static URLs can be claimed')
  return { original, requests, handle, response: worker.preloadedResponse(handle.port), canceled: () => canceled }
}

for (const cached of [false, true]) test(`early asset bytes pass to the worker exactly once in bounded chunks (cached ${cached})`, async () => {
  const p = await preload({ cached })
  try {
    const received = await p.response
    assert.equal(received.cached, cached)
    const chunks = []
    for await (const chunk of received.response.body) {
      assert.ok(chunk.byteLength <= 64 * 1024)
      chunks.push(Buffer.from(chunk))
    }
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(p.original))
    assert.equal(p.requests.length, cached ? 0 : 1)
  } finally { p.handle.cancel() }
})

test('unavailable cache storage leaves the early download usable', async () => {
  const p = await preload({ failingCache: true })
  try {
    const received = await p.response
    assert.equal((await received.response.arrayBuffer()).byteLength, p.original.byteLength)
    assert.equal(p.requests.length, 1)
  } finally { p.handle.cancel() }
})

test('a failed early download rejects the compressed path so ordinary delivery can recover', async () => {
  const p = await preload({ failingFetch: true })
  try { await assert.rejects(p.response, /Asset preload unavailable/) }
  finally { p.handle.cancel() }
})
