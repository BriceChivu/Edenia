const NORMAL_STORAGE_KEY = 'edenia_v1'

export function deriveStorageKeys({ isSandbox, isInternalTest }) {
  const storageKey = isSandbox
    ? 'edenia_v1_sandbox'
    : isInternalTest
      ? 'edenia_v1_internal_test'
      : NORMAL_STORAGE_KEY

  return {
    storageKey,
    youtubeChannelSearchCacheKey:
      `${storageKey}_youtube_channel_search_cache_v1`,
    youtubeChannelSearchUsageKey:
      `${storageKey}_youtube_channel_search_usage_v1`,
    stateBackupKey: `${storageKey}_backups`,
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
