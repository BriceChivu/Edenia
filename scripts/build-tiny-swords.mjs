import { cp, mkdir, readFile, readdir, writeFile, rm, rename, access, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { brotliCompressSync, gzipSync, constants } from 'node:zlib'
import { prepareTinySwordsDelivery } from './build-tiny-swords-delivery.mjs'

export const GODOT_VERSION = '4.7.2'
export const GODOT_BUILD = '4.7.2.stable.official.ed1daf0bf'
export const GAME_DIRECTORY = 'tiny-swords-game'

async function godotExecutable() {
  if (process.env.GODOT_BIN) return process.env.GODOT_BIN
  const managed = resolve('.cache/godot/Godot_v4.7.2-stable_linux.x86_64')
  try { await access(managed); return managed } catch {}
  if (spawnSync('godot', ['--version'], { encoding: 'utf8' }).status === 0) return 'godot'
  // Convenience for existing local installations; CI uses the pinned toolchain.
  if (process.platform === 'darwin') return '/Applications/Godot.app/Contents/MacOS/Godot'
  throw new Error('Install the pinned Godot toolchain with npm run setup:godot, or set GODOT_BIN')
}

export async function buildTinySwords(outputDir) {
  const source = resolve('godot/tiny-swords')
  const project = resolve('.cache/tiny-swords-xp/project')
  const staging = resolve('.cache/tiny-swords-xp/export')
  const godot = await godotExecutable()
  const version = spawnSync(godot, ['--version'], { encoding: 'utf8' })
  if (version.error || version.status !== 0 || version.stdout.trim() !== GODOT_BUILD) {
    throw new Error(`Tiny Swords requires official Godot ${GODOT_VERSION}; received ${version.stdout?.trim() || version.error}`)
  }
  await rm(project, { recursive: true, force: true })
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  await cp(source, project, { recursive: true, filter: path => !['.godot', '.DS_Store'].includes(basename(path)) })
  await cp('scripts/tiny-swords-xp-bridge.gd', resolve(project, 'scripts/xp_bridge.gd'))
  await writeFile(resolve(project, 'scenes/xp_preview.tscn'), `[gd_scene load_steps=3 format=3]\n\n[ext_resource type="PackedScene" path="res://scenes/level_two_preview.tscn" id="Base"]\n[ext_resource type="Script" path="res://scripts/xp_bridge.gd" id="XP"]\n\n[node name="StudyIsland" instance=ExtResource("Base")]\nscript = ExtResource("XP")\n`)
  const config = await readFile(resolve(project, 'project.godot'), 'utf8')
  if (!config.includes('run/main_scene="res://scenes/level_two_preview.tscn"')) throw new Error('Unexpected source main scene; review the integration entry point')
  await writeFile(resolve(project, 'project.godot'), config.replace('run/main_scene="res://scenes/level_two_preview.tscn"', 'run/main_scene="res://scenes/xp_preview.tscn"'))
  for (const args of [
    ['--editor', '--import'],
    ['--script', resolve('tests/godot/tiny-swords-export-contract.gd')],
    ['--script', 'res://tests/inventory_outline_assets.gd'],
    ['--script', 'res://tests/gameplay.gd'],
    ['--script', 'res://tests/animal_checkpoint_saves.gd'],
    ['--script', 'res://tests/conflict_previews.gd'],
    ['--script', 'res://tests/progression.gd'],
    ['--export-release', 'Web', resolve(staging, 'index.html')]]) {
    const result = spawnSync(godot, ['--headless', '--path', project, ...args], { stdio: 'inherit' })
    if (result.error || result.status !== 0) throw result.error || new Error('Godot export/check failed')
  }
  let game = await readFile(resolve(staging, 'index.html'), 'utf8')
  // Forward the engine's handled startup failure to the owning page surface.
  const failureHook = 'function displayFailureNotice(err) {'
  if (!game.includes(failureHook)) throw new Error('Godot startup failure hook changed')
  game = game.replace(failureHook, `${failureHook}
parent.postMessage({type:'edenia-game-startup-failed'}, location.origin);`)
  const receiver = await readFile('scripts/tiny-swords-xp-messages.js', 'utf8')
  const visibility = await readFile('scripts/tiny-swords-xp-visibility.js', 'utf8')
  await writeFile(resolve(staging, 'index.html'), game.replace('</head>', `<script>${receiver}</script><script>${visibility}</script></head>`))
  await cp('scripts/tiny-swords-xp-parent.js', resolve(staging, 'parent.js'))
  await cp('scripts/tiny-swords-conflict-previews.js', resolve(staging, 'conflict-previews.js'))
  await cp(resolve(source, 'Tiny Swords (Free Pack)/UI Elements/UI Elements/Cursors/Cursor_02.png'), resolve(staging, 'Cursor_02.png'))
  await cp(resolve(source, 'notices'), resolve(staging, 'notices'), { recursive: true })
  await cp('assets/tiny-swords/README.md', resolve(staging, 'notices/ASSET-PROVENANCE.md'))
  const delivery = await prepareTinySwordsDelivery(staging, outputDir)
  // Hash parent, hooks, pack and the exact engine/decoder references. Engine bytes
  // have their own immutable URL, so game updates reuse the browser's engine cache.
  const hash = createHash('sha256')
  async function hashFiles(directory, prefix = '') {
    for (const name of (await readdir(directory)).sort()) {
      if (name.endsWith('.br') || name.endsWith('.gz')) continue
      const path = resolve(directory, name)
      if ((await stat(path)).isDirectory()) await hashFiles(path, `${prefix}${name}/`)
      else { hash.update(`${prefix}${name}\0`); hash.update(await readFile(path)) }
    }
  }
  await hashFiles(staging)
  const versionId = hash.digest('hex')
  await writeFile(resolve(staging, 'release.json'), JSON.stringify({ godotVersion: GODOT_VERSION, version: versionId, ...delivery }, null, 2) + '\n')
  for (const name of ['index.js']) {
    const bytes = await readFile(resolve(staging, name))
    await writeFile(resolve(staging, name + '.br'), brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }))
    await writeFile(resolve(staging, name + '.gz'), gzipSync(bytes))
  }
  const releases = resolve(outputDir, GAME_DIRECTORY)
  await rm(releases, { recursive: true, force: true })
  await mkdir(releases, { recursive: true })
  await rename(staging, resolve(releases, versionId))
  return `${GAME_DIRECTORY}/${versionId}/parent.js`
}
