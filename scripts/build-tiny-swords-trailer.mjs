// Render the source-owned trailer, then encode browser media. Requires FFmpeg
// and the same desktop Godot used for editing the canonical project.
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { basename, resolve } from 'node:path'

const godot = process.env.GODOT_BIN || (process.platform === 'darwin' ? '/Applications/Godot.app/Contents/MacOS/Godot' : 'godot')
const directory = resolve('.cache/trailer')
const project = resolve(directory, 'project')
const output = resolve('images/tiny-swords-trailer')
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} failed`)
}
await mkdir(output, { recursive: true })
await cp('godot/tiny-swords', project, { recursive: true, filter: path => !['.DS_Store', '.godot'].includes(basename(path)) })
const config = await readFile(resolve(project, 'project.godot'), 'utf8')
// Render at twice the presentation dimensions for Retina screens. Camera framing
// accounts for that density, so this adds detail without enlarging the island.
for (const [suffix, width, height] of [['', 2304, 992], ['-phone', 1280, 1280]]) {
  const presentationConfig = config
    .replace('window/size/viewport_height=496', `window/size/viewport_width=${width}\nwindow/size/viewport_height=${height}`)
    .replace('window/size/window_width_override=1152', `window/size/window_width_override=${width}`)
    .replace('window/size/window_height_override=496', `window/size/window_height_override=${height}`)
    // Avoid baking JPEG artifacts into frames before the browser encode.
    + '\n[editor]\n\nmovie_writer/video_quality=1.0\n'
  await writeFile(resolve(project, 'project.godot'), presentationConfig)
  run(godot, ['--headless', '--path', project, '--editor', '--import'])
  const movie = resolve(directory, `island${suffix}.avi`)
  run(godot, ['--path', project, '--fixed-fps', '30', '--disable-vsync', '--write-movie', movie, 'res://previews/trailer_island.tscn', '--', '--capture-trailer'])
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', movie, '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', resolve(output, `island${suffix}.mp4`)])
  // A populated island also serves viewers who prefer reduced motion.
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '7', '-i', movie, '-frames:v', '1', '-update', '1', resolve(output, `island${suffix}-poster.png`)])
  await rm(movie)
}
console.log('Rendered desktop and phone island trailers from Godot source.')
