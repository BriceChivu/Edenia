// Browser cooperation only: this cannot reserve capacity for the Cloud project.
// search.list has its own bucket; read endpoints share the general daily bucket.
const DAILY_REASONS = new Set(['quotaExceeded', 'dailyLimitExceeded'])
const pacificDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
})

export function nextYoutubeQuotaReset(now) {
  const today = pacificDate.format(now)
  let low = now
  let high = now + 26 * 60 * 60_000
  // Find the next calendar boundary in Pacific time, including 23/25 hour days.
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (pacificDate.format(middle) === today) low = middle
    else high = middle
  }
  return high
}

export function isYoutubeQuotaError(error) {
  return error?.kind === 'daily-quota'
}

function providerError(status, body) {
  const error = new Error(body?.error?.message || `HTTP ${status}`)
  error.status = status
  error.reasons = (body?.error?.errors || []).map(entry => entry.reason).filter(Boolean)
  error.kind = error.reasons.some(reason => DAILY_REASONS.has(reason)) ? 'daily-quota'
    : status === 429 || error.reasons.some(reason => ['rateLimitExceeded', 'userRateLimitExceeded'].includes(reason)) ? 'rate-limit'
    : status === 401 || error.reasons.some(reason => ['keyInvalid', 'authError', 'accessNotConfigured'].includes(reason)) ? 'credentials'
    : status === 404 || error.reasons.includes('videoNotFound') ? 'unavailable'
    : 'provider'
  return error
}

export function createYoutubeRequestGate({
  fetch: request = globalThis.fetch,
  storage = globalThis.localStorage,
  locks = globalThis.navigator?.locks,
  now = Date.now,
  namespace = 'edenia_youtube_quota',
  timeoutMs = 15_000
} = {}) {
  const queues = new Map()
  const cooldowns = new Map()
  function readCooldown(bucket) {
    let cooldown = cooldowns.get(bucket)
    try {
      const stored = JSON.parse(storage?.getItem(`${namespace}:${bucket}`) || 'null')
      if (Number.isFinite(stored?.retryAt) && stored.retryAt > (cooldown?.retryAt || 0)) cooldown = stored
    } catch { /* Keep the in-memory gate when storage is unavailable. */ }
    return cooldown
  }
  function youtubeRequest(url) {
    const endpoint = new URL(url).pathname.split('/').at(-1)
    const bucket = endpoint === 'search' ? 'search' : 'general'
    const key = `${namespace}:${bucket}`
    const run = async () => {
      const cooldown = readCooldown(bucket)
      if (cooldown?.retryAt > now()) {
        throw Object.assign(new Error(cooldown.message), cooldown, { kind: 'daily-quota', bucket })
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await request(url, { signal: controller.signal })
        if (response.ok) return await response.json()
        const error = providerError(response.status, await response.json().catch(() => ({})))
        error.bucket = bucket
        if (isYoutubeQuotaError(error)) {
          error.retryAt = nextYoutubeQuotaReset(now())
          const record = { retryAt: error.retryAt, reasons: error.reasons, status: error.status, message: error.message }
          cooldowns.set(bucket, record)
          try { storage?.setItem(key, JSON.stringify(record)) } catch { /* In-memory protection remains. */ }
        }
        throw error
      } finally {
        clearTimeout(timer)
      }
    }
    // Web Locks serialize the request and cooldown write across same-origin tabs.
    // The local queue also protects environments without Web Locks.
    const previous = queues.get(bucket) || Promise.resolve()
    const pending = previous.catch(() => {}).then(() => locks?.request ? locks.request(key, run) : run())
    queues.set(bucket, pending)
    return pending
  }
  youtubeRequest.retryAt = bucket => readCooldown(bucket)?.retryAt || 0
  return youtubeRequest
}
