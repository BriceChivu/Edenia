import { nextYoutubeQuotaReset } from './youtube-quota.js'

const BACKOFF = 30 * 60_000

// This is an origin/browser allowance, not a reservation of project-wide quota.
// The daily cache contains public provider metadata only, never learner state.
export function createYoutubeMetadataBudget({
  storage = globalThis.localStorage, locks = globalThis.navigator?.locks,
  now = Date.now, namespace = 'edenia_youtube_metadata_recovery',
  maxPerRun = 5, maxPerDay = 20
} = {}) {
  let memory = null
  let pending = Promise.resolve()
  const read = () => {
    let record = memory
    try { record = JSON.parse(storage?.getItem(namespace) || 'null') || record } catch { /* In-memory fallback. */ }
    if (!record || record.resetAt <= now()) {
      record = { resetAt: nextYoutubeQuotaReset(now()), used: 0, retryAt: 0, cache: {} }
      memory = record
      try { storage?.setItem(namespace, JSON.stringify(record)) } catch { /* Reservations still fail closed if persistence is blocked. */ }
    }
    return record
  }
  const write = record => {
    memory = record
    storage?.setItem(namespace, JSON.stringify(record))
  }
  const deferred = retryAt => Object.assign(new Error('Metadata recovery paused'), { kind: 'recovery-budget', retryAt })
  return {
    retryAt: () => { const record = read(); return record.used >= maxPerDay ? record.resetAt : record.retryAt },
    createRun() {
      let used = 0
      return async (phase, ids, fetch) => {
        const run = async () => {
          const record = read()
          const cacheKey = id => `${phase}:${id}`
          const missing = ids.filter(id => !Object.hasOwn(record.cache, cacheKey(id)))
          if (missing.length) {
            if (record.used >= maxPerDay) throw deferred(record.resetAt)
            if (record.retryAt > now()) throw deferred(record.retryAt)
            if (used >= maxPerRun) throw deferred(now() + BACKOFF)
            // Reserve before sending, so errors and reloads cannot refund requests.
            record.used++
            used++
            if (used >= maxPerRun) record.retryAt = now() + BACKOFF
            try { write(record) } catch { throw deferred(now() + BACKOFF) }
            try {
              const details = await fetch(missing)
              for (const id of missing) record.cache[cacheKey(id)] = {
                metadataFetchedAt: new Date(now()).toISOString(),
                ...(details[id] || { metadataUnavailable: true })
              }
              write(record)
            } catch (error) {
              record.retryAt = Math.max(record.retryAt, error.retryAt || now() + BACKOFF)
              try { write(record) } catch { /* Reservation remains in memory. */ }
              throw error
            }
          }
          return Object.fromEntries(ids.map(id => [id, record.cache[cacheKey(id)]]))
        }
        const next = pending.catch(() => {}).then(() => locks?.request ? locks.request(namespace, run) : run())
        pending = next
        return next
      }
    }
  }
}
