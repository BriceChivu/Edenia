(function initializeAnalytics() {
  const ANALYTICS_STATE_KEY = window.EDENIA_INTERNAL_TEST
    ? 'edenia_posthog_state_internal_test_v2'
    : 'edenia_posthog_state_v2';
  const ANALYTICS_SCHEMA_VERSION = 3;

  function analyticsAvailable() {
    return Boolean(
      window.EDENIA_ANALYTICS_ENABLED
      && window.posthog
      && typeof window.posthog.capture === 'function'
    );
  }

  function capture(eventName, properties) {
    if (!analyticsAvailable()) return false;
    window.posthog.capture(eventName, properties);
    return true;
  }

  function setPersonProperties(properties, propertiesOnce) {
    if (!analyticsAvailable() || typeof window.posthog.setPersonProperties !== 'function') return false;
    window.posthog.setPersonProperties(properties, propertiesOnce);
    return true;
  }

  function getSessionReplayUrl() {
    if (!analyticsAvailable() || typeof window.posthog.get_session_replay_url !== 'function') return null;
    return window.posthog.get_session_replay_url() || null;
  }

  function loadAnalyticsState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ANALYTICS_STATE_KEY) || 'null');
      if (!parsed || parsed.schemaVersion !== ANALYTICS_SCHEMA_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveAnalyticsState(state) {
    try {
      localStorage.setItem(ANALYTICS_STATE_KEY, JSON.stringify(state));
    } catch {}
  }

  function valuesMatch(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function toObjectMap(items, keyName) {
    return (Array.isArray(items) ? items : []).reduce((map, item) => {
      const key = String(item?.[keyName] || '');
      if (key) map[key] = item;
      return map;
    }, {});
  }

  function getYoutubeVideoUrl(video) {
    const videoId = String(video?.id || '');
    return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : '';
  }

  function getPersonProperties(snapshot) {
    const channels = Array.isArray(snapshot.channels) ? snapshot.channels : [];
    const channelPolicy = snapshot.channelPolicy || {};
    const watchedVideos = Array.isArray(snapshot.watchedVideos) ? snapshot.watchedVideos : [];
    const favoriteVideos = Array.isArray(snapshot.favoriteVideos) ? snapshot.favoriteVideos : [];
    const videoState = snapshot.videoState || {};
    const settings = snapshot.settings || {};
    const streak = snapshot.streak || {};
    const town = snapshot.town || {};
    const studyDays = Array.isArray(snapshot.studyDays) ? snapshot.studyDays : [];
    const sortedStudyDates = studyDays
      .map(day => day.date)
      .filter(Boolean)
      .sort();
    const lastStudyDate = sortedStudyDates.length
      ? sortedStudyDates[sortedStudyDates.length - 1]
      : null;

    return {
      $internal_or_test_user: Boolean(window.EDENIA_INTERNAL_TEST),
      current_channel_ids: channels.map(channel => channel.id),
      current_channel_names: channels.map(channel => channel.name),
      current_channel_count: channels.length,
      current_manual_video_only_channel_count: channelPolicy.manualVideoOnlyChannelCount || 0,
      free_tracked_channel_allowance: channelPolicy.freeTrackedChannelAllowance || 5,
      tracked_channel_allowance_grandfathered: Boolean(channelPolicy.grandfathered),
      tracked_channel_policy_tier: channelPolicy.lastConfirmedTier || null,
      tracked_channel_downgrade_pending: Boolean(channelPolicy.downgradePending),
      current_watched_video_urls: watchedVideos.map(getYoutubeVideoUrl).filter(Boolean),
      current_watched_video_count: watchedVideos.length,
      current_favorite_video_urls: favoriteVideos.map(getYoutubeVideoUrl).filter(Boolean),
      current_favorite_video_count: favoriteVideos.length,
      current_watch_later_video_count: videoState.watchLaterCount || 0,
      current_partial_video_count: videoState.partialCount || 0,
      current_resumable_video_count: videoState.resumableCount || 0,
      current_removed_video_count: videoState.removedFromFeedCount || 0,
      total_rewatch_count: videoState.totalRewatchCount || 0,
      last_video_opened_at: videoState.lastVideoOpenedAt || null,
      last_successful_refresh_at: videoState.lastSuccessfulRefreshAt || null,
      current_streak_days: streak.currentDays || 0,
      longest_streak_days: streak.longestDays || 0,
      last_streak_activity_date: streak.lastActivityDate || null,
      last_study_date: lastStudyDate,
      current_town_level: (town.visibleLevelIndex || 0) + 1,
      earned_town_level: (town.earnedLevelIndex || 0) + 1,
      pending_town_level: Number.isInteger(town.pendingLevelIndex)
        ? town.pendingLevelIndex + 1
        : null,
      town_has_pending_level: Boolean(town.hasPendingLevel),
      total_study_score: town.totalStudyScore || 0,
      locale: settings.locale || 'en',
      theme: settings.theme || 'light',
      weekly_goal_hours: settings.weeklyGoalHours || 0,
      include_short_videos: Boolean(settings.includeShortVideos),
      anki_enabled: Boolean(settings.ankiEnabled),
      study_insights_enabled: Boolean(settings.studyInsightsEnabled),
      history_view: settings.historyView || 'summary',
      channel_shelf_order: settings.channelShelfOrder || [],
      learning_languages: settings.learningLanguages || [],
      learner_level: settings.learnerLevel || null,
      onboarding_completed: Boolean(settings.onboardingCompleted),
      walkthrough_completed: Boolean(settings.walkthroughCompleted)
    };
  }

  function syncPersonProperties(snapshot, analyticsState) {
    if (!window.posthog || typeof window.posthog.setPersonProperties !== 'function') return;
    const personProperties = getPersonProperties(snapshot);
    if (valuesMatch(analyticsState.personProperties, personProperties)) return;

    window.posthog.setPersonProperties(
      personProperties,
      { edenia_analytics_profile_created_at: snapshot.capturedAt }
    );
    analyticsState.personProperties = personProperties;
  }

  function syncChannels(snapshot, analyticsState, isInitialSync) {
    const previousChannels = analyticsState.channels || {};
    const currentChannels = toObjectMap(snapshot.channels, 'id');

    if (isInitialSync) {
      Object.values(currentChannels).forEach(channel => {
        capture('channel_present_at_first_sync', {
          channel_id: channel.id,
          channel_name: channel.name,
          added_at: channel.addedAt || null,
          added_at_source: channel.addedAtSource || 'first_sync',
          added_at_known: Boolean(channel.addedAt)
        });
      });
    } else {
      Object.entries(currentChannels).forEach(([channelId, channel]) => {
        if (previousChannels[channelId]) return;
        capture('channel_added', {
          channel_id: channel.id,
          channel_name: channel.name,
          added_at: snapshot.capturedAt,
          source: 'state_change',
          total_channel_count: Object.keys(currentChannels).length
        });
      });

      Object.entries(previousChannels).forEach(([channelId, channel]) => {
        if (currentChannels[channelId]) return;
        capture('channel_removed', {
          channel_id: channel.id,
          channel_name: channel.name,
          removed_at: snapshot.capturedAt,
          source: 'state_change',
          total_channel_count: Object.keys(currentChannels).length
        });
      });
    }

    analyticsState.channels = currentChannels;
  }

  function emptyStudyDay(date) {
    return {
      date,
      videoSeconds: 0,
      videosWatched: 0,
      ankiReviewed: 0,
      ankiCreated: 0,
      rawPoints: 0,
      points: 0,
      qualifiesForStreak: false
    };
  }

  function syncStudyDays(snapshot, analyticsState, isInitialSync) {
    const previousDays = analyticsState.studyDays || {};
    const currentDays = toObjectMap(snapshot.studyDays, 'date');
    const allDates = new Set([...Object.keys(previousDays), ...Object.keys(currentDays)]);

    allDates.forEach(date => {
      const previousDay = previousDays[date] || emptyStudyDay(date);
      const currentDay = currentDays[date] || emptyStudyDay(date);
      if (!isInitialSync && valuesMatch(previousDay, currentDay)) return;

      capture('study_day_updated', {
        study_date: date,
        video_seconds_total: currentDay.videoSeconds,
        video_seconds_delta: currentDay.videoSeconds - previousDay.videoSeconds,
        videos_watched_total: currentDay.videosWatched,
        videos_watched_delta: currentDay.videosWatched - previousDay.videosWatched,
        anki_reviews_total: currentDay.ankiReviewed,
        anki_reviews_delta: currentDay.ankiReviewed - previousDay.ankiReviewed,
        anki_cards_created_total: currentDay.ankiCreated,
        anki_cards_created_delta: currentDay.ankiCreated - previousDay.ankiCreated,
        raw_points_total: currentDay.rawPoints,
        points_total: currentDay.points,
        points_delta: currentDay.rawPoints - previousDay.rawPoints,
        qualifies_for_streak: currentDay.qualifiesForStreak,
        current_streak_days: snapshot.streak?.currentDays || 0,
        longest_streak_days: snapshot.streak?.longestDays || 0,
        update_reason: isInitialSync
          ? 'initial_backfill'
          : (currentDays[date] ? 'state_change' : 'activity_removed')
      });
    });

    analyticsState.studyDays = currentDays;
  }

  function getWatchedVideoEventProperties(video, updateReason) {
    return {
      video_url: getYoutubeVideoUrl(video),
      video_title: video.title || null,
      channel_id: video.channelId || null,
      watched_at: video.watchedAt || null,
      duration_seconds: video.durationSeconds || 0,
      video_source: video.source || 'channel',
      is_short: Boolean(video.isShort),
      update_reason: updateReason
    };
  }

  function syncWatchedVideos(snapshot, analyticsState, isInitialSync) {
    const previousVideos = analyticsState.watchedVideos || {};
    const currentVideos = toObjectMap(snapshot.watchedVideos, 'id');
    const isInitialWatchedSync = isInitialSync
      || !Object.prototype.hasOwnProperty.call(analyticsState, 'watchedVideos');

    Object.entries(currentVideos).forEach(([videoId, video]) => {
      if (!isInitialWatchedSync && previousVideos[videoId]) return;
      capture('video_marked_watched', getWatchedVideoEventProperties(
        video,
        isInitialWatchedSync ? 'initial_backfill' : 'state_change'
      ));
    });

    if (!isInitialWatchedSync) {
      Object.entries(previousVideos).forEach(([videoId, video]) => {
        if (currentVideos[videoId]) return;
        capture('video_marked_unwatched', {
          ...getWatchedVideoEventProperties(video, 'state_change'),
          unwatched_at: snapshot.capturedAt
        });
      });
    }

    analyticsState.watchedVideos = currentVideos;
  }

  function getStudyInsightEventProperties(insight, updateReason) {
    return {
      insight_key: insight.key,
      insight_id: insight.insightId,
      insight_type: insight.type,
      insight_variant: insight.variant || 0,
      message_title: insight.title || '',
      message_body: insight.body || '',
      message_evidence: insight.evidence || '',
      message_locale: insight.locale || 'en',
      recorded_at: insight.recordedAt || null,
      time_window: insight.windowId || null,
      weekday_index: Number.isInteger(insight.weekdayIndex) ? insight.weekdayIndex : null,
      percent: insight.percent || 0,
      comparison_percent: insight.comparisonPercent || 0,
      recent_minutes: insight.recentMinutes || 0,
      previous_minutes: insight.previousMinutes || 0,
      suggested_minutes: insight.suggestedMinutes || 0,
      gap_days: insight.gapDays || 0,
      active_days: insight.activeDays || 0,
      anki_days: insight.ankiDays || 0,
      reviewed_cards: insight.reviewedCards || 0,
      anki_cards_created: insight.ankiCreated || 0,
      total_seconds: insight.totalSeconds || 0,
      video_count: insight.videoCount || 0,
      top_video_title: insight.topVideoTitle || '',
      top_video_seconds: insight.topVideoSeconds || 0,
      channel_breakdown: insight.channelBreakdown || [],
      observation_days: insight.observationDays || 0,
      update_reason: updateReason
    };
  }

  function syncStudyInsights(snapshot, analyticsState, isInitialSync) {
    const previousInsights = analyticsState.studyInsights || {};
    const currentInsights = toObjectMap(snapshot.studyInsights, 'key');
    const isInitialInsightsSync = isInitialSync
      || !Object.prototype.hasOwnProperty.call(analyticsState, 'studyInsights');

    Object.entries(currentInsights).forEach(([insightKey, insight]) => {
      const previousInsight = previousInsights[insightKey];
      if (!isInitialInsightsSync && previousInsight && valuesMatch(previousInsight, insight)) return;
      capture('study_insight_message_recorded', getStudyInsightEventProperties(
        insight,
        isInitialInsightsSync ? 'initial_backfill' : (previousInsight ? 'message_updated' : 'new_message')
      ));
    });

    analyticsState.studyInsights = currentInsights;
  }

  function syncStreak(snapshot, analyticsState, isInitialSync) {
    const currentStreak = snapshot.streak || {};
    const previousStreak = analyticsState.streak || null;
    if (!isInitialSync && valuesMatch(previousStreak, currentStreak)) return;

    capture('streak_updated', {
      current_streak_days: currentStreak.currentDays || 0,
      longest_streak_days: currentStreak.longestDays || 0,
      last_activity_date: currentStreak.lastActivityDate || null,
      previous_current_streak_days: previousStreak?.currentDays ?? null,
      previous_longest_streak_days: previousStreak?.longestDays ?? null,
      update_reason: isInitialSync ? 'initial_snapshot' : 'state_change'
    });
    analyticsState.streak = currentStreak;
  }

  function syncTown(snapshot, analyticsState, isInitialSync) {
    const currentTown = snapshot.town || {};
    const previousTown = analyticsState.town || null;
    if (!isInitialSync && valuesMatch(previousTown, currentTown)) return;

    capture('town_level_updated', {
      visible_town_level: (currentTown.visibleLevelIndex || 0) + 1,
      earned_town_level: (currentTown.earnedLevelIndex || 0) + 1,
      pending_town_level: Number.isInteger(currentTown.pendingLevelIndex)
        ? currentTown.pendingLevelIndex + 1
        : null,
      has_pending_level: Boolean(currentTown.hasPendingLevel),
      total_study_score: currentTown.totalStudyScore || 0,
      previous_visible_town_level: previousTown
        ? (previousTown.visibleLevelIndex || 0) + 1
        : null,
      update_reason: isInitialSync ? 'initial_snapshot' : 'state_change'
    });
    analyticsState.town = currentTown;
  }

  function syncSettings(snapshot, analyticsState, isInitialSync) {
    const currentSettings = snapshot.settings || {};
    const previousSettings = analyticsState.settings || {};

    if (isInitialSync) {
      capture('settings_snapshot', {
        ...currentSettings,
        sync_reason: 'initial_snapshot'
      });
    } else {
      const keys = new Set([...Object.keys(previousSettings), ...Object.keys(currentSettings)]);
      keys.forEach(settingName => {
        const previousValue = previousSettings[settingName] ?? null;
        const currentValue = currentSettings[settingName] ?? null;
        if (valuesMatch(previousValue, currentValue)) return;
        capture('setting_changed', {
          setting_name: settingName,
          previous_value: previousValue,
          new_value: currentValue
        });
      });
    }

    analyticsState.settings = currentSettings;
  }

  function syncStateSnapshot(snapshot) {
    if (!analyticsAvailable() || !snapshot || typeof snapshot !== 'object') return;

    const existingState = loadAnalyticsState();
    const isInitialSync = !existingState;
    const analyticsState = existingState || {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      initializedAt: snapshot.capturedAt,
      channels: {},
      studyDays: {}
    };

    syncPersonProperties(snapshot, analyticsState);
    syncChannels(snapshot, analyticsState, isInitialSync);
    syncWatchedVideos(snapshot, analyticsState, isInitialSync);
    syncStudyInsights(snapshot, analyticsState, isInitialSync);
    syncStudyDays(snapshot, analyticsState, isInitialSync);
    syncStreak(snapshot, analyticsState, isInitialSync);
    syncTown(snapshot, analyticsState, isInitialSync);
    syncSettings(snapshot, analyticsState, isInitialSync);

    if (isInitialSync) {
      capture('analytics_profile_initialized', {
        channel_count: snapshot.channels?.length || 0,
        manual_video_only_channel_count: snapshot.channelPolicy?.manualVideoOnlyChannelCount || 0,
        free_tracked_channel_allowance: snapshot.channelPolicy?.freeTrackedChannelAllowance || 5,
        watched_video_count: snapshot.watchedVideos?.length || 0,
        favorite_video_count: snapshot.favoriteVideos?.length || 0,
        watch_later_video_count: snapshot.videoState?.watchLaterCount || 0,
        partial_video_count: snapshot.videoState?.partialCount || 0,
        resumable_video_count: snapshot.videoState?.resumableCount || 0,
        removed_video_count: snapshot.videoState?.removedFromFeedCount || 0,
        total_rewatch_count: snapshot.videoState?.totalRewatchCount || 0,
        study_insight_message_count: snapshot.studyInsights?.length || 0,
        study_day_count: snapshot.studyDays?.length || 0,
        current_streak_days: snapshot.streak?.currentDays || 0,
        current_town_level: (snapshot.town?.visibleLevelIndex || 0) + 1,
        walkthrough_completed: Boolean(snapshot.settings?.walkthroughCompleted)
      });
    }

    analyticsState.lastSyncedAt = snapshot.capturedAt;
    saveAnalyticsState(analyticsState);
  }

  window.trackEdeniaEvent = capture;
  window.setEdeniaPersonProperties = setPersonProperties;
  window.getEdeniaSessionReplayUrl = getSessionReplayUrl;
  window.syncEdeniaAnalyticsState = syncStateSnapshot;

  function normalizeClickEventName(action) {
    return String(action || '')
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
      .slice(0, 80);
  }

  function getControlClickDetails(control) {
    const translatedChild = control.querySelector('[data-i18n]');
    const inlineHandler = control.getAttribute('onclick') || '';
    const handlerName = inlineHandler.match(/^\s*([a-zA-Z_$][\w$]*)\s*\(/)?.[1] || '';
    const visibleLabel = String(
      control.dataset.analyticsLabel
      || control.getAttribute('aria-label')
      || control.getAttribute('title')
      || control.textContent
      || ''
    ).trim().replace(/\s+/g, ' ');
    const action = control.dataset.analyticsAction
      || control.dataset.i18n
      || translatedChild?.dataset.i18n
      || control.dataset.i18nAriaLabel
      || control.dataset.i18nTitle
      || control.id
      || handlerName
      || visibleLabel;

    return {
      action,
      eventName: normalizeClickEventName(action),
      visibleLabel
    };
  }

  document.addEventListener('click', event => {
    const control = event.target.closest('button, a');
    if (!control || control.disabled) return;

    const { action, eventName, visibleLabel } = getControlClickDetails(control);
    if (!eventName) return;

    capture(`${eventName}_clicked`, {
      action,
      button_name: visibleLabel || action,
      control_type: control.tagName.toLowerCase()
    });
  });
})();
