// Official Linux editor and matching Web templates, verified against pinned SHA512.
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { GODOT_VERSION } from './build-tiny-swords.mjs'

if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Managed setup supports Linux x64. On other platforms set GODOT_BIN to official Godot 4.7.2 and install its matching Web templates.')
const directory = resolve('.cache/godot')
await mkdir(directory, { recursive: true })
const downloads = {
  'Godot_v4.7.2-stable_linux.x86_64.zip': '9aa00f7a605200940bce3027a567b782f49bd8e940dd06ae9e987bd65aee1b1467edd56ed84fcdcbdd44354bf613bdbb4e5d2913e925850368e150c59ed54c65',
  'Godot_v4.7.2-stable_export_templates.tpz': 'ca4d71c4d7b81dfc15d1a98baa07534aa95b03fdda78a0075b06672e1648d2e5f40980c9adc28d23e1b92e732ee7bf3461997aa804af74ec2fcd7a93ccb84079'
}
for (const [name, checksum] of Object.entries(downloads)) {
  const path = resolve(directory, name)
  let bytes
  try { bytes = await readFile(path) } catch {}
  if (!bytes || createHash('sha512').update(bytes).digest('hex') !== checksum) {
    const response = await fetch(`https://github.com/godotengine/godot-builds/releases/download/${GODOT_VERSION}-stable/${name}`)
    if (!response.ok) throw new Error(`Godot download failed: ${response.status}`)
    bytes = Buffer.from(await response.arrayBuffer())
    if (createHash('sha512').update(bytes).digest('hex') !== checksum) throw new Error(`Godot checksum mismatch: ${name}`)
    await writeFile(path, bytes)
  }
}
execFileSync('unzip', ['-oq', resolve(directory, 'Godot_v4.7.2-stable_linux.x86_64.zip'), '-d', directory])
const templates = resolve(process.env.XDG_DATA_HOME || resolve(homedir(), '.local/share'), 'godot/export_templates', `${GODOT_VERSION}.stable`)
await mkdir(templates, { recursive: true })
const unpacked = resolve(directory, 'templates')
await rm(unpacked, { recursive: true, force: true })
execFileSync('unzip', ['-oq', resolve(directory, 'Godot_v4.7.2-stable_export_templates.tpz'), 'templates/web_nothreads_release.zip', 'templates/web_nothreads_debug.zip', '-d', directory])
for (const name of ['web_nothreads_release.zip', 'web_nothreads_debug.zip']) await writeFile(resolve(templates, name), await readFile(resolve(unpacked, name)))
console.log(`Installed official Godot ${GODOT_VERSION} and matching single-threaded Web templates.`)
