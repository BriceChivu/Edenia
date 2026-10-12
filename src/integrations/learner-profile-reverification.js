const FOCUS_REVERIFICATION_INTERVAL_MS = 60_000

export function createLearnerProfileReverificationController({
  eventTarget,
  visibilityTarget = eventTarget,
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
  let wasHidden = visibilityTarget?.hidden === true

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

  function handleVisibility() {
    if (visibilityTarget?.hidden === true) { wasHidden = true; return }
    if (wasHidden || visibilityTarget?.hidden === undefined) {
      wasHidden = false
      attempt({ force: true })
    }
  }
  function handlePageShow(event) {
    if (event?.persisted) attempt({ force: true })
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
    eventTarget.addEventListener('pageshow', handlePageShow)
    visibilityTarget?.addEventListener?.('visibilitychange', handleVisibility)
    return true
  }

  function destroy() {
    if (!started) return false
    started = false
    eventTarget.removeEventListener('focus', handleFocus)
    eventTarget.removeEventListener('offline', handleOffline)
    eventTarget.removeEventListener('online', handleOnline)
    eventTarget.removeEventListener('pageshow', handlePageShow)
    visibilityTarget?.removeEventListener?.('visibilitychange', handleVisibility)
    return true
  }

  return Object.freeze({ destroy, start })
}
