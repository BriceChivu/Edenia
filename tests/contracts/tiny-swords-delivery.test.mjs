import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { prepareTinySwordsDelivery } from '../../scripts/build-tiny-swords-delivery.mjs'

test('game updates reuse the engine URL; engine changes invalidate it', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'edenia-engine-delivery-'))
  const staging = resolve(root, 'staging'), output = resolve(root, 'output')
  await mkdir(resolve(staging, 'notices'), { recursive: true })
  async function prepare(pack, engine) {
    await writeFile(resolve(staging, 'index.pck'), pack)
    await writeFile(resolve(staging, 'index.wasm'), engine)
    await writeFile(resolve(staging, 'index.js'), 'const DOWNLOAD_ATTEMPTS_MAX = 4;\nreturn fetch(file).then(function (response) {\ncontroller.close();\n\t\t\t\t});\nconst cloned = new Response(response.clone().body);')
    await writeFile(resolve(staging, 'index.html'), '<script src="index.js"></script>\nengine.startGame({\n\'onProgress\': function (current, total) {')
    const result = await prepareTinySwordsDelivery(staging, output)
    return { ...result, engineJs: await readFile(resolve(staging, 'index.js'), 'utf8'), html: await readFile(resolve(staging, 'index.html'), 'utf8') }
  }
  try {
    const first = await prepare('first game pack', 'same engine')
    const next = await prepare('updated game pack with more content', 'same engine')
    assert.equal(first.engineHash, next.engineHash)
    assert.equal(first.decoderHash, next.decoderHash)
    assert.notEqual(first.html, next.html)
    assert.match(first.html, /edenia-game-loading-progress/)
    assert.doesNotMatch(first.engineJs, /response\.clone\(\)\.body/)
    assert.match(first.engineJs, /new Response\(response\.body/)
    assert.match(first.html, /edeniaTrackGameStartup\(engine\)/)
    const upgrade = await prepare('updated game pack with more content', 'updated engine')
    assert.notEqual(upgrade.engineHash, next.engineHash)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('engine milestone waits for initialization and reports once across repeated init calls', async () => {
  const messages = []
  const window = { edeniaGameAssets: {} }
  vm.runInNewContext(await readFile('scripts/tiny-swords-asset-loader.js', 'utf8'), {
    window, document: { baseURI: 'http://localhost/game/' },
    URL, parent: { postMessage: message => messages.push(message.type) }, location: { origin: 'http://localhost' }
  })
  let finish
  const initialized = new Promise(resolve => { finish = resolve })
  const engine = { init() { assert.equal(this, engine); return initialized } }
  window.edeniaTrackGameStartup(engine)
  const first = engine.init('index')
  const next = engine.init()
  assert.deepEqual(messages, [])
  finish('initialized')
  assert.equal(await first, 'initialized')
  assert.equal(await next, 'initialized')
  assert.deepEqual(messages, ['edenia-game-engine-initialized'])
})

async function chunkReader(chunks, expectedBytes) {
  const reports = []
  let reads = 0
  const source = (await readFile('scripts/tiny-swords-brotli-worker.js', 'utf8')).replace(/^import .*\n/, '')
  const context = vm.createContext({
    self: {}, Uint8Array, setTimeout, clearTimeout,
    postMessage(message, transfer = []) {
      reports.push(structuredClone(message, { transfer }))
    }
  })
  vm.runInContext(source + '\nglobalThis.configure = (input, bytes) => { reader = input; expectedBytes = bytes }; globalThis.readChunk = readChunk;', context)
  context.configure({ async read() {
    const value = chunks[reads++]
    return value ? { done: false, value } : { done: true }
  } }, expectedBytes)
  return { reports, pull: type => context.readChunk(type), reads: () => reads }
}

test('worker starts compilation immediately, then batches transfers with exact bytes', async () => {
  const original = new Uint8Array(2 * 1024 * 1024 + 17).map((_, i) => i % 251)
  const chunks = Array.from({ length: Math.ceil(original.length / 65536) }, (_, i) => original.slice(i * 65536, (i + 1) * 65536))
  const reader = await chunkReader(chunks, original.length)
  await reader.pull('ready')
  assert.equal(reader.reads(), 1, 'first available chunk must not wait for batching')
  while (reader.reports.at(-1).type !== 'done') await reader.pull('chunk')
  const transferred = reader.reports.filter(report => report.buffer)
  assert.ok(transferred.length <= 6, 'avoid hundreds of worker/main-thread round trips')
  assert.ok(transferred.every(report => report.buffer.byteLength <= 512 * 1024))
  assert.deepEqual(Buffer.concat(transferred.map(report => Buffer.from(report.buffer))), Buffer.from(original))
})

test('worker bounds large native chunks without detaching their unread remainder', async () => {
  const original = new Uint8Array(1024 * 1024 + 7).map((_, i) => i % 239)
  const reader = await chunkReader([original.slice()], original.length)
  await reader.pull('ready')
  assert.ok(reader.reports[0].buffer.byteLength <= 65536)
  while (reader.reports.at(-1).type !== 'done') await reader.pull('chunk')
  assert.deepEqual(Buffer.concat(reader.reports.filter(report => report.buffer).map(report => Buffer.from(report.buffer))), Buffer.from(original))
})

test('worker rejects decoded assets with incorrect lengths', async () => {
  const oversized = await chunkReader([new Uint8Array(12)], 11)
  await assert.rejects(oversized.pull('ready'), /Unexpected decoded/)
  const truncated = await chunkReader([new Uint8Array(10)], 11)
  await truncated.pull('ready')
  await assert.rejects(truncated.pull('chunk'), /Unexpected decoded/)
})
