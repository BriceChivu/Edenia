import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getEdeniaSessionReplayUrl,
  getPosthogDistinctId,
  hasEdeniaAnalyticsStateSync,
  identifyEdeniaAuthenticatedUser,
  isEdeniaAnalyticsEnabled,
  resetEdeniaAuthenticatedUser,
  setEdeniaPersonProperties,
  syncEdeniaAnalyticsState,
  trackEdeniaEvent
} from '../../src/integrations/analytics-bridge.js'

function withWindow(target, callback) {
  const previousWindow = globalThis.window
  globalThis.window = target
  try {
    return callback()
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
}

test('analytics bridge preserves absent globals and dynamic availability', () => {
  withWindow({}, () => {
    assert.equal(isEdeniaAnalyticsEnabled(), undefined)
    assert.equal(hasEdeniaAnalyticsStateSync(), false)
    assert.equal(trackEdeniaEvent('event'), undefined)
    assert.equal(setEdeniaPersonProperties({}), undefined)
    assert.equal(getEdeniaSessionReplayUrl(), undefined)
    assert.equal(syncEdeniaAnalyticsState({}), undefined)
    assert.equal(identifyEdeniaAuthenticatedUser('user-id'), undefined)
    assert.equal(resetEdeniaAuthenticatedUser(), undefined)
    assert.equal(getPosthogDistinctId(), undefined)
  })

  const target = { EDENIA_ANALYTICS_ENABLED: 'enabled' }
  withWindow(target, () => {
    assert.equal(isEdeniaAnalyticsEnabled(), 'enabled')
    target.syncEdeniaAnalyticsState = () => 'ready'
    assert.equal(hasEdeniaAnalyticsStateSync(), true)
  })
})

test('analytics bridge preserves receivers, arguments, returns, and replacements', () => {
  const target = {}
  withWindow(target, () => {
    target.trackEdeniaEvent = function (...args) {
      assert.equal(this, target)
      assert.deepEqual(args, ['first'])
      return 'captured-first'
    }
    assert.equal(trackEdeniaEvent('first'), 'captured-first')

    target.trackEdeniaEvent = function (...args) {
      assert.equal(this, target)
      assert.deepEqual(args, ['second', { exact: true }])
      return 'captured-second'
    }
    assert.equal(
      trackEdeniaEvent('second', { exact: true }),
      'captured-second'
    )

    target.setEdeniaPersonProperties = function (...args) {
      assert.equal(this, target)
      assert.deepEqual(args, [{ current: 1 }, { first: 1 }])
      return false
    }
    assert.equal(
      setEdeniaPersonProperties({ current: 1 }, { first: 1 }),
      false
    )

    target.getEdeniaSessionReplayUrl = function () {
      assert.equal(this, target)
      return 'replay-url'
    }
    assert.equal(getEdeniaSessionReplayUrl(), 'replay-url')

    target.syncEdeniaAnalyticsState = function (...args) {
      assert.equal(this, target)
      assert.deepEqual(args, [{ snapshot: true }])
      return 'synced'
    }
    assert.equal(
      syncEdeniaAnalyticsState({ snapshot: true }),
      'synced'
    )

    target.identifyEdeniaAuthenticatedUser = function (...args) {
      assert.equal(this, target)
      assert.deepEqual(args, ['uuid'])
      return true
    }
    target.resetEdeniaAuthenticatedUser = function (...args) {
      assert.equal(this, target)
      assert.deepEqual(args, [])
      return true
    }
    assert.equal(identifyEdeniaAuthenticatedUser('uuid'), true)
    assert.equal(resetEdeniaAuthenticatedUser(), true)
  })
})

test('analytics bridge preserves PostHog receiver and propagated errors', () => {
  const posthog = {
    get_distinct_id() {
      assert.equal(this, posthog)
      return 'distinct-id'
    }
  }
  withWindow({ posthog }, () => {
    assert.equal(getPosthogDistinctId(), 'distinct-id')
  })

  withWindow({
    trackEdeniaEvent() {
      throw new Error('capture failed')
    }
  }, () => {
    assert.throws(() => trackEdeniaEvent('event'), /capture failed/)
  })
})
