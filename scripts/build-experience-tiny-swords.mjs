// Rebuild the complete source-owned integration for the dedicated local preview.
import { spawnSync } from 'node:child_process'
const projectIndex = process.argv.indexOf('--project')
if (projectIndex < 0 || process.argv[projectIndex + 1] !== 'godot/tiny-swords') {
  throw new Error('Pass --project godot/tiny-swords; gameplay belongs to the canonical project')
}
const result = spawnSync(process.execPath, ['scripts/build-site.mjs'], {
  stdio: 'inherit', env: { ...process.env, EDENIA_TINY_SWORDS_ENABLED: 'true' }
})
if (result.error || result.status !== 0) throw result.error || new Error('Integrated build failed')
console.log('Integrated preview rebuilt. Serve _site on localhost:8037 for Playground controls.')
