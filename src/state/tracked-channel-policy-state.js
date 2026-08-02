import { isValidTimestamp } from '../core/date-keys.js'
import {
  FREE_PLUS_LIMITS,
  PLUS_ACCESS_TIERS,
  PLUS_ENTITLEMENT_STATES
} from '../domain/plus-access-policy.js'
import {
  getVideoStatus,
  isFavoriteVideo
} from '../domain/video-state.js'
import {
  isHiddenFromVideoGrid,
  isSavedActiveVideo,
  normalizeChannelShelfOrder
} from '../features/videos/feed-selectors.js'

export const TRACKED_CHANNEL_POLICY_VERSION = 1

const CONFIRMED_TIERS = new Set(Object.values(PLUS_ACCESS_TIERS))

function getConfiguredChannels(state) {
  return Array.isArray(state?.config?.channels) ? state.config.channels : []
}

export function getTrackedChannelIds(state) {
  return Array.from(new Set(
    getConfiguredChannels(state)
      .map(channel => String(channel?.id || '').trim())
      .filter(Boolean)
  ))
}

export function createDefaultTrackedChannelPolicy(channels = []) {
  const trackedCount = getTrackedChannelIds({ config: { channels } }).length
  return {
    version: TRACKED_CHANNEL_POLICY_VERSION,
    freeAllowance: Math.max(FREE_PLUS_LIMITS.trackedChannels, trackedCount),
    grandfatheredAt: null,
    lastConfirmedTier: null,
    downgradePending: false
  }
}

function normalizeAllowance(value) {
  const allowance = Number(value)
  return Number.isSafeInteger(allowance) && allowance >= FREE_PLUS_LIMITS.trackedChannels
    ? allowance
    : FREE_PLUS_LIMITS.trackedChannels
}

function getNormalizedTrackedChannelPolicy(state) {
  const existing = state?.config?.trackedChannelPolicy
  const trackedCount = getTrackedChannelIds(state).length
  const lastConfirmedTier = CONFIRMED_TIERS.has(existing?.lastConfirmedTier)
    ? existing.lastConfirmedTier
    : null
  const grandfatheredAt = isValidTimestamp(existing?.grandfatheredAt)
    ? new Date(existing.grandfatheredAt).toISOString()
    : null
  const downgradePending = existing?.downgradePending === true
  let freeAllowance = normalizeAllowance(existing?.freeAllowance)

  // Before the one-time allowance is sealed, legacy unlocked use must remain
  // eligible for grandfathering. Plus use and a pending downgrade never grow it.
  if (
    !grandfatheredAt
    && lastConfirmedTier !== PLUS_ACCESS_TIERS.PLUS
    && !downgradePending
  ) {
    freeAllowance = Math.max(freeAllowance, trackedCount)
  }

  return {
    version: TRACKED_CHANNEL_POLICY_VERSION,
    freeAllowance,
    grandfatheredAt,
    lastConfirmedTier,
    downgradePending
  }
}

export function normalizeTrackedChannelPolicyState(state) {
  if (!state?.config) return false
  const existing = state.config.trackedChannelPolicy
  const normalized = getNormalizedTrackedChannelPolicy(state)
  const changed = JSON.stringify(existing) !== JSON.stringify(normalized)
  state.config.trackedChannelPolicy = normalized
  return changed
}

export function getTrackedChannelsInShelfOrder(state) {
  const channels = getConfiguredChannels(state)
    .filter(channel => String(channel?.id || '').trim())
  const uniqueChannels = Array.from(new Map(
    channels.map(channel => [String(channel.id).trim(), channel])
  ).values())
  const orderIndexes = new Map(
    normalizeChannelShelfOrder(state?.config?.channelShelfOrder)
      .map((channelId, index) => [channelId, index])
  )

  return uniqueChannels
    .map((channel, index) => ({ channel, index }))
    .sort((left, right) => {
      const leftOrder = orderIndexes.get(String(left.channel.id).trim())
      const rightOrder = orderIndexes.get(String(right.channel.id).trim())
      if (leftOrder !== undefined && rightOrder !== undefined) {
        return leftOrder - rightOrder
      }
      if (leftOrder !== undefined) return -1
      if (rightOrder !== undefined) return 1
      return left.index - right.index
    })
    .map(entry => entry.channel)
}

export function getManualVideoOnlyChannels(state) {
  const trackedChannelIds = new Set(getTrackedChannelIds(state))
  const manualChannels = new Map()

  Object.values(state?.videos || {}).forEach(video => {
    if (video?.manuallyAdded !== true) return
    if (isHiddenFromVideoGrid(video)) return
    const id = String(video.channelId || video.channelTitle || '').trim()
    if (!id || trackedChannelIds.has(id)) return
    const existing = manualChannels.get(id)
    manualChannels.set(id, {
      id,
      name: String(video.channelTitle || existing?.name || id),
      imageUrl: String(video.channelImageUrl || existing?.imageUrl || ''),
      source: 'manual-video',
      tracked: false,
      videoCount: (existing?.videoCount || 0) + 1
    })
  })

  return Array.from(manualChannels.values())
}

