import { readFile, writeFile } from 'node:fs/promises'
import vm from 'node:vm'

const PLACEHOLDER_KEYS = new Set([
  'PASTE_YOUR_RESTRICTED_YOUTUBE_API_KEY_HERE',
  'YOUR_RESTRICTED_KEY'
])

export const LOCAL_CONFIG_SETUP_COMMAND = 'cp config.example.js config.local.js'

function localConfigSetupMessage() {
  return `Run "${LOCAL_CONFIG_SETUP_COMMAND}", then add a restricted development YouTube API key.`
}

export function normalizeLocalYoutubeApiKey(value) {
  const key = String(value || '').trim()
  if (!key || PLACEHOLDER_KEYS.has(key.toUpperCase())) return ''
  return key
}

export async function readLocalYoutubeApiKey(configPath) {
  let source
  try {
    source = await readFile(configPath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Local config.local.js is missing. ${localConfigSetupMessage()}`)
    }
    throw new Error(`Could not read local config.local.js. ${error.message}`)
  }

  const sandbox = { window: {} }
  try {
    vm.runInNewContext(source, sandbox, {
      filename: 'config.local.js',
      timeout: 1000
    })
  } catch {
    throw new Error(`Local config.local.js has invalid JavaScript. ${localConfigSetupMessage()}`)
  }

  const youtubeApiKey = normalizeLocalYoutubeApiKey(
    sandbox.window?.EDENIA_CONFIG?.youtubeApiKey
  )
  if (!youtubeApiKey) {
    throw new Error(`Local config.local.js has no usable YouTube API key. ${localConfigSetupMessage()}`)
  }
  return youtubeApiKey
}

export async function writeLocalRuntimeConfig(outputPath, youtubeApiKey) {
  const normalizedKey = normalizeLocalYoutubeApiKey(youtubeApiKey)
  if (!normalizedKey) {
    throw new Error('Refusing to write a local runtime config without a usable YouTube API key.')
  }

  const runtimeConfig = `window.EDENIA_CONFIG = ${JSON.stringify({
    youtubeApiKey: normalizedKey
  }, null, 2)}\n`
  await writeFile(outputPath, runtimeConfig)
}
