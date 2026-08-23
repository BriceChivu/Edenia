import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertLegacyProgressRuntimeConfig,
  parseGoogleIdentityClientId,
  parseGoogleSignInMode,
  parseRuntimeConfigFlag,
  parseRuntimeConfigRollout,
  parseRuntimeConfigTimestamp
} from '../../scripts/runtime-config-flags.mjs'

test('runtime release flags are disabled by default and accept explicit booleans', () => {
  assert.equal(parseRuntimeConfigFlag(undefined, 'FLAG'), false)
  assert.equal(parseRuntimeConfigFlag('', 'FLAG'), false)
  assert.equal(parseRuntimeConfigFlag('false', 'FLAG'), false)
  assert.equal(parseRuntimeConfigFlag(' FALSE ', 'FLAG'), false)
  assert.equal(parseRuntimeConfigFlag('true', 'FLAG'), true)
  assert.equal(parseRuntimeConfigFlag(' TRUE ', 'FLAG'), true)
})

test('runtime cutover timestamps are empty or normalized ISO instants', () => {
  assert.equal(parseRuntimeConfigTimestamp(undefined, 'CUTOVER'), '')
  assert.equal(
    parseRuntimeConfigTimestamp('2026-09-30T09:00:00+09:00', 'CUTOVER'),
    '2026-09-30T00:00:00.000Z'
  )
  assert.throws(
    () => parseRuntimeConfigTimestamp('after launch', 'CUTOVER'),
    /CUTOVER must be an ISO 8601 timestamp/
  )
  assert.throws(
    () => parseRuntimeConfigTimestamp('2026-09-30', 'CUTOVER'),
    /CUTOVER must be an ISO 8601 timestamp/
  )
})

test('Google client IDs are empty or exact Web application IDs', () => {
  assert.equal(parseGoogleIdentityClientId(undefined, 'CLIENT_ID'), '')
  assert.equal(
    parseGoogleIdentityClientId(
      ' 1234567890-test_client.apps.googleusercontent.com ',
      'CLIENT_ID'
    ),
    '1234567890-test_client.apps.googleusercontent.com'
  )
  for (const value of [
    'google-client.apps.googleusercontent.com',
    '1234567890.apps.googleusercontent.com',
    'https://1234567890-test.apps.googleusercontent.com',
    '1234567890-test.example.com'
  ]) {
    assert.throws(
      () => parseGoogleIdentityClientId(
        value,
        'EDENIA_GOOGLE_IDENTITY_CLIENT_ID'
      ),
      /must be a Google Web client ID/
    )
  }
})

test('Google sign-in mode defaults to ID-token transport and accepts off', () => {
  assert.equal(parseGoogleSignInMode(undefined, 'MODE'), 'id_token')
  assert.equal(parseGoogleSignInMode('', 'MODE'), 'id_token')
  assert.equal(parseGoogleSignInMode(' OFF ', 'MODE'), 'off')
  assert.equal(parseGoogleSignInMode('ID_TOKEN', 'MODE'), 'id_token')
  for (const value of ['true', 'oauth', 'oauth_redirect', 'popup', 'id-token']) {
    assert.throws(
      () => parseGoogleSignInMode(value, 'EDENIA_GOOGLE_SIGN_IN_MODE'),
      /must be off or id_token/
    )
  }
})

test('runtime release flags reject ambiguous deployment values', () => {
  assert.throws(
    () => parseRuntimeConfigFlag('1', 'EDENIA_FREE_PLUS_ENABLED'),
    /EDENIA_FREE_PLUS_ENABLED must be true or false/
  )
  assert.throws(
    () => parseRuntimeConfigFlag('yes', 'EDENIA_PLUS_CHECKOUT_ENABLED'),
    /EDENIA_PLUS_CHECKOUT_ENABLED must be true or false/
  )
  assert.throws(
    () => parseRuntimeConfigFlag('on', 'EDENIA_STUDY_GUIDANCE_ENABLED'),
    /EDENIA_STUDY_GUIDANCE_ENABLED must be true or false/
  )
  assert.throws(
    () => parseRuntimeConfigFlag('1', 'EDENIA_INDEXED_DB_BACKUPS_ENABLED'),
    /EDENIA_INDEXED_DB_BACKUPS_ENABLED must be true or false/
  )
  assert.throws(
    () => parseRuntimeConfigFlag(
      'yes',
      'EDENIA_INDEXED_DB_BACKUP_CLEANUP_ENABLED'
    ),
    /EDENIA_INDEXED_DB_BACKUP_CLEANUP_ENABLED must be true or false/
  )
  assert.throws(
    () => parseRuntimeConfigFlag(
      'enabled',
      'EDENIA_LEGACY_PROGRESS_MIGRATION_ENABLED'
    ),
    /EDENIA_LEGACY_PROGRESS_MIGRATION_ENABLED must be true or false/
  )
})

test('runtime rollout values default off and accept exact audience stages', () => {
  assert.equal(parseRuntimeConfigRollout(undefined, 'ROLLOUT'), 'off')
  assert.equal(parseRuntimeConfigRollout('', 'ROLLOUT'), 'off')
  assert.equal(parseRuntimeConfigRollout('off', 'ROLLOUT'), 'off')
  assert.equal(parseRuntimeConfigRollout(' INTERNAL ', 'ROLLOUT'), 'internal')
  assert.equal(parseRuntimeConfigRollout('PUBLIC', 'ROLLOUT'), 'public')
})

test('runtime rollout values reject ambiguous deployment stages', () => {
  for (const value of ['true', 'false', '1', 'internal_test', 'everyone']) {
    assert.throws(
      () => parseRuntimeConfigRollout(
        value,
        'EDENIA_ACCOUNT_FEATURES_ROLLOUT'
      ),
      /EDENIA_ACCOUNT_FEATURES_ROLLOUT must be off, internal, or public/
    )
  }
})

test('production migration cannot be enabled without exact relay config', () => {
  assert.doesNotThrow(() => assertLegacyProgressRuntimeConfig({
    enabled: false,
    supabasePublishableKey: '',
    supabaseUrl: ''
  }))
  assert.doesNotThrow(() => assertLegacyProgressRuntimeConfig({
    enabled: true,
    supabasePublishableKey: 'sb_publishable_abcdefgh',
    supabaseUrl: 'https://project-ref.supabase.co'
  }))

  for (const input of [
    {
      supabasePublishableKey: '',
      supabaseUrl: 'https://project-ref.supabase.co'
    },
    {
      supabasePublishableKey: 'legacy-anon-key',
      supabaseUrl: 'https://project-ref.supabase.co'
    },
    {
      supabasePublishableKey: 'sb_publishable_abcdefgh',
      supabaseUrl: 'https://attacker.example'
    },
    {
      supabasePublishableKey: 'sb_publishable_abcdefgh',
      supabaseUrl: 'https://project-ref.supabase.co/path'
    }
  ]) {
    assert.throws(
      () => assertLegacyProgressRuntimeConfig({ enabled: true, ...input }),
      /requires a hosted Supabase URL and publishable key/
    )
  }
})
