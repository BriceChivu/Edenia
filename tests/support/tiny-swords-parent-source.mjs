import { readFileSync } from 'node:fs'

// Exercise the source modules in the same classic-script realm as the bundled
// parent without requiring a full Godot export in the deterministic tests.
export function readTinySwordsParentSource() {
  return readFileSync('scripts/tiny-swords-startup.js', 'utf8').replace('export function', 'function')
    + '\n' + readFileSync('scripts/tiny-swords-xp-parent.js', 'utf8').replace(/^import .*\n/, '')
}
