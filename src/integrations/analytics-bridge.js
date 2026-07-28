export function isEdeniaAnalyticsEnabled() {
  return window.EDENIA_ANALYTICS_ENABLED
}

export function hasEdeniaAnalyticsStateSync() {
  return typeof window.syncEdeniaAnalyticsState === 'function'
}

export function trackEdeniaEvent(...args) {
  return window.trackEdeniaEvent?.(...args)
}

export function setEdeniaPersonProperties(...args) {
  return window.setEdeniaPersonProperties?.(...args)
}

export function getEdeniaSessionReplayUrl() {
  return window.getEdeniaSessionReplayUrl?.()
}

export function syncEdeniaAnalyticsState(...args) {
  return window.syncEdeniaAnalyticsState?.(...args)
}

export function getPosthogDistinctId() {
  const getDistinctId = window.posthog?.get_distinct_id
  return typeof getDistinctId === 'function'
    ? getDistinctId.call(window.posthog)
    : undefined
}
