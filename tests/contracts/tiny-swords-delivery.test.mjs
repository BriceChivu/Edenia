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
    await writeFile(resolve(staging, 'index.js'), 'return fetch(file).then(function (response) {\ncontroller.close();\n\t\t\t\t});')
    await writeFile(resolve(staging, 'index.html'), '<script src="index.js"></script>\nengine.startGame({\n\'onProgress\': function (current, total) {')
    const result = await prepareTinySwordsDelivery(staging, output)
    return { ...result, html: await readFile(resolve(staging, 'index.html'), 'utf8') }
  }
  try {
    const first = await prepare('first game pack', 'same engine')
    const next = await prepare('updated game pack with more content', 'same engine')
    assert.equal(first.engineHash, next.engineHash)
    assert.equal(first.decoderHash, next.decoderHash)
    assert.notEqual(first.html, next.html)
    assert.match(first.html, /edenia-game-loading-progress/)
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
    parent: { postMessage: message => messages.push(message.type) }, location: { origin: 'http://localhost' }
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
