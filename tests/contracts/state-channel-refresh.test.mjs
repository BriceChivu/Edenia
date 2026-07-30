import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeChannelRefreshState
} from '../../src/state/channel-refresh-state.js'

const fetchedAt = '2026-07-28T01:02:03.000Z'
const failedAt = '2026-07-28T02:03:04.000Z'

test('channel refresh normalization migrates legacy timestamps per active channel', () => {
  const state = {
    config: {
      channels: [{ id: 'one' }, { id: 'two' }, { id: 'one' }, { id: '' }]
    },
    lastFetched: fetchedAt
  }
  assert.equal(normalizeChannelRefreshState(state), true)
  assert.deepEqual(state.channelRefreshes, {
    one: {
      lastFetchedAt: fetchedAt,
      lastError: null,
      lastFailedAt: null
    },
    two: {
      lastFetchedAt: fetchedAt,
      lastError: null,
      lastFailedAt: null
    }
  })
  assert.equal('lastFetched' in state, false)
})

test('current entries retain valid fields and stale channels are removed', () => {
  const state = {
    config: { channels: [{ id: 'one' }, { id: 'empty-entry' }] },
    channelRefreshes: {
      one: {
        lastFetchedAt: fetchedAt,
        lastFailedAt: failedAt,
        lastError: ''
      },
      'empty-entry': {
        lastFetchedAt: 'invalid',
        lastFailedAt: 'invalid',
        lastError: 500
      },
      removed: {
        lastFetchedAt: fetchedAt,
        lastFailedAt: null,
        lastError: 'old'
      }
    }
  }

  assert.equal(normalizeChannelRefreshState(state), true)
  assert.deepEqual(state.channelRefreshes, {
    one: {
      lastFetchedAt: fetchedAt,
      lastError: '',
      lastFailedAt: failedAt
    },
    'empty-entry': {
      lastFetchedAt: null,
      lastError: null,
      lastFailedAt: null
    }
  })
  assert.equal(normalizeChannelRefreshState(state), false)
})

test('missing or invalid refresh maps normalize to an empty object', () => {
  for (const channelRefreshes of [undefined, null, [], 'invalid']) {
    const state = {
      config: { channels: [] },
      channelRefreshes
    }
    assert.equal(normalizeChannelRefreshState(state), false)
    assert.deepEqual(state.channelRefreshes, {})
  }
})

test('channel refresh normalization preserves null and malformed-channel errors', () => {
  assert.equal(normalizeChannelRefreshState(null), false)
  assert.equal(normalizeChannelRefreshState(undefined), false)
  assert.throws(
    () => normalizeChannelRefreshState({
      config: { channels: 'not-an-array' }
    }),
    TypeError
  )
  assert.throws(
    () => normalizeChannelRefreshState(Object.freeze({})),
    TypeError
  )
})
