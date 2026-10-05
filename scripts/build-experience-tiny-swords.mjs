// Disposable local integration of the XP app and an existing Godot project.
// Normal builds and production never invoke this script or copy these assets.
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { brotliCompressSync, gzipSync, constants } from 'node:zlib'
const projectIndex = process.argv.indexOf('--project')
if (projectIndex < 0 || !process.argv[projectIndex + 1]) throw new Error('Pass --project with the existing Tiny Swords Godot project directory')
const source = resolve(process.argv[projectIndex + 1])
const project = resolve('.cache/tiny-swords-xp/project')
const output = resolve('_site/tiny-swords-xp-game')
await rm(project, { recursive: true, force: true })
await mkdir(project, { recursive: true })
await mkdir(output, { recursive: true })
await cp(source, project, { recursive: true, filter: path => !path.includes('/.godot') })
await cp('scripts/tiny-swords-xp-bridge.gd', resolve(project, 'scripts/xp_bridge.gd'))
await writeFile(resolve(project, 'scenes/xp_preview.tscn'), `[gd_scene load_steps=3 format=3]\n\n[ext_resource type="PackedScene" path="res://scenes/level_two_preview.tscn" id="Base"]\n[ext_resource type="Script" path="res://scripts/xp_bridge.gd" id="XP"]\n\n[node name="StudyIsland" instance=ExtResource("Base")]\nscript = ExtResource("XP")\n`)
const config = await readFile(resolve(project, 'project.godot'), 'utf8')
if (!config.includes('run/main_scene="res://scenes/level_two_preview.tscn"')) throw new Error('Unexpected source main scene; review the integration entry point')
await writeFile(resolve(project, 'project.godot'), config.replace('run/main_scene="res://scenes/level_two_preview.tscn"', 'run/main_scene="res://scenes/xp_preview.tscn"'))
const godot = process.env.GODOT_BIN || '/Applications/Godot.app/Contents/MacOS/Godot'
for (const args of [['--headless', '--path', project, '--editor', '--import'], ['--headless', '--path', project, '--script', resolve('tests/godot/tiny-swords-export-contract.gd')], ['--headless', '--path', project, '--script', 'res://tests/gameplay.gd'], ['--headless', '--path', project, '--export-release', 'Web', resolve(output, 'index.html')]]) {
  const result = spawnSync(godot, args, { stdio: 'inherit' })
  if (result.error || result.status !== 0) throw result.error || new Error('Godot export failed')
}
// Delivery artifacts stay alongside the disposable export. A serving host must
// negotiate Content-Encoding and retain application/wasm for the WASM response.
for (const name of ['index.wasm', 'index.pck', 'index.js']) {
  const bytes = await readFile(resolve(output, name))
  await writeFile(resolve(output, name + '.br'), brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }))
  await writeFile(resolve(output, name + '.gz'), gzipSync(bytes))
}
let game = await readFile(resolve(output, 'index.html'), 'utf8')
const receiver = `<script>${await readFile('scripts/tiny-swords-xp-messages.js', 'utf8')}</script>`
const visibilityReceiver = await readFile('scripts/tiny-swords-xp-visibility.js', 'utf8')
await writeFile(resolve(output, 'index.html'), game.replace('</head>', receiver + `<script>${visibilityReceiver}</script></head>`))
await cp('scripts/tiny-swords-xp-parent.js', resolve('_site/tiny-swords-xp-parent.js'))
await cp('assets/tiny-swords/UI Elements/UI Elements/Cursors/Cursor_02.png', resolve(output, 'Cursor_02.png'))
let html = await readFile('_site/index.html', 'utf8')
html = html.replace(/<style>\.tiny-swords-preview[\s\S]*?<\/style><script src="tiny-swords-xp-parent.js"><\/script>/, '')
html = html.replace('</head>', `<style>.tiny-swords-preview .city-image-wrap {background:#47aba9}.tiny-swords-preview .city-image-wrap > :not(.tiny-swords-frame):not(.tiny-swords-camera-controls):not(.tiny-swords-save-status) {visibility:hidden!important;pointer-events:none!important}.tiny-swords-save-status{position:absolute;left:8px;top:8px;z-index:7;background:#fff;color:#333}.tiny-swords-save-status:empty{display:none}.tiny-swords-frame {position:absolute;inset:0;width:100%;height:100%;border:0;display:block;z-index:5}.tiny-swords-preview .tiny-swords-camera-controls{z-index:6;display:flex;pointer-events:none;opacity:1!important}.tiny-swords-preview .tiny-swords-camera-controls button{pointer-events:auto;cursor:var(--tiny-swords-camera-cursor,default)}.tiny-swords-preview .tiny-swords-camera-controls[hidden]{display:none}.tiny-swords-preview .tiny-swords-camera-controls .city-image-btn{opacity:0.38;background:rgba(255,255,255,0.64);transition:opacity .15s ease}.tiny-swords-preview .tiny-swords-camera-controls .city-image-btn:hover{opacity:1;background:rgba(255,255,255,0.64)}.tiny-swords-preview .tiny-swords-camera-controls .city-image-btn::before{background:rgba(255,255,255,0.64)}@media(max-width:480px){.tiny-swords-preview .tiny-swords-camera-controls .city-image-btn,.tiny-swords-preview .tiny-swords-camera-controls .city-image-btn:hover{background:transparent}}</style><script src="tiny-swords-xp-parent.js"></script></head>`)
await writeFile('_site/index.html', html)
console.log('Combined XP and Tiny Swords preview prepared at http://localhost:8037/')
