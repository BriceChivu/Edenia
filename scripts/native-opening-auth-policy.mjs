import { createOpeningEmailAuthenticationPolicy } from './hosted-profile-opening-smoke.mjs'

// This policy is for the owner-approved native email setup only. A transport
// must enforce origin/SNI/Host agreement, bounded bodies, no upgrades, and lease
// validation before forwarding. No learner-profile operation is ever permitted.
export function createNativeOpeningAuthenticationPolicy({ applicationOrigin, providerOrigin, expectedEmail, localChallengeOrigin }) {
  const challengeOrigin = localChallengeOrigin || 'https://challenges.cloudflare.com'
  if (localChallengeOrigin && ![applicationOrigin, providerOrigin, localChallengeOrigin].every(value => {
    const url = new URL(value)
    return url.origin === value && url.protocol === 'https:' && !url.port && url.hostname.endsWith('.invalid')
  })) throw new Error('Local challenge fixture requires only reserved invalid origins')
  for (const value of [applicationOrigin, providerOrigin]) {
    const url = new URL(value)
    if (url.origin !== value || url.protocol !== 'https:' || url.port || url.username || url.password)
      throw new Error('Invalid native authentication origin')
  }
  if (new Set([applicationOrigin, providerOrigin, challengeOrigin]).size !== 3) throw new Error('Authentication origins must differ')
  const email = createOpeningEmailAuthenticationPolicy({ providerOrigin, expectedEmail })
  const corsHeaders = new Set(['apikey', 'authorization', 'content-type', 'x-client-info', 'x-supabase-api-version'])
  const staticDestinations = new Set(['empty', 'script', 'style', 'image', 'font', 'manifest'])
  const challengeDestinations = new Set([...staticDestinations, 'iframe', 'document'])
  let challenges = 0, preflights = 0, sealed = false
  const deny = () => ({ kind: 'deny' })
  return {
    origins: Object.freeze([applicationOrigin, providerOrigin, challengeOrigin]),
    seal() { sealed = true },
    classify({ origin, path, method, destination, body = '', corsOrigin, corsMethod, corsHeaders: requestedHeaders }) {
      if (sealed || ![applicationOrigin, providerOrigin, challengeOrigin].includes(origin)
        || typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')
        || /[%\\#\u0000-\u0020]/u.test(path) || /(?:^|\/)\.{1,2}(?:\/|\?|$)/u.test(path)
        || typeof body !== 'string' || Buffer.byteLength(body) > 8192) return deny()
      const target = new URL(origin + path)
      if (target.pathname.startsWith('/rest/') || target.pathname.startsWith('/functions/')
        || ['worker', 'sharedworker', 'serviceworker'].includes(destination)) return deny()
      if (origin === providerOrigin) {
        if (destination !== 'empty') return deny()
        if (method === 'OPTIONS') {
          const expectedMethod = target.pathname === '/auth/v1/user' ? 'GET'
            : ['/auth/v1/otp', '/auth/v1/verify'].includes(target.pathname) ? 'POST' : null
          const headers = typeof requestedHeaders === 'string' ? requestedHeaders.split(',').map(h => h.trim().toLowerCase()) : []
          if (body || target.search || corsOrigin !== applicationOrigin || !expectedMethod || corsMethod !== expectedMethod
            || headers.length === 0 || headers.some(h => !corsHeaders.has(h)) || preflights >= 6) return deny()
          preflights++
          return { kind: 'preflight', method: expectedMethod, headers: headers.join(', ') }
        }
        return email.classify({ method, url: target.href, body: body || undefined })
      }
      if (origin === applicationOrigin) {
        if (method !== 'GET' || body) return deny()
        if (destination === 'document') return path === '/?internal_test=1' ? { kind: 'static' } : deny()
        if (!staticDestinations.has(destination) || target.pathname === '/' || target.pathname.startsWith('/auth/')) return deny()
        return { kind: 'static' }
      }
      if (!['GET', 'POST'].includes(method) || !challengeDestinations.has(destination)
        || !['/turnstile/', '/cdn-cgi/challenge-platform/'].some(prefix => target.pathname.startsWith(prefix))
        || challenges >= 128) return deny()
      challenges++
      return { kind: 'challenge' }
    }
  }
}
