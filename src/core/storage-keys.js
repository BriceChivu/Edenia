const NORMAL_STORAGE_KEY = 'edenia_v1'

export function deriveStorageKeys({ isSandbox, isInternalTest }) {
  const storageKey = isSandbox
    ? 'edenia_v1_sandbox'
    : isInternalTest
      ? 'edenia_v1_internal_test'
      : NORMAL_STORAGE_KEY
  const accountAuthStorageKey = `${storageKey}_plus_auth_v1`

  return {
    storageKey,
    accountStudySyncOwnerKey: `${storageKey}_account_study_sync_owner_v1`,
    youtubeChannelSearchCacheKey:
      `${storageKey}_youtube_channel_search_cache_v1`,
    youtubeChannelSearchUsageKey:
      `${storageKey}_youtube_channel_search_usage_v1`,
    stateBackupKey: `${storageKey}_backups`,
    legacyProgressMigrationKey:
      `${storageKey}_legacy_progress_migration_v1`,
    accountAuthStorageKey,
    plusAuthStorageKey: accountAuthStorageKey,
    plusEntitlementCacheKey: `${storageKey}_plus_entitlement_cache_v1`,
    sandboxWalkthroughAfterResetKey:
      `${storageKey}_walkthrough_after_reset`,
    onboardingNoticeKey: isInternalTest
      ? 'edenia_onboarding_notice_internal_test'
      : 'edenia_onboarding_notice',
    configCookieKey: isSandbox
      ? 'edenia_config_sandbox'
      : isInternalTest
        ? 'edenia_config_internal_test'
        : 'edenia_config'
  }
}
