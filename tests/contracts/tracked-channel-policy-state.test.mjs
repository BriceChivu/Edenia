import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPlusAccessPolicy,
  PLUS_ENTITLEMENT_STATES
} from '../../src/domain/plus-access-policy.js'
import {
  canTrackAdditionalChannel,
  createDefaultTrackedChannelPolicy,
  getFreeTrackedChannelAllowance,
  getManualVideoOnlyChannels,
  getTrackedChannelIds,
  getTrackedChannelsInShelfOrder,
  normalizeTrackedChannelPolicyState,
  shouldPreserveVideoAfterTrackedChannelRemoval,
  shouldTrackManualVideoChannel,
  TRACKED_CHANNEL_POLICY_VERSION,
  transitionTrackedChannelPolicyState
} from '../../src/state/tracked-channel-policy-state.js'

const transitionAt = '2026-08-02T12:00:00.000Z'

function channel(id) {
  return { id, name: `Channel ${id}` }
}

function createState(channelIds = [], overrides = {}) {
  return {
    config: {
      channels: channelIds.map(channel),
      channelShelfOrder: [],
      ...overrides.config
    },
    videos: overrides.videos || {}
  }
}

function policy(entitlementState, options = {}) {
  return createPlusAccessPolicy({ entitlementState, ...options })
}

