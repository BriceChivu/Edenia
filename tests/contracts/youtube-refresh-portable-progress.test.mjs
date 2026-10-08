import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { isValidTimestamp } from '../../src/core/date-keys.js'
import {
  hasVideoResumePriority,
  isVideoRemovedFromFeed,
  isVideoWatchLater,
  normalizeResumeAtSeconds
} from '../../src/domain/video-state.js'
import { normalizeVideoWatchProgress } from '../../src/domain/video-watch-progress.js'
import { isShortDuration, normalizeVideoAspectRatio } from '../../src/integrations/youtube-parsing.js'
import { preparePortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
function sourceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  assert.ok(start >= 0 && end > start)
  return source.slice(start, end)
}

function createRefreshHarness(options = {}) {
  const { status = 'partial', loseActivation = false } = options
  const watchLater = Object.hasOwn(options, 'watchLater') ? options.watchLater : true
  const profile = {
    anki: {}, activityLog: [],
    config: { channels: [{ id: 'test-channel', name: 'Test channel' }] },
    videos: {
      'study-video': {
        id: 'study-video', channelId: 'test-channel', title: 'Original title',
        duration: 120, isShort: true, status, watchLater, favorite: true,
        resumeAtSeconds: 20, pausedAt: '2026-09-13T09:00:00.000Z',
        watchProgress: [{ seconds: 20, watchedAt: '2026-09-13T09:00:00.000Z' }],
        watchProgressTracked: true
      }
    }
  }
  let active = true
  const savedEnvelopes = []
  const saveOptions = []
  const renders = []
  const context = vm.createContext({
    IS_SANDBOX: false,
    learnerProfileLifecycleAuthority: options.signedIn ? {} : null,
    getPortableProfileSnapshot: state => JSON.stringify(preparePortableLearnerProfileEnvelope(state).profile),
    isYoutubeMetadataFresh: () => true,
    starterFeedPreparationPromise: null,
    document: { getElementById: () => null },
    console: { error: error => { if (!options.failMetadata) throw error }, warn() {} },
    loadState: () => active ? profile : null,
    hasYoutubeApiKey: () => true,
    getDueYoutubeChannels: state => state.config.channels,
    getEffectiveIncludeShorts: () => true,
    hydrateYoutubeChannelProfiles: async channels => {
      if (options.newChannelImage) channels[0].imageUrl = 'https://example.com/new-image.png'
    },
    isCurrentLearnerProfileOperation: state => active && state === profile,
    fetchChannelVideos: async () => ({ videos: options.noChanges ? [
      { id: 'study-video', channelId: 'test-channel', title: 'Original title', duration: 120 }
    ] : [
      { id: 'study-video', channelId: 'test-channel', title: 'Refreshed title', duration: 120 },
      { id: 'new-video', channelId: 'test-channel', title: 'New title', duration: 150 }
    ], filteredShorts: 0 }),
    getFetchedVideoDetails: async () => {
      if (options.failMetadata) throw Error('Metadata failure')
      if (loseActivation) active = false
      return {}
    },
    hasVideoResumePriority,
    isShortDuration,
    isValidTimestamp,
    isVideoRemovedFromFeed,
    isVideoWatchLater,
    normalizeResumeAtSeconds,
    normalizeVideoAspectRatio,
    normalizeVideoWatchProgress,
    markChannelRefreshSuccess() {},
    markChannelRefreshError(state, id) { state.channelRefreshes = { [id]: { lastFailedAt: new Date().toISOString() } } },
    appendActivityLog: (state, entry) => state.activityLog.push(entry),
    saveState(state, options = {}) {
      assert.equal(active, true)
      assert.equal(state, profile)
      savedEnvelopes.push(preparePortableLearnerProfileEnvelope(state))
      saveOptions.push(options)
      return true
    },
    renderAll: state => renders.push(state),
    formatSkippedShortsMessage: () => '',
    trackEdeniaEvent() {},
    trackRefreshCompleted() {},
    showToast() {},
    scheduleYoutubeAutoRefresh() {},
    t: key => key
  })
  vm.runInContext([
    sourceBetween('function dedupeVideos(', '\nasync function getFetchedVideoDetails('),
    sourceBetween('function mergeFetchedVideos(', '\nfunction formatSkippedShortsMessage('),
    sourceBetween('async function refreshFeed(', '\nasync function refreshAddedChannel(')
  ].join('\n'), context)
  return { profile, savedEnvelopes, saveOptions, renders,
    refresh: options => context.refreshFeed({ silent: true, ...options }) }
}

