// Disposable local integration of the XP app and an existing Godot project.
// Normal builds and production never invoke this script or copy these assets.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
const projectIndex = process.argv.indexOf('--project')
if (projectIndex < 0 || !process.argv[projectIndex + 1]) throw new Error('Pass --project with the existing Tiny Swords Godot project directory')
const source = resolve(process.argv[projectIndex + 1])
const project = resolve('.cache/tiny-swords-xp/project')
const output = resolve('_site/tiny-swords')
await mkdir(project, { recursive: true })
await mkdir(output, { recursive: true })
await cp(source, project, { recursive: true, filter: path => !path.includes('/.godot') })
await cp('scripts/tiny-swords-xp-bridge.gd', resolve(project, 'scripts/xp_bridge.gd'))
await writeFile(resolve(project, 'scenes/xp_preview.tscn'), `[gd_scene load_steps=3 format=3]\n\n[ext_resource type="PackedScene" path="res://scenes/level_two_preview.tscn" id="Base"]\n[ext_resource type="Script" path="res://scripts/xp_bridge.gd" id="XP"]\n\n[node name="StudyIsland" instance=ExtResource("Base")]\nscript = ExtResource("XP")\n`)
const config = await readFile(resolve(project, 'project.godot'), 'utf8')
await writeFile(resolve(project, 'project.godot'), config.replace('run/main_scene="res://scenes/level_two_preview.tscn"', 'run/main_scene="res://scenes/xp_preview.tscn"'))
const godot = process.env.GODOT_BIN || '/Applications/Godot.app/Contents/MacOS/Godot'
for (const args of [['--headless', '--path', project, '--editor', '--import'], ['--headless', '--path', project, '--export-release', 'Web', resolve(output, 'index.html')]]) {
  const result = spawnSync(godot, args, { stdio: 'inherit' })
  if (result.error || result.status !== 0) throw result.error || new Error('Godot export failed')
}
let game = await readFile(resolve(output, 'index.html'), 'utf8')
const receiver = `<script>window.edeniaCameraCommands=[];window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='edenia-camera')window.edeniaCameraCommands.push(event.data.command)});window.edeniaStudyLevel=1;window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='edenia-study-level')return;window.edeniaStudyLevel=Math.min(3,Math.max(1,Number(event.data.level)||1));window.edeniaStudyLayout=event.data.layout;window.edeniaStudyReady=true});parent.postMessage({type:'edenia-tiny-ready'},location.origin)</script>`
await writeFile(resolve(output, 'index.html'), game.replace('</head>', receiver + '</head>'))
await cp('scripts/tiny-swords-xp-parent.js', resolve('_site/tiny-swords-xp-parent.js'))
let html = await readFile('_site/index.html', 'utf8')
html = html.replace(/<style>\.tiny-swords-preview[\s\S]*?<\/style><script src="tiny-swords-xp-parent.js"><\/script>/, '')
html = html.replace('</head>', `<style>.tiny-swords-preview .city-image-wrap {background:#48a5a6}.tiny-swords-preview .city-image-wrap > :not(.tiny-swords-frame):not(.tiny-swords-camera-controls) {visibility:hidden!important;pointer-events:none!important}.tiny-swords-frame {position:absolute;inset:0;width:100%;height:100%;border:0;display:block;z-index:5}.tiny-swords-camera-controls{position:absolute;left:12px;top:12px;z-index:6;display:flex;gap:4px;flex-wrap:wrap;max-width:calc(100% - 24px)}.tiny-swords-camera-controls[hidden]{display:none}.tiny-swords-camera-controls button{width:34px;height:34px;border:1px solid #172d35;border-radius:8px;background:#effbfa;color:#172d35;font-size:20px;cursor:pointer}.tiny-swords-camera-controls button:focus-visible{outline:3px solid #ffd45c}</style><script src="tiny-swords-xp-parent.js"></script></head>`)
await writeFile('_site/index.html', html)
console.log('Combined XP and Tiny Swords preview prepared at http://localhost:8037/')
