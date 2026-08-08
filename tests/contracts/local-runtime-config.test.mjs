import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  readLocalRuntimeConfig,
  readLocalYoutubeApiKey,
  writeLocalRuntimeConfig
} from '../../scripts/local-runtime-config.mjs'

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'edenia-local-config-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('local runtime config reports the one-time setup when config.local.js is missing', async () => {
  await withTemporaryDirectory(async directory => {
    await assert.rejects(
      readLocalYoutubeApiKey(join(directory, 'config.local.js')),
      /cp config\.example\.js config\.local\.js/
    )
  })
})

test('local runtime config rejects the tracked placeholder key', async () => {
  await withTemporaryDirectory(async directory => {
    const configPath = join(directory, 'config.local.js')
    await writeFile(
      configPath,
      "window.EDENIA_CONFIG = { youtubeApiKey: 'PASTE_YOUR_RESTRICTED_YOUTUBE_API_KEY_HERE' }\n"
    )

    await assert.rejects(readLocalYoutubeApiKey(configPath), error => {
      assert.match(error.message, /no usable YouTube API key/)
      assert.doesNotMatch(error.message, /PASTE_YOUR_RESTRICTED/)
      return true
    })
  })
})

test('local runtime config normalizes a valid ignored key into the generated site config', async () => {
  await withTemporaryDirectory(async directory => {
    const configPath = join(directory, 'config.local.js')
    const outputPath = join(directory, 'generated-config.local.js')
    await writeFile(
      configPath,
      "window.EDENIA_CONFIG = { youtubeApiKey: '  fake-development-key  ' }\n"
    )

    const youtubeApiKey = await readLocalYoutubeApiKey(configPath)
    await writeLocalRuntimeConfig(outputPath, youtubeApiKey)

    assert.equal(youtubeApiKey, 'fake-development-key')
    assert.equal(
      await readFile(outputPath, 'utf8'),
      'window.EDENIA_CONFIG = {\n'
        + '  "youtubeApiKey": "fake-development-key",\n'
        + '  "freePlusEnabled": false,\n'
        + '  "plusCheckoutEnabled": false,\n'
        + '  "videoOrganizationEnabled": false,\n'
        + '  "channelVideoFormatToggleEnabled": false,\n'
        + '  "studyGuidanceEnabled": false,\n'
        + '  "indexedDbBackupsEnabled": false,\n'
        + '  "indexedDbBackupCleanupEnabled": false,\n'
        + '  "supabaseUrl": "",\n'
        + '  "supabasePublishableKey": ""\n'
        + '}\n'
    )
  })
})

test('local runtime config preserves explicit dormant release flags', async () => {
  await withTemporaryDirectory(async directory => {
    const configPath = join(directory, 'config.local.js')
    const outputPath = join(directory, 'generated-config.local.js')
    await writeFile(
      configPath,
      'window.EDENIA_CONFIG = {\n'
        + "  youtubeApiKey: 'fake-development-key',\n"
        + '  freePlusEnabled: true,\n'
        + '  plusCheckoutEnabled: true,\n'
        + '  videoOrganizationEnabled: true,\n'
        + '  channelVideoFormatToggleEnabled: true,\n'
        + '  studyGuidanceEnabled: true,\n'
        + '  indexedDbBackupsEnabled: true,\n'
        + '  indexedDbBackupCleanupEnabled: true,\n'
        + "  supabaseUrl: ' https://project.supabase.co ',\n"
        + "  supabasePublishableKey: ' sb_publishable_test '\n"
        + '}\n'
    )

    const runtimeConfig = await readLocalRuntimeConfig(configPath)
    await writeLocalRuntimeConfig(outputPath, runtimeConfig)

    assert.deepEqual(runtimeConfig, {
      youtubeApiKey: 'fake-development-key',
      freePlusEnabled: true,
      plusCheckoutEnabled: true,
      videoOrganizationEnabled: true,
      channelVideoFormatToggleEnabled: true,
      studyGuidanceEnabled: true,
      indexedDbBackupsEnabled: true,
      indexedDbBackupCleanupEnabled: true,
      supabaseUrl: 'https://project.supabase.co',
      supabasePublishableKey: 'sb_publishable_test'
    })
    assert.match(
      await readFile(outputPath, 'utf8'),
      /"freePlusEnabled": true,\n  "plusCheckoutEnabled": true,\n  "videoOrganizationEnabled": true,\n  "channelVideoFormatToggleEnabled": true,\n  "studyGuidanceEnabled": true,\n  "indexedDbBackupsEnabled": true,\n  "indexedDbBackupCleanupEnabled": true/
    )
  })
})

test('local runtime config removes tracked Supabase placeholders', async () => {
  await withTemporaryDirectory(async directory => {
    const configPath = join(directory, 'config.local.js')
    await writeFile(
      configPath,
      'window.EDENIA_CONFIG = {\n'
        + "  youtubeApiKey: 'fake-development-key',\n"
        + "  supabaseUrl: 'PASTE_YOUR_SUPABASE_PROJECT_URL_HERE',\n"
        + "  supabasePublishableKey: 'PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE'\n"
        + '}\n'
    )

    assert.deepEqual(await readLocalRuntimeConfig(configPath), {
      youtubeApiKey: 'fake-development-key',
      freePlusEnabled: false,
      plusCheckoutEnabled: false,
      videoOrganizationEnabled: false,
      channelVideoFormatToggleEnabled: false,
      studyGuidanceEnabled: false,
      indexedDbBackupsEnabled: false,
      indexedDbBackupCleanupEnabled: false,
      supabaseUrl: '',
      supabasePublishableKey: ''
    })
  })
})
