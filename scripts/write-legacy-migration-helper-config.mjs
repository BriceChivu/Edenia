import { readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createLegacyMigrationHelperProductionConfig,
  renderLegacyMigrationHelperConfig
} from './legacy-migration-helper-config.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const outputDir = resolve(projectRoot, '_legacy_migration_site')
const outputConfig = resolve(outputDir, 'config.local.js')
const outputHtml = resolve(outputDir, 'index.html')
const requireSupabase = process.argv.includes('--require-supabase')

if (relative(projectRoot, outputDir) !== '_legacy_migration_site') {
  throw new Error(`Refusing to write unexpected helper directory: ${outputDir}`)
}
if (requireSupabase && (
  !process.env.SUPABASE_URL
  || !process.env.SUPABASE_PUBLISHABLE_KEY
)) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required'
  )
}

const config = createLegacyMigrationHelperProductionConfig({
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  supabaseUrl: process.env.SUPABASE_URL
})
const html = await readFile(outputHtml, 'utf8')
const cspMarker = "connect-src 'self'"
if ((html.match(new RegExp(cspMarker, 'g')) || []).length !== 1) {
  throw new Error('Expected one safe helper connect-src marker')
}
const functionOrigin = new URL(config.createTransferUrl).origin
await Promise.all([
  writeFile(outputConfig, renderLegacyMigrationHelperConfig(config)),
  writeFile(outputHtml, html.replace(
    cspMarker,
    `connect-src ${functionOrigin}`
  ))
])

console.log(`Wrote migration helper config to ${outputConfig}`)
