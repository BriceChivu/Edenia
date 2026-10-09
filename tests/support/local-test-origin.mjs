const localHosts = new Set(['localhost', 'localhost.', '127.0.0.1', '[::1]'])

export function isLocalTestOrigin(url) {
  // Blob workers use the origin which created them. WebKit exposes these to
  // routing, unlike Chromium; this must not admit remote or opaque origins.
  if (url.protocol === 'blob:') {
    if (url.origin === 'null') return false
    url = new URL(url.origin)
  }
  return ['http:', 'https:'].includes(url.protocol)
    && localHosts.has(url.hostname.toLowerCase())
}
