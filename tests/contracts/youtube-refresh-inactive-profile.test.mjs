import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const appSource = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')

function sourceBetween(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker)
  const end = appSource.indexOf(endMarker, start)
  assert.ok(start >= 0 && end > start)
  return appSource.slice(start, end)
}

function createRefreshHarness() {
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
  let nextTimer = 0
  const events = {
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: type => listeners.delete(type)
  }
  const context = vm.createContext({
    Date: FixedDate,
    IS_SANDBOX: false,
    YOUTUBE_REFRESH_INTERVAL_MS: 6 * 60 * 60 * 1000,
    YOUTUBE_REFRESH_ERROR_BACKOFF_MS: 60 * 1000,
    learnerProfileLifecycleAuthority: { readActiveProfile: () => activeProfile },
    loadPersistedState: () => { throw new Error('Inactive signed-in profiles must not load persisted state') },
    window: events,
    document: { ...events, hidden: false },
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
    showToast: () => { calls.toasts += 1 },
    t: key => key
  })
  vm.runInContext([
    sourceBetween('function loadState()', '\nconst persistedPortableProfileSnapshots'),
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
