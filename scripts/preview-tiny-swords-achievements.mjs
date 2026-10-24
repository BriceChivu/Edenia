// Disposable Godot draft. Does not change the production entry point.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { basename, resolve } from 'node:path'
const project = resolve('.cache/achievements-draft/project')
const output = resolve('.cache/achievements-draft/web')
const godot = process.env.GODOT_BIN || '/Applications/Godot.app/Contents/MacOS/Godot'
await rm(project, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp('godot/tiny-swords', project, { recursive: true, filter: path => !['.godot', '.DS_Store'].includes(basename(path)) })
const config = await readFile(resolve(project, 'project.godot'), 'utf8')
await writeFile(resolve(project, 'project.godot'), config.replace('run/main_scene="res://scenes/level_two_preview.tscn"', 'run/main_scene="res://previews/achievements/preview.tscn"'))
const presets = await readFile(resolve(project, 'export_presets.cfg'), 'utf8')
await writeFile(resolve(project, 'export_presets.cfg'), presets.replace('tests/*,previews/*,tools/*', 'tests/*,tools/*'))
for (const args of [['--editor', '--import'], ['--export-release', 'Web', resolve(output, 'index.html')]]) {
  const result = spawnSync(godot, ['--headless', '--path', project, ...args], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error('Achievements draft export failed')
}
console.log('Editable achievements draft: http://localhost:8051/')
if (!process.argv.includes('--build-only')) {
  const server = spawn(process.execPath, ['scripts/serve-static.mjs', '--root', output, '--host', 'localhost', '--port', '8051'], { stdio: 'inherit' })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal))
}
