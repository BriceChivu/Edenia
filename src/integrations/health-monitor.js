// Operational telemetry is deliberately independent of learner-profile writes.
// Only fixed categories and numbers leave this boundary, never arbitrary error
// messages, profile data, video titles, DOM content, or URL query parameters.
const OPERATIONS = ['app', 'save', 'storage', 'island', 'player', 'feed', 'runtime', 'web_vital', 'telemetry']
const OUTCOMES = ['started', 'success', 'failure', 'slow', 'degraded', 'observed', 'limited']
const REASONS = ['none', 'storage-full', 'storage-denied', 'storage-unavailable', 'profile-missing', 'profile-invalid', 'profile-conflict', 'recovery-copy', 'save-failed', 'startup-failed', 'startup-slow', 'restore-failed', 'video-unavailable', 'request-failed', 'partial-refresh', 'runtime-error', 'resource-failed', 'event-budget']
const TIERS = ['none', 'local', 'session', 'indexed-db', 'memory']
const ERROR_NAMES = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'SecurityError', 'QuotaExceededError', 'InvalidStateError', 'AbortError']
const SOURCE_FILES = ['app.js', 'production-app.js', 'analytics.js', 'analytics-production.js', 'health.js', 'parent.js', 'site-entry.js']

export function healthMonitoringAllowed(href, analyticsEnabled) {
  try {
    const url = new URL(href)
    if (analyticsEnabled !== true || url.origin !== 'https://www.edenia.study' || url.pathname !== '/' || url.searchParams.has('internal_test') || url.searchParams.has('sandbox')) return false
    const sensitive = /(?:^|[_-])(?:access_token|refresh_token|id_token|token_hash|token|code|otp|credential|password|secret|session|nonce|captcha|api_key|key|capability|state|email|error)(?:$|[_-])/i
    const fragment = url.hash.slice(1)
    const hashParams = new URLSearchParams(fragment.includes('?') ? fragment.slice(fragment.indexOf('?') + 1) : fragment)
    return ![...url.searchParams.keys(), ...hashParams.keys()].some(key => sensitive.test(key.replace(/([a-z0-9])([A-Z])/g, '$1_$2')))
  } catch { return false }
}

