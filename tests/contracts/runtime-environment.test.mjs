import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deriveRuntimeEnvironment,
  deriveStudyGuidanceEnabled
} from '../../src/core/runtime-environment.js'
import { deriveStorageKeys } from '../../src/core/storage-keys.js'
import {
  getAccountFeaturesRollout,
  getFreePlusEnabled,
  getIndexedDbBackupCleanupEnabled,
  getIndexedDbBackupsEnabled,
  getPlusCheckoutEnabled,
  getStudyGuidanceEnabled,
  getSupabasePublishableKey,
  getSupabaseUrl,
  getYoutubeApiKey,
  hasSupabaseRuntimeConfig,
  hasYoutubeApiKey,
  publicConfig
} from '../../src/integrations/runtime-config.js'

function environment(url) {
  return deriveRuntimeEnvironment(new URL(url))
}

test('runtime environment preserves exact origins, hosts, and first query values', () => {
  assert.deepEqual(environment('http://localhost:8001/?sandbox=1'), {
    isSandbox: true,
    isInternalTest: false,
    isLocalhost: true,
    isLocalFeedbackTest: false
  })
  assert.equal(
    environment('http://127.0.0.1:8001/?sandbox=1').isSandbox,
    false
  )
  assert.equal(environment('http://localhost:8001/?sandbox').isSandbox, false)
  assert.equal(environment('http://localhost:8001/?sandbox=01').isSandbox, false)
  assert.equal(environment('http://localhost:8001/?sandbox=%31').isSandbox, true)
  assert.equal(
    environment('http://localhost:8001/?sandbox=0&sandbox=1').isSandbox,
    false
  )
  assert.equal(
    environment('http://localhost:8001/?Sandbox=1').isSandbox,
    false
  )

  assert.equal(
    environment('https://example.com/?internal_test=1').isInternalTest,
    true
  )
  assert.equal(
    environment('https://example.com/?internal_test=true').isInternalTest,
    false
  )
  assert.equal(environment('http://localhost:8000/').isLocalFeedbackTest, true)
  assert.equal(environment('http://localhost:4173/').isLocalFeedbackTest, false)
  assert.equal(deriveRuntimeEnvironment({
    hostname: '::1',
    origin: 'http://[::1]:4173',
    search: ''
  }).isLocalhost, true)
})

test('storage keys preserve normal, internal, sandbox, and combined isolation', () => {
  const cases = [
    {
      input: { isSandbox: false, isInternalTest: false },
      storageKey: 'edenia_v1',
      configCookieKey: 'edenia_config',
      onboardingNoticeKey: 'edenia_onboarding_notice'
    },
    {
      input: { isSandbox: false, isInternalTest: true },
      storageKey: 'edenia_v1_internal_test',
      configCookieKey: 'edenia_config_internal_test',
      onboardingNoticeKey: 'edenia_onboarding_notice_internal_test'
    },
    {
      input: { isSandbox: true, isInternalTest: false },
      storageKey: 'edenia_v1_sandbox',
      configCookieKey: 'edenia_config_sandbox',
      onboardingNoticeKey: 'edenia_onboarding_notice'
    },
    {
      input: { isSandbox: true, isInternalTest: true },
      storageKey: 'edenia_v1_sandbox',
      configCookieKey: 'edenia_config_sandbox',
      onboardingNoticeKey: 'edenia_onboarding_notice_internal_test'
    }
  ]

  for (const expected of cases) {
    const keys = deriveStorageKeys(expected.input)
    assert.equal(keys.storageKey, expected.storageKey)
    assert.equal(keys.configCookieKey, expected.configCookieKey)
    assert.equal(keys.onboardingNoticeKey, expected.onboardingNoticeKey)
    assert.equal(
      keys.youtubeChannelSearchCacheKey,
      `${expected.storageKey}_youtube_channel_search_cache_v1`
    )
    assert.equal(
      keys.youtubeChannelSearchUsageKey,
      `${expected.storageKey}_youtube_channel_search_usage_v1`
    )
    assert.equal(keys.stateBackupKey, `${expected.storageKey}_backups`)
    assert.equal(
      keys.accountStudySyncOwnerKey,
      `${expected.storageKey}_account_study_sync_owner_v1`
    )
    assert.equal(
      keys.plusAuthStorageKey,
      `${expected.storageKey}_plus_auth_v1`
    )
    assert.equal(keys.accountAuthStorageKey, keys.plusAuthStorageKey)
    assert.equal(
      keys.plusEntitlementCacheKey,
      `${expected.storageKey}_plus_entitlement_cache_v1`
    )
    assert.equal(
      keys.sandboxWalkthroughAfterResetKey,
      `${expected.storageKey}_walkthrough_after_reset`
    )
  }
})

