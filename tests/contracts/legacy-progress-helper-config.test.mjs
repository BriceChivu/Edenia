import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLegacyProgressReturnUrl,
  deriveLegacyProgressHelperRuntime
} from '../../src/integrations/legacy-progress-helper-config.js'
import {
  createLegacyMigrationHelperProductionConfig,
  renderLegacyMigrationHelperConfig
} from '../../scripts/legacy-migration-helper-config.mjs'

const productionConfig = createLegacyMigrationHelperProductionConfig({
  supabasePublishableKey: 'sb_publishable_abcdefgh',
  supabaseUrl: 'https://project-ref.supabase.co'
})

test('production helper config derives exact fixed endpoints and return URL', () => {
  assert.deepEqual(productionConfig, {
    createTransferUrl: 'https://project-ref.supabase.co/functions/v1/create-legacy-progress-transfer',
    returnUrl: 'https://www.edenia.study/',
    supabasePublishableKey: 'sb_publishable_abcdefgh',
    supabaseUrl: 'https://project-ref.supabase.co/'
  })
  const runtime = deriveLegacyProgressHelperRuntime({
    EDENIA_LEGACY_MIGRATION_CONFIG: productionConfig,
    location: { href: 'https://bricechivu.github.io/edenia-migrate/' }
  })
  assert.equal(runtime.valid, true)
  assert.equal(runtime.localTest, false)
  assert.equal(runtime.disclosureDelayMs, 1_500)
  assert.equal(renderLegacyMigrationHelperConfig(productionConfig).includes(
    'EDENIA_LEGACY_MIGRATION_CONFIG'
  ), true)
  assert.equal(deriveLegacyProgressHelperRuntime({
    EDENIA_LEGACY_MIGRATION_CONFIG: productionConfig,
    location: { href: 'https://bricechivu.github.io/Edenia/' }
  }).valid, false)
})

test('helper runtime accepts only the exact localhost test location and constants', () => {
  const localConfig = {
    createTransferUrl: 'http://localhost:8002/functions/v1/create-legacy-progress-transfer',
    returnUrl: 'http://localhost:8000/',
    supabasePublishableKey: 'sb_publishable_localtest',
    supabaseUrl: 'http://localhost:8002/'
  }
  const valid = deriveLegacyProgressHelperRuntime({
    EDENIA_LEGACY_MIGRATION_CONFIG: localConfig,
    location: {
      href: 'http://localhost:8002/?legacy_migration_test=1'
    }
  })
  assert.equal(valid.valid, true)
  assert.equal(valid.localTest, true)
  assert.equal(valid.disclosureDelayMs, 1_500)

  for (const href of [
    'http://localhost:8002/',
    'http://localhost:8002/?legacy_migration_test=true',
    'http://localhost:8002/?legacy_migration_test=1&extra=1',
    'http://localhost:8002/?legacy_migration_test=1#fragment',
    'http://127.0.0.1:8002/?legacy_migration_test=1',
    'http://localhost:8003/?legacy_migration_test=1'
  ]) {
    assert.equal(deriveLegacyProgressHelperRuntime({
      EDENIA_LEGACY_MIGRATION_CONFIG: localConfig,
      location: { href }
    }).valid, false, href)
  }
  assert.equal(deriveLegacyProgressHelperRuntime({
    EDENIA_LEGACY_MIGRATION_CONFIG: {
      ...localConfig,
      returnUrl: 'https://attacker.example/'
    },
    location: {
      href: 'http://localhost:8002/?legacy_migration_test=1'
    }
  }).valid, false)
})

test('return fragments are namespaced and never accept arbitrary outcomes', () => {
  const runtime = deriveLegacyProgressHelperRuntime({
    EDENIA_LEGACY_MIGRATION_CONFIG: productionConfig,
    location: { href: 'https://bricechivu.github.io/edenia-migrate/' }
  })
  const capability = 'A'.repeat(43)
  assert.equal(
    createLegacyProgressReturnUrl(runtime, 'transfer', capability),
    `https://www.edenia.study/#edenia-legacy-progress=transfer.${capability}`
  )
  assert.equal(
    createLegacyProgressReturnUrl(runtime, 'none'),
    'https://www.edenia.study/#edenia-legacy-progress=none'
  )
  assert.equal(
    createLegacyProgressReturnUrl(runtime, 'deferred'),
    'https://www.edenia.study/#edenia-legacy-progress=deferred'
  )
  assert.equal(createLegacyProgressReturnUrl(runtime, 'evil'), '')
  assert.equal(createLegacyProgressReturnUrl(runtime, 'transfer', 'short'), '')
})

test('production config rejects non-project URLs and non-publishable keys', () => {
  for (const input of [
    {
      supabasePublishableKey: 'sb_publishable_abcdefgh',
      supabaseUrl: 'https://attacker.example'
    },
    {
      supabasePublishableKey: 'sb_secret_abcdefgh',
      supabaseUrl: 'https://project-ref.supabase.co'
    },
    {
      supabasePublishableKey: 'sb_publishable_abcdefgh',
      supabaseUrl: 'https://project-ref.supabase.co/extra'
    }
  ]) {
    assert.throws(
      () => createLegacyMigrationHelperProductionConfig(input),
      /invalid|hosted Supabase/
    )
  }
})
