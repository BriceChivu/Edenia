import { normalizeLocale } from '../i18n/runtime.js'
import {
  normalizeTheme,
  normalizeWeeklyGoalHours
} from './config-normalization.js'

export function getDefaultHistoryView(isSandbox) {
  return isSandbox ? 'heatmap' : 'summary'
}

export function normalizeHistoryView(view, isSandbox) {
  return view === 'heatmap' || view === 'summary'
    ? view
    : getDefaultHistoryView(isSandbox)
}

export function createDefaultStateFactory({
  defaultChannels,
  defaultChannelsVersion,
  onboardingVersion,
  isSandbox,
  isDefaultChannelId,
  getBrowserDefaultLocale
}) {
  return function defaultState(
    goalHours,
    channels,
    theme,
    removedDefaultChannelIds = null,
    locale = null
  ) {
    const restoredRemovedDefaultIds = Array.isArray(removedDefaultChannelIds)
      ? removedDefaultChannelIds.filter(isDefaultChannelId)
      : null
    return {
      config: {
        weeklyGoalHours: normalizeWeeklyGoalHours(goalHours),
        theme: normalizeTheme(theme),
        locale: normalizeLocale(locale || getBrowserDefaultLocale()),
        includeShorts: true,
        shortsEnableRefetchAvailableAt: null,
        ankiEnabled: true,
        ankiDisabledAt: null,
        ankiResumeBaselines: {},
        ankiPendingResumeBaseline: null,
        historyView: getDefaultHistoryView(isSandbox),
        studyInsights: { enabled: true, collapsed: false, history: [] },
        channels: Array.isArray(channels)
          ? channels.map(channel => ({ ...channel }))
          : defaultChannels.map(channel => ({ ...channel })),
        channelShelfOrder: [],
        removedDefaultChannelIds: restoredRemovedDefaultIds || [],
        removedChannelIds: []
      },
      videos: {},
      streak: { current: 0, longest: 0, lastActivityDate: null },
      anki: {},
      cityProgress: { maxLevelIndex: 0, pendingLevelIndex: null },
      undoStack: [],
      redoStack: [],
      activityLog: [],
      lastVideoMarkedWatchedAt: null,
      lastVideoOpenedAt: null,
      totalRewatchCount: 0,
      videoWatchReminders: {},
      channelRefreshes: {},
      onboarding: {
        version: onboardingVersion,
        introSeenAt: null,
        setupCompleted: false,
        setupCompletedAt: null,
        walkthroughCompleted: false,
        walkthroughCompletedAt: null,
        levelUpGuidanceShownAt: null,
        recommendationsAppliedAt: null
      },
      noAnkiFrequentUserPrompt: {
        watchedVideoDateKeys: [],
        response: null,
        respondedAt: null
      },
      learnerProfile: {
        languages: [],
        level: null,
        selectedChannelCatalogIds: [],
        createdAt: null,
        updatedAt: null
      },
      defaultChannelsVersion
    }
  }
}
