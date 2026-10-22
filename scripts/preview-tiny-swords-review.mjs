// Export the Godot-owned scene editor separately; never change the game entry.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { basename, resolve } from 'node:path'
const project = resolve('.cache/precise-review/project')
const output = resolve('.cache/precise-review/web')
const godot = process.env.GODOT_BIN || '/Applications/Godot.app/Contents/MacOS/Godot'
await rm(project, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp('godot/tiny-swords', project, { recursive: true, filter: path => !['.godot', '.DS_Store'].includes(basename(path)) })
const config = await readFile(resolve(project, 'project.godot'), 'utf8')
await writeFile(resolve(project, 'project.godot'), config.replace('run/main_scene="res://scenes/level_two_preview.tscn"', 'run/main_scene="res://previews/review_sandbox.tscn"'))
const presets = await readFile(resolve(project, 'export_presets.cfg'), 'utf8')
await writeFile(resolve(project, 'export_presets.cfg'), presets.replace('exclude_filter="tests/*,previews/*,tools/*,README.md,', 'exclude_filter="tests/*,README.md,'))
for (const args of [['--editor', '--import'], ['--export-release', 'Web', resolve(output, 'index.html')]]) {
  const result = spawnSync(godot, ['--headless', '--path', project, ...args], { stdio: 'inherit' })
  if (result.error || result.status !== 0) throw result.error || new Error('Precise review export failed')
}
console.log(`Precise scene review exported to ${output}`)
if (!process.argv.includes('--build-only')) {
  const server = spawn(process.execPath, ['scripts/serve-static.mjs', '--root', output, '--host', 'localhost', '--port', '8048'], { stdio: 'inherit' })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal))
}
