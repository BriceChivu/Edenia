import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDefaultStateFactory,
  getDefaultHistoryView,
  normalizeHistoryView
} from '../../src/state/default-state.js'

function fixture(isSandbox = false) {
  const defaultChannels = [
    { id: 'default-one', nested: { retained: true } },
    { id: 'default-two' }
  ]
  let browserLocaleCalls = 0
  const defaultState = createDefaultStateFactory({
    defaultChannels,
    defaultChannelsVersion: 2,
    onboardingVersion: 2,
    isSandbox,
    isDefaultChannelId: id => defaultChannels.some(channel => channel.id === id),
    getBrowserDefaultLocale() {
      browserLocaleCalls += 1
      return 'fr'
    }
  })
  return {
    defaultChannels,
    defaultState,
    get browserLocaleCalls() {
      return browserLocaleCalls
    }
  }
}

test('history-view defaults preserve sandbox and explicit selections', () => {
  assert.equal(getDefaultHistoryView(false), 'summary')
  assert.equal(getDefaultHistoryView(true), 'heatmap')
  assert.equal(normalizeHistoryView('summary', true), 'summary')
  assert.equal(normalizeHistoryView('heatmap', false), 'heatmap')
  assert.equal(normalizeHistoryView('invalid', false), 'summary')
  assert.equal(normalizeHistoryView(null, true), 'heatmap')
})

test('default state preserves the complete normal-mode schema and defaults', () => {
  const context = fixture(false)
  const state = context.defaultState(undefined, undefined, undefined)
  assert.deepEqual(state, {
    config: {
      weeklyGoalHours: 4,
      theme: 'light',
      locale: 'fr',
      includeShorts: true,
      shortsEnableRefetchAvailableAt: null,
      ankiEnabled: true,
      ankiDisabledAt: null,
      ankiResumeBaselines: {},
      ankiPendingResumeBaseline: null,
      historyView: 'summary',
      studyInsights: { enabled: true, collapsed: false, history: [] },
      channels: [
        { id: 'default-one', nested: { retained: true } },
        { id: 'default-two' }
      ],
      trackedChannelPolicy: {
        version: 1,
        freeAllowance: 5,
        grandfatheredAt: null,
        lastConfirmedTier: null,
        downgradePending: false
      },
      channelShelfOrder: [],
      removedDefaultChannelIds: [],
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
    channelRefreshes: {},
    onboarding: {
      version: 2,
      introSeenAt: null,
      accountStepReachedAt: null,
      setupCompleted: false,
      setupCompletedAt: null,
      walkthroughCompleted: false,
      walkthroughCompletedAt: null,
      levelUpGuidanceShownAt: null,
      recommendationsAppliedAt: null,
      starterFeed: {
        status: 'idle',
        catalogIds: [],
        processedCatalogIds: [],
        failedCatalogIds: [],
        addedChannelCount: 0,
        mergedVideoCount: 0,
        skippedShortCount: 0,
        queuedAt: null,
        startedAt: null,
        completedAt: null
      }
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
    defaultChannelsVersion: 2
  })
  assert.equal(context.browserLocaleCalls, 1)
  assert.notEqual(state.config.channels, context.defaultChannels)
  assert.notEqual(state.config.channels[0], context.defaultChannels[0])
  assert.equal(
    state.config.channels[0].nested,
    context.defaultChannels[0].nested
  )
})

test('default state preserves explicit values, filtering, and sandbox defaults', () => {
  const context = fixture(true)
  const channels = [{ id: 'custom', nested: { shared: true } }]
  const state = context.defaultState(
    '100',
    channels,
    'dark',
    ['invalid', 'default-two', 'default-two'],
    'zh-TW'
  )
  assert.equal(state.config.weeklyGoalHours, 99)
  assert.equal(state.config.theme, 'dark')
  assert.equal(state.config.locale, 'zh-Hant')
  assert.equal(state.config.historyView, 'heatmap')
  assert.deepEqual(
    state.config.removedDefaultChannelIds,
    ['default-two', 'default-two']
  )
  assert.deepEqual(state.config.channels, channels)
  assert.notEqual(state.config.channels, channels)
  assert.notEqual(state.config.channels[0], channels[0])
  assert.equal(state.config.channels[0].nested, channels[0].nested)
  assert.equal(context.browserLocaleCalls, 0)
})

test('separate default states do not share mutable state containers', () => {
  const { defaultState } = fixture(false)
  const first = defaultState(4)
  const second = defaultState(4)
  first.videos.one = {}
  first.config.studyInsights.history.push({})
  first.undoStack.push({})
  assert.deepEqual(second.videos, {})
  assert.deepEqual(second.config.studyInsights.history, [])
  assert.deepEqual(second.undoStack, [])
})
