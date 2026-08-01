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

export function normalizeLocalRuntimeConfig(value) {
  return {
    youtubeApiKey: normalizeLocalYoutubeApiKey(value?.youtubeApiKey),
    freePlusEnabled: value?.freePlusEnabled === true,
    plusCheckoutEnabled: value?.plusCheckoutEnabled === true
  }
}

export async function readLocalRuntimeConfig(configPath) {
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

  const runtimeConfig = normalizeLocalRuntimeConfig(
    sandbox.window?.EDENIA_CONFIG
  )
  if (!runtimeConfig.youtubeApiKey) {
    throw new Error(`Local config.local.js has no usable YouTube API key. ${localConfigSetupMessage()}`)
  }
  return runtimeConfig
}

export async function readLocalYoutubeApiKey(configPath) {
  return (await readLocalRuntimeConfig(configPath)).youtubeApiKey
}

export async function writeLocalRuntimeConfig(outputPath, value) {
  const runtimeConfig = normalizeLocalRuntimeConfig(
    typeof value === 'object' && value !== null
      ? value
      : { youtubeApiKey: value }
  )
  if (!runtimeConfig.youtubeApiKey) {
    throw new Error('Refusing to write a local runtime config without a usable YouTube API key.')
  }

  const source = `window.EDENIA_CONFIG = ${JSON.stringify(
    runtimeConfig,
    null,
    2
  )}\n`
  await writeFile(outputPath, source)
}