test('study guidance enables only for internal tests or an explicit release', () => {
  assert.equal(deriveStudyGuidanceEnabled({ isInternalTest: false }), false)
  assert.equal(deriveStudyGuidanceEnabled({ isInternalTest: true }), true)
  assert.equal(deriveStudyGuidanceEnabled({ isInternalTest: false }, true), true)
  assert.equal(deriveStudyGuidanceEnabled({ isInternalTest: false }, 'true'), false)
  assert.equal(deriveStudyGuidanceEnabled(null, true), true)
  assert.equal(deriveStudyGuidanceEnabled(null), false)
})

test('runtime config remains late-bound and preserves coercion and errors', () => {
  const target = {}
  assert.deepEqual(publicConfig(target), {})
  assert.equal(getYoutubeApiKey(target), '')
  assert.equal(hasYoutubeApiKey(target), false)
  assert.equal(getFreePlusEnabled(target), false)
  assert.equal(getPlusCheckoutEnabled(target), false)
  assert.equal(getAccountFeaturesRollout(target), 'off')
  assert.equal(getStudyGuidanceEnabled(target), false)
  assert.equal(getIndexedDbBackupsEnabled(target), false)
  assert.equal(getIndexedDbBackupCleanupEnabled(target), false)
  assert.equal(getSupabaseUrl(target), '')
  assert.equal(getSupabasePublishableKey(target), '')
  assert.equal(hasSupabaseRuntimeConfig(target), false)

  target.EDENIA_CONFIG = {
    youtubeApiKey: '  key-one  ',
    freePlusEnabled: true,
    plusCheckoutEnabled: true,
    accountFeaturesRollout: 'internal',
    channelVideoFormatToggleEnabled: true,
    studyGuidanceEnabled: true,
    indexedDbBackupsEnabled: true,
    indexedDbBackupCleanupEnabled: true,
    supabaseUrl: '  https://project.supabase.co  ',
    supabasePublishableKey: '  sb_publishable_test  '
  }
  assert.equal(getYoutubeApiKey(target), 'key-one')
  assert.equal(hasYoutubeApiKey(target), true)
  assert.equal(getFreePlusEnabled(target), true)
  assert.equal(getPlusCheckoutEnabled(target), true)
  assert.equal(getAccountFeaturesRollout(target), 'internal')
  assert.equal(getStudyGuidanceEnabled(target), true)
  assert.equal(getIndexedDbBackupsEnabled(target), true)
  assert.equal(getIndexedDbBackupCleanupEnabled(target), true)
  assert.equal(getSupabaseUrl(target), 'https://project.supabase.co')
  assert.equal(getSupabasePublishableKey(target), 'sb_publishable_test')
  assert.equal(hasSupabaseRuntimeConfig(target), true)

  target.EDENIA_CONFIG = {
    freePlusEnabled: 'true',
    plusCheckoutEnabled: 1,
    accountFeaturesRollout: 'unknown',
    channelVideoFormatToggleEnabled: 'true',
    studyGuidanceEnabled: 'true',
    indexedDbBackupsEnabled: 'true',
    indexedDbBackupCleanupEnabled: 1
  }
  assert.equal(getFreePlusEnabled(target), false)
  assert.equal(getPlusCheckoutEnabled(target), false)
  assert.equal(getAccountFeaturesRollout(target), 'off')
  assert.equal(getStudyGuidanceEnabled(target), false)
  assert.equal(getIndexedDbBackupsEnabled(target), false)
  assert.equal(getIndexedDbBackupCleanupEnabled(target), false)

  target.EDENIA_CONFIG = { supabaseUrl: 'https://project.supabase.co' }
  assert.equal(hasSupabaseRuntimeConfig(target), false)

  target.EDENIA_CONFIG = { youtubeApiKey: 42 }
  assert.equal(getYoutubeApiKey(target), '42')
  target.EDENIA_CONFIG = { youtubeApiKey: false }
  assert.equal(getYoutubeApiKey(target), '')

  target.EDENIA_CONFIG = {
    youtubeApiKey: {
      toString() {
        throw new Error('coercion failed')
      }
    }
  }
  assert.throws(() => getYoutubeApiKey(target), /coercion failed/)

  const throwingTarget = {}
  Object.defineProperty(throwingTarget, 'EDENIA_CONFIG', {
    get() {
      throw new Error('config getter failed')
    }
  })
  assert.throws(() => publicConfig(throwingTarget), /config getter failed/)
})