for (const input of [
  { status: 'partial', watchLater: true },
  { status: 'watch-later', watchLater: undefined },
  { status: 'partial', watchLater: false }
]) {
  test(`feed refresh preserves portable Watch later ${String(input.watchLater)} on a ${input.status} video`, async () => {
    const harness = createRefreshHarness(input)
    const before = preparePortableLearnerProfileEnvelope(harness.profile).profile.videos['study-video']
    const result = await harness.refresh()
    assert.equal(result.ok, true)
    assert.equal(result.mergedCount, 1, 'Metadata refreshes must not count as newly loaded videos')
    assert.equal(harness.savedEnvelopes.length, 1)
    const saved = harness.savedEnvelopes[0].profile.videos['study-video']
    assert.equal(saved.watchLater, before.watchLater, 'Refreshing metadata must not erase the cloud-restored Watch later choice')
    assert.equal(saved.favorite, before.favorite)
    assert.equal(saved.status, before.status)
    assert.equal(saved.resumeAtSeconds, before.resumeAtSeconds)
    assert.deepEqual(saved.watchProgress, before.watchProgress)
    assert.equal(saved.title, 'Refreshed title')
    assert.equal(Object.keys(harness.profile.videos).length, 2)
    assert.equal(harness.renders.length, 1)
  })
}

test('a refresh finishing after profile deactivation cannot save its captured profile', async () => {
  const harness = createRefreshHarness({ loseActivation: true })
  const result = await harness.refresh()
  assert.equal(result.reason, 'stale-activation')
  assert.equal(harness.savedEnvelopes.length, 0)
  assert.equal(harness.renders.length, 0)
  assert.equal(harness.profile.videos['study-video'].watchLater, true)
})

 test('detail failure retains videos and records failure backoff before scheduling retry', async () => {
  const h = createRefreshHarness({ failMetadata: true })
  const before = structuredClone(h.profile.videos)
  const result = await h.refresh()
  assert.equal(result.ok, false)
  assert.deepEqual(h.profile.videos, before)
  assert.ok(h.profile.channelRefreshes['test-channel'].lastFailedAt)
})

test('an unchanged signed-in automatic feed refresh keeps cooldown local without cloud diagnostics', async () => {
  const h = createRefreshHarness({ signedIn: true, noChanges: true })
  const before = preparePortableLearnerProfileEnvelope(h.profile).profile
  const result = await h.refresh({ silent: false })
  assert.equal(result.ok, true)
  assert.deepEqual(h.savedEnvelopes[0].profile, before)
  assert.equal(h.saveOptions[0].syncCloud, false)
  assert.equal(h.profile.activityLog.length, 0)
})

test('new videos and channel images remain cloud eligible during automatic refresh', async () => {
  for (const options of [{}, { noChanges: true, newChannelImage: true }]) {
    const h = createRefreshHarness({ signedIn: true, ...options })
    await h.refresh()
    assert.notEqual(h.saveOptions[0].syncCloud, false)
    assert.equal(h.profile.activityLog.length, 1)
  }
})

test('a failed signed-in automatic feed refresh persists backoff without a phantom cloud change', async () => {
  const h = createRefreshHarness({ signedIn: true, failMetadata: true })
  const before = preparePortableLearnerProfileEnvelope(h.profile).profile
  await h.refresh()
  assert.deepEqual(h.savedEnvelopes[0].profile, before)
  assert.equal(h.saveOptions[0].syncCloud, false)
  assert.ok(h.profile.channelRefreshes['test-channel'].lastFailedAt)
})

test('manual unchanged feed refreshes retain their explicit diagnostic history', async () => {
  const h = createRefreshHarness({ signedIn: true, noChanges: true })
  await h.refresh({ trigger: 'manual' })
  assert.notEqual(h.saveOptions[0].syncCloud, false)
  assert.equal(h.profile.activityLog.length, 1)
})
