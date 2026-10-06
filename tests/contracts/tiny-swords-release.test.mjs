import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import test from 'node:test'

test('the built game is one content-versioned release and does not host raw pack directories', async () => {
  const html = await readFile('_site/index.html', 'utf8')
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
  assert.equal(hash.digest('hex'), parent[2], 'changing any parent, iframe or engine byte must change its URL')
  for (const name of ['index.html', 'index.wasm', 'index.pck', 'index.js', 'Cursor_02.png',
    'notices/GODOT-LICENSE.txt', 'notices/GODOT-COPYRIGHT.txt', 'notices/MEDIEVALSHARP-OFL.txt', 'notices/ASSET-PROVENANCE.md']) {
    assert.ok((await stat(`${directory}/${name}`)).size > 0, name)
  }
  await assert.rejects(stat('_site/assets/tiny-swords'), { code: 'ENOENT' })
})
