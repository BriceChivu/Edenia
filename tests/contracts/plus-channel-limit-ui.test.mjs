import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { I18N, SUPPORTED_LOCALES } from '../../src/i18n/index.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const markup = await readFile(
  new URL('../../index.html', import.meta.url),
  'utf8'
)

function getFunctionSource(name, nextName) {
  const start = appSource.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `Missing ${name}`)
  if (!nextName) return appSource.slice(start)
  const endCandidates = [
    appSource.indexOf(`\nfunction ${nextName}(`, start),
    appSource.indexOf(`\nasync function ${nextName}(`, start)
  ].filter(index => index >= 0)
  const end = endCandidates.length ? Math.min(...endCandidates) : -1
  assert.notEqual(end, -1, `Missing ${nextName}`)
  return appSource.slice(start, end)
}

test('every direct and catalog channel addition passes the shared policy gate', () => {
  const addSource = getFunctionSource('addChannel', 'addChannelFromFilter')
  const gateIndex = addSource.indexOf('requestTrackedChannelAddition(s, id)')
  const mutationIndex = addSource.indexOf('addTrackedYoutubeChannelToState(s, { id, name')
  const refreshIndex = addSource.indexOf('refreshAddedChannel(id)')
  assert.ok(gateIndex > -1)
  assert.ok(mutationIndex > gateIndex)
  assert.ok(refreshIndex > mutationIndex)

  const inputSource = getFunctionSource('addYoutubeInput', 'openNextStudyVideoPlayer')
  assert.match(inputSource, /parseYoutubeChannelInput\(rawUrl\)[\s\S]*?await addChannel\(\{/)
  assert.match(inputSource, /addCuratedChannelSuggestion\(catalogMatch\.id\)/)

  const curatedSource = getFunctionSource(
    'addCuratedChannelSuggestion',
    'selectManualChannelSuggestion'
  )
  assert.match(curatedSource, /await addChannel\(\{[\s\S]*?resolvedChannel:/)
  assert.match(curatedSource, /await addChannel\(\{[\s\S]*?source: 'curated_catalog'/)

  const youtubeSource = getFunctionSource(
    'selectYoutubeChannelSearchResult',
    'addYoutubeInput'
  )
  assert.match(youtubeSource, /await addChannel\(\{[\s\S]*?resolvedChannel: result/)
})

test('search results expose policy status without disabling mouse or keyboard activation', () => {
  const catalogSource = getFunctionSource(
    'renderManualChannelSuggestions',
    'getYoutubeChannelSearchDateKey'
  )
  const youtubeSource = getFunctionSource(
    'renderYoutubeChannelSearchResults',
    'renderYoutubeChannelSearchMessage'
  )
  for (const source of [catalogSource, youtubeSource]) {
    assert.match(source, /getTrackedChannelSuggestionAccess\(/)
    assert.match(source, /is-plus-restricted/)
    assert.match(source, /data-channel-access=/)
    assert.doesNotMatch(source, /\sdisabled(?:=|>)/)
  }
  assert.match(
    getFunctionSource('handleManualChannelSuggestionKeydown', 'addCuratedChannelSuggestion'),
    /event\.key === 'Enter'[\s\S]*?selectYoutubeChannelSearchResult[\s\S]*?selectManualChannelSuggestion/
  )
})

test('onboarding preselects and background-applies only channels inside the current allowance', () => {
  assert.match(
    getFunctionSource('prepareOnboardingChannelSelections', 'getOnboardingChannelSelectionLimit'),
    /slice\(0, getOnboardingChannelSelectionLimit\(\)\)/
  )
  assert.match(
    getFunctionSource('toggleOnboardingChannel', 'resolveCuratedChannelEntry'),
    /selectionLimit < ONBOARDING_CHANNEL_SELECTION_LIMIT[\s\S]*?showTrackedChannelAddRestriction/
  )
  const preparationSource = getFunctionSource(
    'prepareStarterFeedChannel',
    'runPendingStarterFeedPreparation'
  )
  const snapshotPreflightIndex = preparationSource.indexOf(
    'getStarterChannelAddDecision(snapshot, [channel])'
  )
  const fetchIndex = preparationSource.indexOf('await fetchChannelVideos(', snapshotPreflightIndex)
  const latestPreflightIndex = preparationSource.indexOf(
    'getStarterChannelAddDecision(latestState, [channel])',
    fetchIndex
  )
  const mutationIndex = preparationSource.indexOf(
    'addResolvedStarterChannel(latestState, channel)',
    latestPreflightIndex
  )
  assert.ok(snapshotPreflightIndex > -1)
  assert.ok(fetchIndex > snapshotPreflightIndex)
  assert.ok(latestPreflightIndex > fetchIndex)
  assert.ok(mutationIndex > latestPreflightIndex)
})

test('blocked channel restoration leaves undo history and user state untouched', () => {
  const source = getFunctionSource('applyHistoryAction', 'applyChannelRemoveActionSnapshot')
  const gateIndex = source.indexOf('requestTrackedChannelAddition(s, action.channelId)')
  const spliceIndex = source.indexOf('sourceStack.splice(index, 1)')
  const restoreIndex = source.indexOf('applyChannelRemoveActionSnapshot(')
  assert.ok(gateIndex > -1)
  assert.ok(spliceIndex > gateIndex)
  assert.ok(restoreIndex > spliceIndex)
})

test('manual videos remain available to Free users without tracking their channel', () => {
  const addSource = getFunctionSource('addVideoFromUrl', 'normalizeCuratedChannelSearchText')
  assert.match(
    addSource,
    /shouldTrackManualVideoChannel\(plusAccessPolicy\)[\s\S]*?: false/
  )
  const redoSource = getFunctionSource(
    'applyManualVideoAddActionSnapshot',
    'applyVideoStatusActionSnapshot'
  )
  assert.match(
    redoSource,
    /shouldTrackManualVideoChannel\(plusAccessPolicy\)[\s\S]*?addTrackedYoutubeChannelToState/
  )
})

test('feed and downgrade notices explain channel access in every locale', () => {
  assert.match(markup, /id="manualVideoChannelAccess"[^>]*role="status"/)
  assert.match(
    getFunctionSource('showTrackedChannelAddRestriction', 'requestTrackedChannelAddition'),
    /PLUS_FEATURE_IDS\.UNLIMITED_TRACKED_CHANNELS/
  )
  assert.match(
    getFunctionSource('reconcileTrackedChannelPolicyState', 'showTrackedChannelDowngradeNotice'),
    /removedChannels[\s\S]*?applyChannelRemoval\(state, channelId, \{ preserveManualVideos: true \}\)/
  )

  const keys = [
    'plus.channels.access.free',
    'plus.channels.access.limit',
    'plus.channels.access.plus',
    'plus.channels.access.loading',
    'plus.channels.access.unavailable',
    'plus.channels.result.requiresPlus',
    'plus.channels.result.loading',
    'plus.channels.result.unavailable',
    'plus.channels.feedback.loading',
    'plus.channels.feedback.unavailable',
    'plus.channels.downgradeNotice'
  ]
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of keys) {
      assert.equal(typeof I18N[locale][key], 'string', `${locale} is missing ${key}`)
      assert.ok(I18N[locale][key].trim(), `${locale} has blank ${key}`)
    }
  }
})
