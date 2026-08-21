const FOCUS_REVERIFICATION_INTERVAL_MS = 60_000

export function createLearnerProfileReverificationController({
  eventTarget,
  isEligible,
  now,
  reverify
}) {
  if (
    !eventTarget?.addEventListener
    || !eventTarget?.removeEventListener
    || typeof isEligible !== 'function'
    || typeof now !== 'function'
    || typeof reverify !== 'function'
  ) {
    throw new TypeError('Profile reverification requires browser adapters')
  }
  let inFlight = null
  let lastAttemptAt = Number.NEGATIVE_INFINITY
  let started = false
  let wasOffline = false

  function attempt({ force = false } = {}) {
    if (!started || inFlight || !isEligible()) return false
    const attemptedAt = now()
    if (
      !force
      && attemptedAt - lastAttemptAt < FOCUS_REVERIFICATION_INTERVAL_MS
    ) return false
    lastAttemptAt = attemptedAt
    let result
    try {
      result = reverify()
    } catch {
      result = null
    }
    inFlight = Promise.resolve(result).finally(() => {
      inFlight = null
    })
    return true
  }

  function handleFocus() {
    attempt()
  }

  function handleOffline() {
    wasOffline = true
  }

  function handleOnline() {
    const force = wasOffline
    wasOffline = false
    attempt({ force })
  }

  function start() {
    if (started) return false
    started = true
    eventTarget.addEventListener('focus', handleFocus)
    eventTarget.addEventListener('offline', handleOffline)
    eventTarget.addEventListener('online', handleOnline)
    return true
  }

  function destroy() {
    if (!started) return false
    started = false
    eventTarget.removeEventListener('focus', handleFocus)
    eventTarget.removeEventListener('offline', handleOffline)
    eventTarget.removeEventListener('online', handleOnline)
    return true
  }

  return Object.freeze({ destroy, start })
}