export function createHealthMonitor({ enabled, capture, now = () => performance.now(), release = 'unknown', hidden = () => false, limit = 120 }) {
  release = /^[a-zA-Z0-9.-]{1,64}$/.test(release) ? release : 'unknown'
  let sent = 0
  let started = false
  let ready = false
  let backgrounded = hidden()
  let appSlowReported = false
  const lastSent = new Map()
  const safe = work => { try { return work() } catch { return false } }
  function emit(event, properties) {
    if (!enabled || sent >= limit) return false
    sent += 1
    capture(event, { health_schema: 1, health_environment: 'public', health_release: /^[a-zA-Z0-9.-]{1,64}$/.test(release) ? release : 'unknown', ...properties })
    if (sent === limit) capture('edenia_health', { health_schema: 1, health_environment: 'public', health_release: release, health_operation: 'telemetry', health_outcome: 'limited', health_reason: 'event-budget' })
    return true
  }
  function report(operation, outcome, options = {}) {
    return safe(() => {
      if (!enabled || sent >= limit || !OPERATIONS.includes(operation) || !OUTCOMES.includes(outcome)) return false
      const reason = REASONS.includes(options.reason) ? options.reason : 'none'
      const metric = ['LCP', 'INP', 'CLS'].includes(options.metric) ? options.metric : ''
      const key = `${operation}:${outcome}:${reason}:${metric}`
      const timestamp = now()
      // Successes are observations, not a complete denominator for a failure rate.
      const interval = outcome === 'success' && operation === 'save' ? 60000 : 10000
      if (lastSent.has(key) && timestamp - lastSent.get(key) < interval) return false
      lastSent.set(key, timestamp)
      const properties = { health_operation: operation, health_outcome: outcome, health_reason: reason }
      if (Number.isFinite(options.duration) && options.duration >= 0 && options.duration <= 600000 && !options.backgrounded) properties.health_duration_ms = Math.round(options.duration)
      if (TIERS.includes(options.recovery)) properties.health_recovery = options.recovery
      if (metric && Number.isFinite(options.value) && options.value >= 0) {
        properties.health_metric = metric
        properties.health_value = Math.round(options.value * 10000) / 10000
      }
      if (['good', 'needs-improvement', 'poor'].includes(options.rating)) properties.health_rating = options.rating
      return emit('edenia_health', properties)
    })
  }
  function exception(error, filename = '', line = 0, column = 0) {
    return safe(() => {
      if (!enabled || sent >= limit) return false
      // Parse only our known script basenames and numeric positions. No error
      // value, function names, local variables or arbitrary URLs are retained.
      const frames = []
      for (const frame of String(error?.stack || '').split('\n').slice(1, 16)) {
        const match = frame.match(/https:\/\/www\.edenia\.study\/[^\s)]*\/([^/\s)?:]+)(?:\?[^\s)]*)?:(\d+):(\d+)/)
          || frame.match(/https:\/\/www\.edenia\.study\/([^/\s)?:]+)(?:\?[^\s)]*)?:(\d+):(\d+)/)
        if (match && SOURCE_FILES.includes(match[1])) frames.push({ filename: match[1], lineno: Number(match[2]), colno: Number(match[3]), in_app: true })
      }
      if (!frames.length && filename) {
        const url = new URL(filename, 'https://www.edenia.study/')
        const name = url.pathname.split('/').pop()
        if (url.origin === 'https://www.edenia.study' && SOURCE_FILES.includes(name)) frames.push({ filename: name, lineno: Number(line) || 0, colno: Number(column) || 0, in_app: true })
      }
      if (!frames.length) return false // Browser extensions and third-party scripts.
      const type = ERROR_NAMES.includes(error?.name) ? error.name : 'Error'
      const fingerprint = `${type}:${frames[0].filename}:${frames[0].lineno}:${frames[0].colno}`
      if (lastSent.has(fingerprint) && now() - lastSent.get(fingerprint) < 60000) return false
      lastSent.set(fingerprint, now())
      report('runtime', 'failure', { reason: 'runtime-error' })
      return emit('$exception', { $exception_list: [{ type, value: 'Edenia encountered an unexpected error', stacktrace: { frames: frames.reverse(), type: 'raw' }, mechanism: { handled: false, type: 'generic' } }], $exception_fingerprint: fingerprint, $exception_level: 'error', $issue_name: 'Edenia encountered an unexpected error' })
    })
  }
  return {
    report, exception,
    start: () => safe(() => { if (started) return false; started = true; return report('app', 'started') }),
    ready: () => safe(() => { if (ready) return false; ready = true; return report('app', 'success', { duration: now(), backgrounded }) }),
    visibilityChanged: () => safe(() => { if (hidden()) backgrounded = true }),
    checkStartup: () => safe(() => { if (!ready && !hidden() && !backgrounded && !appSlowReported) { appSlowReported = true; return report('app', 'slow', { reason: 'startup-slow' }) } return false }),
    observeEvent: (event, properties = {}) => safe(() => {
      if (event === 'refresh_completed') {
        if (properties.result === 'skipped' || ['no_channels', 'daily_limit', 'cooldown', 'stale_profile', 'profile_changed'].includes(properties.failure_reason)) return false
        const outcome = properties.result === 'success' ? 'success' : properties.result === 'partial' ? 'degraded' : 'failure'
        return report('feed', outcome, { reason: outcome === 'success' ? 'none' : outcome === 'degraded' ? 'partial-refresh' : 'request-failed', duration: properties.elapsed_ms })
      }
      if (event === 'video_playback_session_ended' && properties.exit_reason === 'player_error') return report('player', 'failure', { reason: 'video-unavailable' })
      if (event === 'onboarding_recovery_shown') return report('app', 'degraded', { reason: 'startup-failed' })
      return false
    })
  }
}

// Host paths must retain their sync/async return values even if telemetry is
// unavailable, blocked by a browser, or throwing inside its transport.
export function reportWindowHealth(operation, outcome, options) {
  try { return globalThis.window?.edeniaHealth?.report(operation, outcome, options) || false } catch { return false }
}
