// Local-only preview: the normal build and deployment do not invoke this file.
import { spawnSync, spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const godot = process.env.GODOT_BIN || '/Applications/Godot.app/Contents/MacOS/Godot'
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root, stdio: 'inherit',
    env: process.env
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`)
}
run(process.execPath, ['scripts/build-site.mjs'])
await mkdir(resolve(root, '_site/tiny-swords'), { recursive: true })
run(godot, ['--headless', '--path', 'godot/tiny-swords', '--export-release', 'Web'])
let html = await readFile(resolve(root, '_site/index.html'), 'utf8')
// Patch only disposable local build output. Preserve the app's original nodes
// so its ordinary town/profile lifecycle still has the elements it expects.
const preview = `
<script>
if (['localhost', '127.0.0.1'].includes(location.hostname) &&
    location.port === '4183') {
  document.documentElement.classList.add('tiny-swords-preview');
  window.addEventListener('DOMContentLoaded', () => {
    const frame = document.createElement('iframe');
    frame.src = 'tiny-swords/index.html';
    frame.title = 'Tiny Swords: click the main island to move the pawn';
    frame.className = 'tiny-swords-frame';
    document.querySelector('.city-image-wrap').append(frame);
  }, { once: true });
}
</script>
<style>
.tiny-swords-preview .city-image-wrap { background: #47aba9; }
.tiny-swords-preview .city-image-wrap > :not(.tiny-swords-frame) { visibility: hidden !important; pointer-events: none !important; }
.tiny-swords-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; z-index: 5; }
</style>
`
html = html.replace('</head>', `${preview}</head>`)
await writeFile(resolve(root, '_site/index.html'), html)
console.log('Local Tiny Swords preview: http://localhost:4183/')
const server = spawn(process.execPath, ['scripts/serve-static.mjs', '--host', 'localhost', '--port', '4183'], {
  cwd: root, stdio: 'inherit'
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal))
server.on('exit', code => { process.exitCode = code || 0 })
