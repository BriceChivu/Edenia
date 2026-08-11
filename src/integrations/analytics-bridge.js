export function isEdeniaAnalyticsEnabled() {
  return window.EDENIA_ANALYTICS_ENABLED
}

export function hasEdeniaAnalyticsStateSync() {
  return typeof window.syncEdeniaAnalyticsState === 'function'
}

function forwardEdeniaEvent(...args) {
  return window.trackEdeniaEvent?.(...args)
}

function forwardEdeniaPersonProperties(...args) {
  return window.setEdeniaPersonProperties?.(...args)
}

function readEdeniaSessionReplayUrl() {
  return window.getEdeniaSessionReplayUrl?.()
}

function forwardEdeniaAnalyticsState(...args) {
  return window.syncEdeniaAnalyticsState?.(...args)
}

function forwardAuthenticatedUserIdentity(...args) {
  return window.identifyEdeniaAuthenticatedUser?.(...args)
}

function forwardAuthenticatedUserReset(...args) {
  return window.resetEdeniaAuthenticatedUser?.(...args)
}

export function getPosthogDistinctId() {
  const getDistinctId = window.posthog?.get_distinct_id
  return typeof getDistinctId === 'function'
    ? getDistinctId.call(window.posthog)
    : undefined
}

export {
  forwardAuthenticatedUserIdentity as identifyEdeniaAuthenticatedUser,
  readEdeniaSessionReplayUrl as getEdeniaSessionReplayUrl,
  forwardAuthenticatedUserReset as resetEdeniaAuthenticatedUser,
  forwardEdeniaPersonProperties as setEdeniaPersonProperties,
  forwardEdeniaAnalyticsState as syncEdeniaAnalyticsState,
  forwardEdeniaEvent as trackEdeniaEvent
}
