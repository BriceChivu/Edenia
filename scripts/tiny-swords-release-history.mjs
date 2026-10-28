import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'

const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const maxAge = 7 * 86400000, maxReleases = 6, maxBytes = 192 * 1024 * 1024

async function files(directory, prefix = '') {
  const root = await lstat(directory)
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Invalid game archive directory')
  const result = []
  for (const name of (await readdir(directory)).sort()) {
    const path = resolve(directory, name), stat = await lstat(path)
    if (stat.isSymbolicLink()) throw new Error('Game archives cannot contain symbolic links')
    if (stat.isDirectory()) result.push(...await files(path, `${prefix}${name}/`))
    else if (stat.isFile()) result.push({ path, name: prefix + name, bytes: stat.size })
    else throw new Error('Unexpected game archive entry')
  }
  return result
}
async function verify(root, version) {
  for (const name of ['tiny-swords-game', 'tiny-swords-engine', 'tiny-swords-decoder']) {
    const directory = await lstat(resolve(root, name))
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Invalid game archive root')
  }
  const directory = resolve(root, 'tiny-swords-game', version)
  const entries = await files(directory)
  const manifest = JSON.parse(await readFile(resolve(directory, 'release.json'), 'utf8'))
  const legacy = manifest.compatibility === undefined && manifest.godotVersion === '4.7.2'
  if (manifest.version !== version || !hash(manifest.engineHash) || !hash(manifest.decoderHash)
    || (!legacy && !hash(manifest.compatibility))) throw new Error('Invalid retained game manifest')
  const digest = createHash('sha256')
  for (const file of entries) {
    if (file.name === 'release.json' || /\.(br|gz)$/.test(file.name)) continue
    digest.update(`${file.name}\0`); digest.update(await readFile(file.path))
  }
  if (digest.digest('hex') !== version) throw new Error('Retained game bytes do not match their release')
  const engineDir = resolve(root, 'tiny-swords-engine', manifest.engineHash)
  await files(engineDir)
  const engine = await readFile(resolve(engineDir, 'index.wasm'))
  if (createHash('sha256').update(engine).digest('hex') !== manifest.engineHash) throw new Error('Invalid retained engine')
  const decoderDir = resolve(root, 'tiny-swords-decoder', manifest.decoderHash)
  await files(decoderDir)
  const decoder = createHash('sha256').update(await readFile(resolve(decoderDir, 'worker.js')))
    .update(await readFile(resolve(decoderDir, 'decoder.wasm'))).digest('hex')
  if (decoder !== manifest.decoderHash) throw new Error('Invalid retained decoder')
  for (const path of [resolve(engineDir, 'index.wasm'), resolve(directory, 'index.pck')]) {
    const original = await readFile(path)
    if (!original.equals(brotliDecompressSync(await readFile(path + '.br'), { maxOutputLength: original.length }))
      || !original.equals(gunzipSync(await readFile(path + '.gz'), { maxOutputLength: original.length }))) throw new Error('Invalid retained delivery variant')
  }
  return { manifest, directories: [directory, engineDir, decoderDir] }
}

// Build/deployment work only. Published history contains disposable engine/game
// files, never learner profiles. Runtime startup does not fetch this inventory.
export async function retainTinySwordsReleases(output, previous = null, { now = Date.now(), byteLimit = maxBytes } = {}) {
  output = resolve(output)
  if (previous && resolve(previous) === output) throw new Error('Previous game archive must be separate from output')
  const current = JSON.parse(await readFile(resolve(output, 'tiny-swords-current.json'), 'utf8'))
  if (current.schema !== 1 || !hash(current.release)) throw new Error('Invalid current game release')
  const kept = [{ release: current.release, lastCurrentAt: now }], skipped = []
  let bytes = 0
  for (const directory of ['tiny-swords-game', 'tiny-swords-engine', 'tiny-swords-decoder']) {
    bytes += (await files(resolve(output, directory))).reduce((sum, f) => sum + f.bytes, 0)
  }
  if (previous) {
    let history
    try {
      const data = await readFile(resolve(previous, 'tiny-swords-history.json'), 'utf8')
      if (data.length > 16384) throw new Error('Oversized game archive history')
      history = JSON.parse(data)
    } catch { history = null }
    const candidates = history?.schema === 1 && Array.isArray(history.releases)
      ? history.releases.slice(0, 32).filter(item => item && hash(item.release) && Number.isFinite(item.lastCurrentAt)) : []
    // The previous deployment stayed current until this publication, even if
    // that deployment happened days ago. Its support window starts now.
    let previousCurrentKnown = false
    try {
      const previousCurrent = JSON.parse(await readFile(resolve(previous, 'tiny-swords-current.json'), 'utf8'))
      if (previousCurrent.schema === 1 && hash(previousCurrent.release)) {
        candidates.push({ release: previousCurrent.release, lastCurrentAt: now }); previousCurrentKnown = true
      }
    } catch {}
    // Before the controller/manifest existed, Pages published one current game.
    // Preserve that verified immutable release for already-open old parents.
    if (!previousCurrentKnown && !history) {
      try {
        const releases = (await readdir(resolve(previous, 'tiny-swords-game'))).filter(hash)
        if (releases.length === 1) candidates.push({ release: releases[0], lastCurrentAt: now })
      } catch {}
    }
    candidates.sort((a, b) => b.lastCurrentAt - a.lastCurrentAt)
    const seen = new Set()
    for (const item of candidates) {
      if (kept.length >= maxReleases) break
      if (!hash(item?.release) || seen.has(item.release) || kept.some(x => x.release === item.release)
        || !Number.isFinite(item.lastCurrentAt) || item.lastCurrentAt > now || item.lastCurrentAt < now - maxAge) continue
      seen.add(item.release)
      const addedPaths = []
      try {
        const verified = await verify(previous, item.release)
        const copies = []
        let added = 0
        for (const source of verified.directories) {
          const destination = resolve(output, source.slice(resolve(previous).length + 1))
          try { await lstat(destination); continue } catch {}
          added += (await files(source)).reduce((sum, f) => sum + f.bytes, 0)
          copies.push({ source, destination })
        }
        if (bytes + added > Math.min(maxBytes, byteLimit)) { skipped.push(item.release); continue }
        for (const { source, destination } of copies) {
          await mkdir(resolve(destination, '..'), { recursive: true })
          addedPaths.push(destination)
          await cp(source, destination, { recursive: true, errorOnExist: true, force: false })
        }
        bytes += added; kept.push({ release: item.release, lastCurrentAt: item.lastCurrentAt })
      } catch {
        for (const path of addedPaths) await rm(path, { recursive: true, force: true })
        skipped.push(item.release)
      }
    }
  }
  await writeFile(resolve(output, 'tiny-swords-history.json'), JSON.stringify({ schema: 1, releases: kept }, null, 2) + '\n')
  return { retained: kept.length - 1, bytes, skipped }
}