export function shouldPreserveVideoAfterTrackedChannelRemoval(
  video,
  { preserveManualVideos = false } = {}
) {
  return getVideoStatus(video) === 'watched'
    || isSavedActiveVideo(video)
    || isFavoriteVideo(video)
    || (
      preserveManualVideos
      && video?.manuallyAdded === true
      && video?.source === 'manual'
    )
}

function getConfirmedAccessTier(accessPolicy) {
  if (CONFIRMED_TIERS.has(accessPolicy?.simulatedTier)) {
    return accessPolicy.simulatedTier
  }
  if (accessPolicy?.entitlementState === PLUS_ENTITLEMENT_STATES.FREE) {
    return PLUS_ACCESS_TIERS.FREE
  }
  if (
    accessPolicy?.entitlementState === PLUS_ENTITLEMENT_STATES.PLUS
    || accessPolicy?.entitlementState === PLUS_ENTITLEMENT_STATES.PAYMENT_PROBLEM
  ) {
    return PLUS_ACCESS_TIERS.PLUS
  }
  return null
}

function hasConfiguredFreeRestrictions(accessPolicy) {
  return accessPolicy?.freePlusEnabled === true
    || CONFIRMED_TIERS.has(accessPolicy?.simulatedTier)
}

export function shouldTrackManualVideoChannel(accessPolicy) {
  return accessPolicy?.enforcesFreeLimits !== true
}

export function getFreeTrackedChannelAllowance(state) {
  normalizeTrackedChannelPolicyState(state)
  return state?.config?.trackedChannelPolicy?.freeAllowance
    ?? FREE_PLUS_LIMITS.trackedChannels
}

export function canTrackAdditionalChannel(state, accessPolicy, channelId = null) {
  const trackedChannelIds = getTrackedChannelIds(state)
  const normalizedChannelId = String(channelId || '').trim()
  if (normalizedChannelId && trackedChannelIds.includes(normalizedChannelId)) {
    return true
  }
  if (accessPolicy?.enforcesFreeLimits !== true) return true
  return trackedChannelIds.length < getFreeTrackedChannelAllowance(state)
}

export function transitionTrackedChannelPolicyState(
  state,
  accessPolicy,
  { now = new Date().toISOString() } = {}
) {
  if (!state?.config) {
    return {
      changed: false,
      channelIdsToRemove: [],
      confirmedTier: null,
      downgraded: false
    }
  }

  normalizeTrackedChannelPolicyState(state)
  const before = JSON.stringify(state.config.trackedChannelPolicy)
  const policyState = state.config.trackedChannelPolicy
  const confirmedTier = getConfirmedAccessTier(accessPolicy)
  const restrictionsConfigured = hasConfiguredFreeRestrictions(accessPolicy)
  let downgraded = false
  let channelIdsToRemove = []

  if (confirmedTier === PLUS_ACCESS_TIERS.PLUS) {
    policyState.lastConfirmedTier = PLUS_ACCESS_TIERS.PLUS
    policyState.downgradePending = false
  } else if (confirmedTier === PLUS_ACCESS_TIERS.FREE) {
    downgraded = policyState.lastConfirmedTier === PLUS_ACCESS_TIERS.PLUS
      || policyState.downgradePending

    if (downgraded) {
      policyState.freeAllowance = FREE_PLUS_LIMITS.trackedChannels
      policyState.grandfatheredAt ||= new Date(now).toISOString()
      if (restrictionsConfigured) {
        channelIdsToRemove = getTrackedChannelsInShelfOrder(state)
          .slice(FREE_PLUS_LIMITS.trackedChannels)
          .map(channel => String(channel.id).trim())
        policyState.downgradePending = false
      } else {
        policyState.downgradePending = true
      }
    } else if (restrictionsConfigured && !policyState.grandfatheredAt) {
      policyState.freeAllowance = Math.max(
        FREE_PLUS_LIMITS.trackedChannels,
        getTrackedChannelIds(state).length,
        policyState.freeAllowance
      )
      policyState.grandfatheredAt = new Date(now).toISOString()
    }

    policyState.lastConfirmedTier = PLUS_ACCESS_TIERS.FREE
  }

  return {
    changed: before !== JSON.stringify(policyState),
    channelIdsToRemove,
    confirmedTier,
    downgraded
  }
}
