import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('XP camera preview export cannot be overwritten by standalone Godot export', async () => {
  const build = await readFile('scripts/build-experience-tiny-swords.mjs', 'utf8')
  const parent = await readFile('scripts/tiny-swords-xp-parent.js', 'utf8')
  const standalone = await readFile('godot/tiny-swords/export_presets.cfg', 'utf8')
  const output = build.match(/const output = resolve\('([^']+)'\)/)[1]
  const standaloneOutput = standalone.match(/export_path="\.\.\/\.\.\/([^\"]+)\/index.html"/)[1]
  assert.notEqual(output, standaloneOutput, 'standalone export replaces the XP camera receiver and game bridge')
  assert.ok(parent.includes(`frame.src = '${output.replace('_site/', '')}/index.html'`))
})


test('study bridge delegates gameplay and builder copies canonical Godot rules', async () => {
  const bridge = await readFile('scripts/tiny-swords-xp-bridge.gd', 'utf8')
  assert.deepEqual([...bridge.matchAll(/^func (\w+)\(/gm)].map(match => match[1]), ['_ready', 'receive_host_visibility', '_process', 'restore_study_layout', 'save_layout'])
  const build = await readFile('scripts/build-experience-tiny-swords.mjs', 'utf8')
  assert.ok(build.includes("'res://tests/gameplay.gd'"), 'integrated build exercises shared gameplay suite')
  assert.ok(build.includes('tiny-swords-export-contract.gd'), 'integrated build checks the configured adapter entry point')
  assert.ok(!build.includes('layoutSource.replace'), 'grid and gameplay belong to Godot source')
})