test('new and legacy states receive a count-based Free channel allowance', () => {
  assert.deepEqual(createDefaultTrackedChannelPolicy([]), {
    version: TRACKED_CHANNEL_POLICY_VERSION,
    freeAllowance: 5,
    grandfatheredAt: null,
    lastConfirmedTier: null,
    downgradePending: false
  })
  assert.equal(createDefaultTrackedChannelPolicy('not-an-array').freeAllowance, 5)
  assert.equal(
    createDefaultTrackedChannelPolicy(['a', 'b', 'c', 'd', 'e', 'f'].map(channel))
      .freeAllowance,
    6
  )

  const legacyState = createState(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
  assert.equal(normalizeTrackedChannelPolicyState(legacyState), true)
  assert.equal(legacyState.config.trackedChannelPolicy.freeAllowance, 7)
  assert.equal(legacyState.config.trackedChannelPolicy.grandfatheredAt, null)
  assert.equal(normalizeTrackedChannelPolicyState(legacyState), false)
})

test('normalization repairs malformed policy state without shrinking sealed allowances', () => {
  const state = createState(['a', 'b', 'c', 'd', 'e', 'f'], {
    config: {
      trackedChannelPolicy: {
        version: 99,
        freeAllowance: 8,
        grandfatheredAt: transitionAt,
        lastConfirmedTier: 'invalid',
        downgradePending: 'true'
      }
    }
  })

  assert.equal(normalizeTrackedChannelPolicyState(state), true)
  assert.deepEqual(state.config.trackedChannelPolicy, {
    version: TRACKED_CHANNEL_POLICY_VERSION,
    freeAllowance: 8,
    grandfatheredAt: transitionAt,
    lastConfirmedTier: null,
    downgradePending: false
  })
})

test('grandfathering seals max(5, current tracked count) only when Free limits activate', () => {
  const state = createState(['a', 'b', 'c', 'd', 'e', 'f'])
  const unrestrictedFree = policy(PLUS_ENTITLEMENT_STATES.FREE)

  const unrestricted = transitionTrackedChannelPolicyState(
    state,
    unrestrictedFree,
    { now: transitionAt }
  )
  assert.equal(unrestricted.changed, true)
  assert.deepEqual(unrestricted.channelIdsToRemove, [])
  assert.equal(state.config.trackedChannelPolicy.freeAllowance, 6)
  assert.equal(state.config.trackedChannelPolicy.grandfatheredAt, null)

  state.config.channels.push(channel('g'))
  normalizeTrackedChannelPolicyState(state)
  assert.equal(state.config.trackedChannelPolicy.freeAllowance, 7)

  const restrictedFree = policy(PLUS_ENTITLEMENT_STATES.FREE, {
    freePlusEnabled: true
  })
  const sealed = transitionTrackedChannelPolicyState(
    state,
    restrictedFree,
    { now: transitionAt }
  )
  assert.equal(sealed.changed, true)
  assert.deepEqual(sealed.channelIdsToRemove, [])
  assert.equal(state.config.trackedChannelPolicy.freeAllowance, 7)
  assert.equal(state.config.trackedChannelPolicy.grandfatheredAt, transitionAt)

  state.config.channels.push(channel('h'))
  normalizeTrackedChannelPolicyState(state)
  assert.equal(state.config.trackedChannelPolicy.freeAllowance, 7)
})

test('downgrade resets the allowance and removes channels after the first five shelves', () => {
  const state = createState(['a', 'b', 'c', 'd', 'e', 'f', 'g'], {
    config: {
      channelShelfOrder: ['manual-only', 'f', 'b', 'a', 'e', 'd', 'c', 'g'],
      trackedChannelPolicy: {
        version: TRACKED_CHANNEL_POLICY_VERSION,
        freeAllowance: 7,
        grandfatheredAt: '2026-07-01T00:00:00.000Z',
        lastConfirmedTier: 'plus',
        downgradePending: false
      }
    }
  })

  assert.deepEqual(
    getTrackedChannelsInShelfOrder(state).map(entry => entry.id),
    ['f', 'b', 'a', 'e', 'd', 'c', 'g']
  )
  const result = transitionTrackedChannelPolicyState(
    state,
    policy(PLUS_ENTITLEMENT_STATES.FREE, { freePlusEnabled: true }),
    { now: transitionAt }
  )

  assert.equal(result.downgraded, true)
  assert.deepEqual(result.channelIdsToRemove, ['c', 'g'])
  assert.equal(state.config.trackedChannelPolicy.freeAllowance, 5)
  assert.equal(state.config.trackedChannelPolicy.lastConfirmedTier, 'free')
  assert.equal(state.config.trackedChannelPolicy.downgradePending, false)
})

test('downgrades remain pending while limits are disabled and resolve on activation', () => {
  const state = createState(['a', 'b', 'c', 'd', 'e', 'f'], {
    config: {
      trackedChannelPolicy: {
        version: TRACKED_CHANNEL_POLICY_VERSION,
        freeAllowance: 5,
        grandfatheredAt: null,
        lastConfirmedTier: 'plus',
        downgradePending: false
      }
    }
  })

  const pending = transitionTrackedChannelPolicyState(
    state,
    policy(PLUS_ENTITLEMENT_STATES.FREE),
    { now: transitionAt }
  )
  assert.equal(pending.downgraded, true)
  assert.deepEqual(pending.channelIdsToRemove, [])
  assert.equal(state.config.trackedChannelPolicy.freeAllowance, 5)
  assert.equal(state.config.trackedChannelPolicy.downgradePending, true)

  const activated = transitionTrackedChannelPolicyState(
    state,
    policy(PLUS_ENTITLEMENT_STATES.FREE, { freePlusEnabled: true }),
    { now: transitionAt }
  )
  assert.equal(activated.downgraded, true)
  assert.deepEqual(activated.channelIdsToRemove, ['f'])
  assert.equal(state.config.trackedChannelPolicy.downgradePending, false)
})

test('Plus and payment-problem grace never prune channels', () => {
  for (const entitlementState of [
    PLUS_ENTITLEMENT_STATES.PLUS,
    PLUS_ENTITLEMENT_STATES.PAYMENT_PROBLEM
  ]) {
    const state = createState(['a', 'b', 'c', 'd', 'e', 'f'])
    const result = transitionTrackedChannelPolicyState(
      state,
      policy(entitlementState, { freePlusEnabled: true }),
      { now: transitionAt }
    )
    assert.deepEqual(result.channelIdsToRemove, [])
    assert.equal(state.config.trackedChannelPolicy.lastConfirmedTier, 'plus')
    assert.equal(state.config.trackedChannelPolicy.grandfatheredAt, null)
  }
})

test('loading and unavailable entitlement states do not seal or destructively transform state', () => {
  for (const entitlementState of [
    PLUS_ENTITLEMENT_STATES.LOADING,
    PLUS_ENTITLEMENT_STATES.UNAVAILABLE
  ]) {
    const state = createState(['a', 'b', 'c', 'd', 'e', 'f'])
    const result = transitionTrackedChannelPolicyState(
      state,
      policy(entitlementState, { freePlusEnabled: true }),
      { now: transitionAt }
    )
    assert.equal(result.confirmedTier, null)
    assert.deepEqual(result.channelIdsToRemove, [])
    assert.equal(state.config.trackedChannelPolicy.grandfatheredAt, null)
    assert.equal(state.config.trackedChannelPolicy.lastConfirmedTier, null)
  }
})

test('manual-video channel behavior follows access without retroactively tracking metadata', () => {
  const freePolicy = policy(PLUS_ENTITLEMENT_STATES.FREE, {
    freePlusEnabled: true
  })
  const plusPolicy = policy(PLUS_ENTITLEMENT_STATES.PLUS, {
    freePlusEnabled: true
  })
  const legacyPolicy = policy(PLUS_ENTITLEMENT_STATES.FREE)

  assert.equal(shouldTrackManualVideoChannel(freePolicy), false)
  assert.equal(shouldTrackManualVideoChannel(plusPolicy), true)
  assert.equal(shouldTrackManualVideoChannel(legacyPolicy), true)

  const state = createState(['tracked'], {
    videos: {
      one: {
        id: 'one',
        manuallyAdded: true,
        channelId: 'manual-only',
        channelTitle: 'Manual only',
        channelImageUrl: 'manual.jpg'
      },
      two: {
        id: 'two',
        manuallyAdded: true,
        channelId: 'manual-only',
        channelTitle: 'Manual only'
      },
      three: {
        id: 'three',
        manuallyAdded: true,
        channelId: 'tracked',
        channelTitle: 'Tracked'
      },
      hidden: {
        id: 'hidden',
        manuallyAdded: true,
        source: 'manual',
        hiddenFromGrid: true,
        channelId: 'hidden-manual',
        channelTitle: 'Hidden manual'
      },
      feed: {
        id: 'feed',
        manuallyAdded: false,
        channelId: 'feed-only'
      }
    }
  })

  assert.deepEqual(getManualVideoOnlyChannels(state), [{
    id: 'manual-only',
    name: 'Manual only',
    imageUrl: 'manual.jpg',
    source: 'manual-video',
    tracked: false,
    videoCount: 2
  }])

  transitionTrackedChannelPolicyState(state, plusPolicy, { now: transitionAt })
  assert.deepEqual(getTrackedChannelIds(state), ['tracked'])
  assert.equal(getManualVideoOnlyChannels(state)[0].id, 'manual-only')
})

test('Free allowance decisions are count-based rather than tied to channel IDs', () => {
  const state = createState(['a', 'b', 'c', 'd', 'e'])
  transitionTrackedChannelPolicyState(
    state,
    policy(PLUS_ENTITLEMENT_STATES.FREE, { freePlusEnabled: true }),
    { now: transitionAt }
  )
  const restricted = policy(PLUS_ENTITLEMENT_STATES.FREE, {
    freePlusEnabled: true
  })

  assert.equal(getFreeTrackedChannelAllowance(state), 5)
  assert.equal(canTrackAdditionalChannel(state, restricted, 'a'), true)
  assert.equal(canTrackAdditionalChannel(state, restricted, 'new'), false)

  state.config.channels.splice(2, 1)
  assert.equal(canTrackAdditionalChannel(state, restricted, 'new'), true)
  assert.equal(
    canTrackAdditionalChannel(state, policy(PLUS_ENTITLEMENT_STATES.FREE), 'new'),
    true
  )
})

test('safe channel removal keeps watched, saved, favorite, and manual videos', () => {
  assert.equal(shouldPreserveVideoAfterTrackedChannelRemoval({ status: 'watched' }), true)
  assert.equal(shouldPreserveVideoAfterTrackedChannelRemoval({ status: 'partial' }), true)
  assert.equal(shouldPreserveVideoAfterTrackedChannelRemoval({ status: 'watch-later' }), true)
  assert.equal(shouldPreserveVideoAfterTrackedChannelRemoval({ favorite: true }), true)
  assert.equal(shouldPreserveVideoAfterTrackedChannelRemoval({
    status: 'unwatched',
    manuallyAdded: true,
    source: 'manual'
  }), false)
  assert.equal(shouldPreserveVideoAfterTrackedChannelRemoval({
    status: 'unwatched',
    manuallyAdded: true,
    source: 'manual'
  }, { preserveManualVideos: true }), true)
  assert.equal(shouldPreserveVideoAfterTrackedChannelRemoval({ status: 'unwatched' }), false)
})
