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
