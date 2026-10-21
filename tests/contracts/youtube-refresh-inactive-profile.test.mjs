import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { preparePortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'

const appSource = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')

function sourceBetween(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker)
  const end = appSource.indexOf(endMarker, start)
  assert.ok(start >= 0 && end > start)
  return appSource.slice(start, end)
}

function createRefreshHarness(options = {}) {
  const now = Date.parse('2026-09-13T09:03:31.200Z')
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])) }
    static now() { return now }
  }
  let activeProfile = {
    config: { channels: [{ id: 'test-channel' }] },
    channelRefreshes: { 'test-channel': { lastFetchedAt: new FixedDate().toISOString() } }
  }
  const listeners = new Map()
  const timers = new Map()
  const requests = []
  const calls = { refreshes: 0, toasts: 0 }
  const notices = []
  let nextTimer = 0
  const events = {
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: type => listeners.delete(type)
  }
  const context = vm.createContext({
    Date: FixedDate,
    preparePortableLearnerProfileEnvelope,
    youtubeRequestGate: null,
    STORAGE_KEY: 'test',
    createYoutubeMetadataBudget: () => ({ createRun: () => async () => [], retryAt: () => 0 }),
    refreshSavedYoutubeMetadata: options.refreshMetadata || (async () => false),
    isCurrentLearnerProfileOperation: state => state === activeProfile,
    IS_SANDBOX: false,
    YOUTUBE_REFRESH_INTERVAL_MS: 6 * 60 * 60 * 1000,
    YOUTUBE_REFRESH_ERROR_BACKOFF_MS: 60 * 1000,
    learnerProfileLifecycleAuthority: { readActiveProfile: () => activeProfile },
    loadPersistedState: () => { throw new Error('Inactive signed-in profiles must not load persisted state') },
    window: events,
    document: { ...events, hidden: false, querySelectorAll: () => [] },
    setTimeout: (callback, delay) => {
      timers.set(++nextTimer, { callback, delay })
      return nextTimer
    },
    clearTimeout: timer => timers.delete(timer),
    hasYoutubeApiKey: () => true,
    isValidTimestamp: value => Number.isFinite(Date.parse(value)),
    refreshFeed: async () => {
      calls.refreshes += 1
      context.markChannelRefreshSuccess(activeProfile, 'test-channel')
    },
    showToast: (message, type, options) => {
      calls.toasts += 1
      const notice = { message, type, options, dismissed: false }
      notices.push(notice)
      return () => { notice.dismissed = true }
    },
    t: key => key
  })
  vm.runInContext([
    sourceBetween('function loadState(', '\nconst persistedPortableProfileSnapshots'),
    sourceBetween('function getPortableProfileSnapshot(', '\nfunction rememberPersistedPortableProfile('),
    sourceBetween('function getChannelRefreshes(', '\nfunction dedupeVideos(')
  ].join('\n'), context)
  // Observe the promises the real event handlers intentionally do not return.
  const maybeRefreshFeed = context.maybeRefreshFeed
  context.maybeRefreshFeed = (...args) => {
    const request = maybeRefreshFeed(...args)
    requests.push(request)
    return request
  }
  return {
    calls,
    notices,
    timers,
    start: () => context.startYoutubeAutoRefresh(),
    settle: () => Promise.all(requests.splice(0)),
    dispatch: type => listeners.get(type)(),
    deactivate: () => { activeProfile = null },
    activateDueProfile: () => {
      activeProfile = { config: { channels: [{ id: 'test-channel' }] }, channelRefreshes: {} }
    },
    setHidden: hidden => { context.document.hidden = hidden }
  }
}

for (const event of ['focus', 'online', 'visibilitychange']) {
  test(`${event} during inactive profile opening skips YouTube refresh and resumes after activation`, async () => {
    const harness = createRefreshHarness()
    harness.start()
    await harness.settle()
    assert.equal(harness.timers.size, 1)

    harness.deactivate()
    harness.dispatch(event)
    await assert.doesNotReject(harness.settle(), 'A wake during profile opening must not read null.config')
    assert.deepEqual(harness.calls, { refreshes: 0, toasts: 0 })
    assert.equal(harness.timers.size, 0, 'Inactive profiles must not keep polling')

    harness.activateDueProfile()
    harness.dispatch(event)
    await harness.settle()
    assert.deepEqual(harness.calls, { refreshes: 1, toasts: 0 })
    assert.equal(harness.timers.size, 1, 'The activated profile resumes its normal refresh schedule')
  })
}

test('hiding the page does not refresh even when a channel is due', async () => {
  const harness = createRefreshHarness()
  harness.start()
  await harness.settle()
  harness.activateDueProfile()
  harness.setHidden(true)
  harness.dispatch('visibilitychange')
  await harness.settle()
  assert.deepEqual(harness.calls, { refreshes: 0, toasts: 0 })
})

test('opening a feed announces metadata recovery before waiting for missing videos', async () => {
  let finishMetadata
  const pending = new Promise(resolve => { finishMetadata = resolve })
  const harness = createRefreshHarness({
    refreshMetadata: async ({ fetchVideos }) => {
      await fetchVideos(['missing-metadata'])
      return pending
    }
  })
  harness.start()
  try {
    assert.equal(harness.calls.toasts, 1, 'Missing-video recovery must show the updating notice before network requests finish')
    assert.equal(harness.notices[0].message, 'toast.refreshUpdating')
    assert.equal(harness.notices[0].options.durationMs, 0, 'The notice must last for the whole operation')
    assert.equal(harness.notices[0].dismissed, false)
  } finally {
    finishMetadata(false)
    await harness.settle()
  }
  assert.equal(harness.notices[0].dismissed, true)
})

test('metadata recovery does not leave its notice visible after completion', async () => {
  const harness = createRefreshHarness({ refreshMetadata: async ({ fetchChannels }) => {
    await fetchChannels([])
    return false
  } })
  harness.start()
  await harness.settle()
  assert.equal(harness.notices.length, 1)
  assert.equal(harness.notices[0].dismissed, true)
})

test('hidden metadata recovery does not announce a feed update', async () => {
  const harness = createRefreshHarness({ refreshMetadata: async ({ fetchVideos }) => {
    await fetchVideos(['missing-metadata'])
    return false
  } })
  harness.setHidden(true)
  harness.start()
  await harness.settle()
  assert.equal(harness.notices.length, 0)
})
