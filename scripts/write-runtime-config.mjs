import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRuntimeConfigFlag } from './runtime-config-flags.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const outputPath = resolve(projectRoot, '_site', 'config.local.js')
const requireKey = process.argv.includes('--require-key')
const youtubeApiKey = process.env.YOUTUBE_API_KEY || ''

if (requireKey && !youtubeApiKey) {
  throw new Error('YOUTUBE_API_KEY is required for the production runtime config')
}

const runtimeConfig = `window.EDENIA_CONFIG = ${JSON.stringify({
  youtubeApiKey,
  freePlusEnabled: parseRuntimeConfigFlag(
    process.env.EDENIA_FREE_PLUS_ENABLED,
    'EDENIA_FREE_PLUS_ENABLED'
  ),
  plusCheckoutEnabled: parseRuntimeConfigFlag(
    process.env.EDENIA_PLUS_CHECKOUT_ENABLED,
    'EDENIA_PLUS_CHECKOUT_ENABLED'
  )
}, null, 2)}\n`

await writeFile(outputPath, runtimeConfig)
console.log(`Wrote runtime config to ${outputPath}`)
