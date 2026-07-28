export const LEGACY_ACTION_NAMES = Object.freeze([
  'addYoutubeInput',
  'applyHistoryAction',
  'cancelVideoSetAsidePrompt',
  'changeIntroLocale',
  'changeOnboardingLocale',
  'clearCityWaveformPreview',
  'clearVideoPausedState',
  'closeHistoryActionPopovers',
  'closeHistoryPointsPopoverSoon',
  'closeHistoryVideoPopoverSoon',
  'closeManualVideoPopover',
  'closeStatusFilterMenu',
  'closeVideoSearchPopover',
  'closeVideoShelfPreviewAfterFocus',
  'confirmVideoSetAsidePrompt',
  'confirmVideoWatchPrompt',
  'continuePersonalizedOnboardingFromLanguage',
  'copyOnboardingRecoveryLink',
  'dismissVideoWatchPrompt',
  'dropChannelShelf',
  'exportSyncFile',
  'favoriteVideoFromWatchPrompt',
  'finishChannelShelfDrag',
  'finishIntroTrailer',
  'finishPersonalizedOnboarding',
  'focusNextStudyVideoCard',
  'handleChannelFilterOptionClick',
  'handleChannelFilterSelectAllClick',
  'handleCityWaveformMouseMove',
  'handleHistoryActionScrollHover',
  'handleManualChannelSuggestionKeydown',
  'handleVideoSearchInputKey',
  'handleVideoSetAsidePromptKeydown',
  'handleVideoThumbnailClick',
  'hideHeatmapTooltip',
  'importSyncFileFromInput',
  'jumpToWatchedVideo',
  'leaveChannelShelfDrag',
  'markVideo',
  'moveChannelShelfDrag',
  'navigateIntroTrailer',
  'openHistoryPointsPopover',
  'openHistoryVideoPopover',
  'openNextStudyVideoPlayer',
  'openVideoShelfPreview',
  'openVideoShelfPreviewFromFocus',
  'positionHeatmapTooltip',
  'previewCityWaveBar',
  'queueVideoShelfPreviewClose',
  'removeChannel',
  'removeChannelFromFilter',
  'renderManualChannelSuggestions',
  'renderVideoSearchResults',
  'requestVideoSetAside',
  'resetApp',
  'restoreStateBackup',
  'retryOnboardingRecovery',
  'saveSettingsOnTheFly',
  'scrollVideoChannelShelf',
  'searchYoutubeChannels',
  'selectCityWaveBar',
  'selectIntroCityLevel',
  'selectManualChannelSuggestion',
  'selectOnboardingLanguage',
  'selectOnboardingLevel',
  'selectYoutubeChannelSearchResult',
  'setAllChannelFilters',
  'setChannelFilter',
  'setPersonalizedOnboardingStep',
  'setStatusFilter',
  'showHeatmapTooltip',
  'startChannelShelfDrag',
  'startTouchChannelShelfDrag',
  'stopHistoryActionAutoScroll',
  'syncVideoChannelShelfControls',
  'toggleHeatmapTooltip',
  'toggleHistoryActionPopover',
  'toggleHistoryPeriodPopover',
  'toggleHistoryPointsPopover',
  'toggleHistoryVideoPopover',
  'toggleIntroLocaleMenu',
  'toggleIntroSound',
  'toggleManualVideoPopover',
  'toggleOnboardingChannel',
  'toggleOnboardingLocaleMenu',
  'toggleStatusFilterMenu',
  'toggleVideoFavorite',
  'toggleVideoSearchPopover',
  'toggleVideoShelfPreviewOnTouch'
])

export function installLegacyActions(target, actions) {
  if (!target || !['object', 'function'].includes(typeof target)) {
    throw new TypeError('Legacy actions require a global object target')
  }
  if (!actions || typeof actions !== 'object') {
    throw new TypeError('Legacy actions require an action map')
  }

  const actionNames = Object.keys(actions).sort()
  if (JSON.stringify(actionNames) !== JSON.stringify(LEGACY_ACTION_NAMES)) {
    throw new Error(
      `Legacy action map differs from its manifest: ${JSON.stringify(actionNames)}`
    )
  }

  for (const actionName of LEGACY_ACTION_NAMES) {
    const action = actions[actionName]
    if (typeof action !== 'function') {
      throw new TypeError(`Legacy action ${actionName} must be a function`)
    }
    if (
      Object.prototype.hasOwnProperty.call(target, actionName)
      && target[actionName] !== action
    ) {
      throw new Error(`Refusing to replace existing global action ${actionName}`)
    }
  }

  if (Object.prototype.hasOwnProperty.call(target, 'EdeniaActions')) {
    throw new Error('Refusing to replace existing EdeniaActions namespace')
  }

  const publicActions = Object.freeze({ ...actions })
  Object.defineProperty(target, 'EdeniaActions', {
    configurable: false,
    enumerable: true,
    value: publicActions,
    writable: false
  })

  for (const actionName of LEGACY_ACTION_NAMES) {
    if (target[actionName] !== publicActions[actionName]) {
      target[actionName] = publicActions[actionName]
    }
  }

  return publicActions
}
