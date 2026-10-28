import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import test from 'node:test'
import { retainTinySwordsReleases } from '../../scripts/tiny-swords-release-history.mjs'

const digest = value => createHash('sha256').update(value).digest('hex')
const now = Date.UTC(2026, 9, 28)
async function fixture(root, name) {
  const content = { 'index.html': 'html ' + name, 'index.js': 'engine loader', 'index.pck': 'pack ' + name }
  const gameHash = createHash('sha256')
  for (const key of Object.keys(content).sort()) gameHash.update(`${key}\0`).update(content[key])
  const version = gameHash.digest('hex'), engineHash = digest('engine'), decoderHash = digest('worker' + 'decoder')
  const game = resolve(root, 'tiny-swords-game', version), engine = resolve(root, 'tiny-swords-engine', engineHash)
  const decoder = resolve(root, 'tiny-swords-decoder', decoderHash)
  for (const path of [game, engine, decoder]) await mkdir(path, { recursive: true })
  for (const [key, value] of Object.entries(content)) await writeFile(resolve(game, key), value)
  await writeFile(resolve(engine, 'index.wasm'), 'engine')
  for (const [path, value] of [[resolve(game, 'index.pck'), content['index.pck']], [resolve(engine, 'index.wasm'), 'engine']]) {
    await writeFile(path + '.br', brotliCompressSync(Buffer.from(value))); await writeFile(path + '.gz', gzipSync(value))
  }
  await writeFile(resolve(decoder, 'worker.js'), 'worker'); await writeFile(resolve(decoder, 'decoder.wasm'), 'decoder')
  await writeFile(resolve(game, 'release.json'), JSON.stringify({ version, engineHash, decoderHash, compatibility: digest('contract') }))
  await writeFile(resolve(root, 'tiny-swords-current.json'), JSON.stringify({ schema: 1, release: version }))
  return version
}
async function sandbox(run) {
  const root = await mkdtemp(resolve(tmpdir(), 'edenia-game-retention-')), current = resolve(root, 'current'), previous = resolve(root, 'previous')
  try { await run({ root, current, previous }) } finally { await rm(root, { recursive: true, force: true }) }
}

test('complete prior releases survive publication with a six-release and seven-day bound', () => sandbox(async ({ current, previous }) => {
  const latest = await fixture(current, 'current'), old = []
  for (let i = 0; i < 8; i++) old.push({ release: await fixture(previous, `old-${i}`), lastCurrentAt: now - i * 86400000 })
  await writeFile(resolve(previous, 'tiny-swords-current.json'), JSON.stringify({ schema: 1, release: old[0].release }))
  await writeFile(resolve(previous, 'tiny-swords-history.json'), JSON.stringify({ schema: 1, releases: old }))
  const result = await retainTinySwordsReleases(current, previous, { now })
  assert.equal(result.retained, 5); assert.equal((await readdir(resolve(current, 'tiny-swords-game'))).length, 6)
  const history = JSON.parse(await readFile(resolve(current, 'tiny-swords-history.json'), 'utf8'))
  assert.equal(history.releases[0].release, latest)
  assert.deepEqual(history.releases.slice(1).map(x => x.release), old.slice(0, 5).map(x => x.release))
  assert.equal((await readdir(resolve(current, 'tiny-swords-engine'))).length, 1, 'shared engine is copied once')
}))

test('expired releases, future timestamps, and traversal paths are excluded', () => sandbox(async ({ current, previous }) => {
  const latest = await fixture(current, 'current'); const old = await fixture(previous, 'old')
  await writeFile(resolve(previous, 'tiny-swords-current.json'), JSON.stringify({ schema: 1, release: latest }))
  await writeFile(resolve(previous, 'tiny-swords-history.json'), JSON.stringify({ schema: 1, releases: [
    { release: old, lastCurrentAt: now - 8 * 86400000 }, { release: old, lastCurrentAt: now + 1 },
    { release: '../outside', lastCurrentAt: now }
  ] }))
  assert.equal((await retainTinySwordsReleases(current, previous, { now })).retained, 0)
}))

for (const fault of ['game-bytes', 'compressed-variant', 'symlink']) {
  test(`an invalid archive (${fault}) cannot publish a partial or altered prior release`, () => sandbox(async ({ root, current, previous }) => {
    await fixture(current, 'current'); const old = await fixture(previous, 'old')
    const directory = resolve(previous, 'tiny-swords-game', old)
    if (fault === 'game-bytes') await writeFile(resolve(directory, 'index.html'), 'changed')
    if (fault === 'compressed-variant') await writeFile(resolve(directory, 'index.pck.gz'), 'corrupt')
    if (fault === 'symlink') { await writeFile(resolve(root, 'private'), 'PRIVATE'); await symlink(resolve(root, 'private'), resolve(directory, 'link')) }
    await writeFile(resolve(previous, 'tiny-swords-history.json'), JSON.stringify({ schema: 1, releases: [{ release: old, lastCurrentAt: now }] }))
    const result = await retainTinySwordsReleases(current, previous, { now })
    assert.equal(result.retained, 0); assert.deepEqual(result.skipped, [old])
    assert.equal((await readdir(resolve(current, 'tiny-swords-game'))).length, 1)
  }))
}

test('first deployment creates a current inventory without requiring a previous artifact', () => sandbox(async ({ current }) => {
  const latest = await fixture(current, 'current')
  assert.equal((await retainTinySwordsReleases(current, null, { now })).retained, 0)
  assert.deepEqual(JSON.parse(await readFile(resolve(current, 'tiny-swords-history.json'), 'utf8')).releases, [{ release: latest, lastCurrentAt: now }])
  await assert.rejects(retainTinySwordsReleases(current, current), /separate/)
}))

test('the byte budget can exclude an older complete release without damaging the current release', () => sandbox(async ({ current, previous }) => {
  const latest = await fixture(current, 'current'), old = await fixture(previous, 'old')
  await writeFile(resolve(previous, 'tiny-swords-history.json'), JSON.stringify({ schema: 1, releases: [{ release: old, lastCurrentAt: now }] }))
  const initial = await retainTinySwordsReleases(current, null, { now })
  const result = await retainTinySwordsReleases(current, previous, { now, byteLimit: initial.bytes + 1 })
  assert.equal(result.retained, 0); assert.deepEqual(result.skipped, [old])
  assert.deepEqual(await readdir(resolve(current, 'tiny-swords-game')), [latest])
}))
