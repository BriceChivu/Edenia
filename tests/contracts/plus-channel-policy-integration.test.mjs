import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const analyticsSource = await readFile(
  new URL('../../analytics.js', import.meta.url),
  'utf8'
)
const refreshSource = await readFile(
  new URL('../../src/state/channel-refresh-state.js', import.meta.url),
  'utf8'
)

function getFunctionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `Missing ${name}`)
  if (!nextName) return appSource.slice(start)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, start)
  assert.notEqual(end, -1, `Missing ${nextName}`)
  return appSource.slice(start, end)
}

test('load, save, and import paths normalize the persisted channel policy', () => {
  assert.match(
    getFunctionSource('normalizeLoadedState', 'normalizeStateBeforeSave'),
    /if \(normalizeTrackedChannelPolicyState\(state\)\) shouldSave = true/
  )
  assert.match(
    getFunctionSource('normalizeStateBeforeSave', 'createDefaultStateFromConfig'),
    /normalizeTrackedChannelPolicyState\(state\)/
  )
  assert.match(
    getFunctionSource('createDefaultStateFromConfig', 'roundAnalyticsNumber'),
    /fallback\.trackedChannelPolicy[\s\S]*?state\.config\.trackedChannelPolicy = fallback\.trackedChannelPolicy[\s\S]*?normalizeTrackedChannelPolicyState\(state\)/
  )
  assert.match(
    getFunctionSource('importSyncFileFromInput', 'getImportedSyncState'),
    /normalizeLoadedState\(importedState\)[\s\S]*?saveImportedState\(importedState, \{/
  )
})

test('confirmed entitlement changes reconcile before persistence and rendering', () => {
  const updateSource = getFunctionSource(
    'updatePlusEntitlementState',
    'reconcileTrackedChannelPolicyState'
  )
  assert.match(
    updateSource,
    /plusAccessPolicy = createPlusAccessPolicy\([\s\S]*?reconcileTrackedChannelPolicyState\(\s*state,\s*plusAccessPolicy\s*\)[\s\S]*?saveState\(state, \{[\s\S]*?renderAll\(state\)[\s\S]*?scheduleYoutubeAutoRefresh\(state\)/
  )

  const reconcileSource = getFunctionSource(
    'reconcileTrackedChannelPolicyState',
    'getPlusAccountStatusView'
  )
  assert.match(
    reconcileSource,
    /transition\.channelIdsToRemove\.forEach\(channelId => \{\s*applyChannelRemoval\(state, channelId, \{ preserveManualVideos: true \}\)\s*\}\)/
  )
  assert.match(
    reconcileSource,
    /if \(transition\.channelIdsToRemove\.length\) \{\s*normalizeChannelRefreshState\(state\)\s*\}/
  )
})

test('manual video additions track and refresh channels only when policy allows it', () => {
  const addSource = getFunctionSource(
    'addVideoFromUrl',
    'normalizeCuratedChannelSearchText'
  )
  assert.match(
    addSource,
    /const channelWasAdded = shouldTrackManualVideoChannel\(plusAccessPolicy\)\s*\? addTrackedYoutubeChannelToState\(s, \{/
  )
  assert.match(
    addSource,
    /const channelTrackingMode = channelWasAdded[\s\S]*?: 'manual-video-only'/
  )
  assert.match(
    addSource,
    /channelWasAdded,\s*channelTrackingMode,[\s\S]*?if \(channelWasAdded\) \{[\s\S]*?refreshAddedChannel\(metadata\.channelId, \{/
  )

  const historySource = getFunctionSource(
    'applyManualVideoAddActionSnapshot',
    'applyVideoStatusActionSnapshot'
  )
  assert.match(
    historySource,
    /action\.channelWasAdded[\s\S]*?shouldTrackManualVideoChannel\(plusAccessPolicy\)[\s\S]*?addTrackedYoutubeChannelToState\(s, snapshot\.channel\)/
  )
})

test('refresh state and analytics keep tracked and manual-only channels distinct', () => {
  assert.match(
    refreshSource,
    /const channelIds = new Set\(getTrackedChannelIds\(state\)\)/
  )
  assert.match(
    getFunctionSource('getEdeniaAnalyticsSnapshot', 'syncPersistedStateToAnalytics'),
    /const manualVideoOnlyChannels = getManualVideoOnlyChannels\(state\)[\s\S]*?channelPolicy: \{[\s\S]*?manualVideoOnlyChannelCount: manualVideoOnlyChannels\.length[\s\S]*?freeTrackedChannelAllowance: getFreeTrackedChannelAllowance\(state\)/
  )
  assert.match(
    getFunctionSource('getChannelFilterEntries', 'isHiddenManualVideoChannelEntry'),
    /const manualVideoOnlyChannelIds = new Set\([\s\S]*?getManualVideoOnlyChannels\(s\)[\s\S]*?!manualVideoOnlyChannelIds\.has\(key\)/
  )
  for (const property of [
    'current_manual_video_only_channel_count',
    'free_tracked_channel_allowance',
    'tracked_channel_allowance_grandfathered',
    'tracked_channel_policy_tier',
    'tracked_channel_downgrade_pending'
  ]) {
    assert.match(analyticsSource, new RegExp(`\\b${property}:`))
  }
})
