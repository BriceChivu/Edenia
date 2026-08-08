export function publicConfig(target = window) {
  return target.EDENIA_CONFIG || {}
}

export function getYoutubeApiKey(target = window) {
  return String(publicConfig(target).youtubeApiKey || '').trim()
}

export function hasYoutubeApiKey(target = window) {
  return Boolean(getYoutubeApiKey(target))
}

export function getFreePlusEnabled(target = window) {
  return publicConfig(target).freePlusEnabled === true
}

export function getPlusCheckoutEnabled(target = window) {
  return publicConfig(target).plusCheckoutEnabled === true
}

export function getVideoOrganizationEnabled(target = window) {
  return publicConfig(target).videoOrganizationEnabled === true
}

export function getChannelVideoFormatToggleEnabled(target = window) {
  return publicConfig(target).channelVideoFormatToggleEnabled === true
}

export function getStudyGuidanceEnabled(target = window) {
  return publicConfig(target).studyGuidanceEnabled === true
}

export function getSupabaseUrl(target = window) {
  return String(publicConfig(target).supabaseUrl || '').trim()
}

export function getSupabasePublishableKey(target = window) {
  return String(publicConfig(target).supabasePublishableKey || '').trim()
}

export function hasSupabaseRuntimeConfig(target = window) {
  return Boolean(
    getSupabaseUrl(target) && getSupabasePublishableKey(target)
  )
}
