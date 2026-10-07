import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import test from 'node:test'
import { brotliDecompressSync } from 'node:zlib'

import { readBuiltExperience } from '../support/built-experience.mjs'

test('the built game is one content-versioned release and does not host raw pack directories', async () => {
  const html = await readBuiltExperience()
  const parent = html.match(/src="(tiny-swords-game\/([a-f0-9]{64})\/parent.js)" defer/)
  assert.ok(parent, 'normal builds must retain the integration')
  assert.deepEqual(await readdir('_site/tiny-swords-game'), [parent[2]])
  const directory = `_site/tiny-swords-game/${parent[2]}`
  const manifest = JSON.parse(await readFile(`${directory}/release.json`, 'utf8'))
  assert.equal(manifest.version, parent[2])
  assert.equal(manifest.godotVersion, '4.7.2')
  // Recompute from the delivered files, excluding only derivative variants and metadata.
  const hash = createHash('sha256')
  async function visit(path, prefix = '') {
    for (const name of (await readdir(path)).sort()) {
      if (name === 'release.json' || name.endsWith('.br') || name.endsWith('.gz')) continue
      if ((await stat(`${path}/${name}`)).isDirectory()) await visit(`${path}/${name}`, `${prefix}${name}/`)
      else { hash.update(`${prefix}${name}\0`); hash.update(await readFile(`${path}/${name}`)) }
    }
  }
  await visit(directory)
  assert.equal(hash.digest('hex'), parent[2], 'changing game bytes or an engine reference must change the release URL')
  const engineDirectory = `_site/tiny-swords-engine/${manifest.engineHash}`
  const engine = await readFile(`${engineDirectory}/index.wasm`)
  assert.equal(createHash('sha256').update(engine).digest('hex'), manifest.engineHash)
  assert.equal(engine.length, manifest.engineBytes)
  assert.deepEqual(brotliDecompressSync(await readFile(`${engineDirectory}/index.wasm.br`)), engine)
  assert.ok((await stat(`${engineDirectory}/index.wasm.br`)).size < (await stat(`${engineDirectory}/index.wasm.gz`)).size)
  assert.deepEqual(brotliDecompressSync(await readFile(`${directory}/index.pck.br`)), await readFile(`${directory}/index.pck`))
  await assert.rejects(stat(`${directory}/index.wasm`), { code: 'ENOENT' })
  for (const name of ['index.html', 'index.pck', 'index.js', 'asset-loader.js', 'Cursor_02.png',
    'notices/GODOT-LICENSE.txt', 'notices/GODOT-COPYRIGHT.txt', 'notices/MEDIEVALSHARP-OFL.txt', 'notices/ASSET-PROVENANCE.md']) {
    assert.ok((await stat(`${directory}/${name}`)).size > 0, name)
  }
  assert.ok((await stat(`${directory}/notices/BROTLI-DEC-WASM-MIT.txt`)).size > 0)
  const decoderDirectory = `_site/tiny-swords-decoder/${manifest.decoderHash}`
  assert.equal(createHash('sha256').update(Buffer.concat([
    await readFile(`${decoderDirectory}/worker.js`), await readFile(`${decoderDirectory}/decoder.wasm`)
  ])).digest('hex'), manifest.decoderHash)
  await assert.rejects(stat('_site/assets/tiny-swords'), { code: 'ENOENT' })
})
