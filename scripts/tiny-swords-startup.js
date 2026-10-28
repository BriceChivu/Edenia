// Browser startup only. Godot owns restoration, first draw, and the live game.
const stages = ['document', 'assets', 'engine', 'scene', 'restore']
const deadlines = { document: 20000, assets: 20000, engine: 45000, scene: 20000, restore: 20000 }
const reasons = ['network', 'http-missing', 'http-server', 'timeout', 'integrity', 'decoder', 'script', 'engine', 'unsupported', 'restore']
export function createIslandStartupController({ begin, retire, state: onState, record = () => {},
  visible, eligible, valid, recover = () => {}, now = () => performance.now(), random = Math.random,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  let state = 'waiting-profile', attempt = null, epoch = 0, nextId = 0, count = 0
  let timer = null, scheduledAt = 0, deadline = 0, remaining = 0, due = 0, repairing = false
  let stage = 'document', delivery = 'streaming', progress = 0, started = 0, cycleStarted = 0
  let wasVisible = visible(), sleepGraceUsed = false
  let slowAt = 0, slowRemaining = 20000, slowReported = false
  function clear() { if (timer !== null) clearTimer(timer); timer = null }
  function transition(value) { state = value; onState(value) }
  function observe(outcome, detail = {}) {
    record({ outcome, stage, delivery, cycle: epoch, attempt: count, duration: Math.max(0, now() - started),
      totalDuration: Math.max(0, now() - cycleStarted), ...detail })
  }
  function live(token) {
    if (state !== 'loading' || token !== attempt) return false
    return valid() && state === 'loading' && token === attempt
  }
  function queue(delay) {
    clear()
    const generation = epoch
    scheduledAt = now() + delay
    timer = setTimer(() => { timer = null; if (generation === epoch) tick() }, delay)
  }
  function queueLoading() { queue(Math.max(0, Math.min(deadline - now(), slowReported ? Infinity : slowAt - now()))) }
  function stop(value = 'disposed') {
    const mounted = attempt !== null
    const generation = ++epoch
    clear(); attempt = null; repairing = false
    if (mounted) retire()
    if (epoch !== generation) return false
    transition(value)
    return true
  }
  function mount() {
    if (!valid()) { stop('waiting-profile'); return }
    if (!eligible()) return
    count++; stage = 'document'; progress = 0; started = now(); sleepGraceUsed = false
    slowReported = false; slowRemaining = 20000; slowAt = now() + slowRemaining
    remaining = deadlines[stage]; deadline = now() + remaining; wasVisible = visible()
    attempt = { id: ++nextId, number: count, delivery }
    transition('loading'); observe('started')
    const token = attempt
    if (wasVisible) queueLoading()
    begin(token)
  }
  function tick() {
    if (!valid()) { stop('waiting-profile'); return }
    if (state === 'loading') {
      if (!visible()) return
      // A suspended renderer can deliver an already-expired timer before its
      // lifecycle events. Reconcile once, rather than treating sleep as a hang.
      if (!sleepGraceUsed && now() >= deadline && now() - scheduledAt > 2000) {
        sleepGraceUsed = true; deadline = now() + 2000; slowAt = now() + 2000
      }
      if (!slowReported && now() >= slowAt) { slowReported = true; observe('slow') }
      if (now() < deadline) { queueLoading(); return }
      fail(attempt, { reason: 'timeout' })
    } else if (state === 'retry-wait' || state === 'dormant') {
      if (!eligible() || repairing) return
      if (now() < due) { queue(due - now()); return }
      mount()
    }
  }
  function reconcile() {
    if (state === 'disposed' || state === 'waiting-profile') return
    if (!valid()) { stop('waiting-profile'); return }
    if (state === 'ready' || state === 'restore-blocked') return
    const showing = visible()
    if (state === 'loading') {
      if (!showing && wasVisible) {
        remaining = Math.max(0, deadline - now()); slowRemaining = Math.max(0, slowAt - now()); clear()
      }
      if (showing && !wasVisible) {
        deadline = now() + Math.max(remaining, 2000); slowAt = now() + Math.max(slowRemaining, 2000); queueLoading()
      }
      wasVisible = showing
    } else {
      clear()
      if (!eligible() && state === 'retry-wait') transition('dormant')
      if (eligible() && !repairing && Number.isFinite(due)) {
        if (due <= now()) mount()
        else queue(due - now())
      }
    }
  }
  function fail(token, detail = {}) {
    if (!live(token)) return false
    const reason = reasons.includes(detail.reason) ? detail.reason : 'engine'
    const asset = ['engine', 'pack', 'script', 'none'].includes(detail.asset) ? detail.asset : 'none'
    const failureGeneration = epoch
    observe('failure', { reason, asset })
    if (failureGeneration !== epoch || attempt !== token) return false
    clear(); attempt = null; retire()
    if (failureGeneration !== epoch) return true
    if (reason === 'restore' || reason === 'unsupported') {
      transition(reason === 'restore' ? 'restore-blocked' : 'dormant')
      // Unsupported capability cannot improve through repeated compilation.
      due = Infinity
      return true
    }
    if (['integrity', 'decoder'].includes(reason) || count >= 2) delivery = 'ordinary'
    const fast = count < 3
    const delay = fast ? (count === 1 ? 500 : 2000) + Math.floor(random() * 150)
      : count === 3 ? 30000 : count === 4 ? 120000 : 300000
    due = now() + delay
    transition(fast ? 'retry-wait' : 'dormant')
    const generation = epoch
    // Only failure recovery can await a bounded release lookup. The healthy
    // path never invokes it or adds a prerequisite request.
    let pending
    try { pending = recover({ reason, asset, stage, attempt: count }) } catch {}
    if (pending && typeof pending.then === 'function') {
      repairing = true
      Promise.resolve(pending).catch(() => {}).finally(() => {
        if (generation !== epoch) return
        repairing = false; reconcile()
      })
    }
    reconcile()
    return true
  }
  return {
    get state() { return state }, get attempt() { return attempt },
    start() {
      if (!stop()) return
      count = 0; delivery = 'streaming'; cycleStarted = now(); started = now()
      transition('retry-wait'); due = now(); reconcile()
    },
    stop, reconcile, fail,
    advance(token, next) {
      if (!live(token) || !stages.includes(next) || stages.indexOf(next) <= stages.indexOf(stage)) return
      stage = next; remaining = deadlines[stage]; deadline = now() + remaining
      if (visible()) queueLoading()
    },
    activity(token, bytes) {
      // Progress only extends this attempt's deadline. Avoid parsing the saved
      // island per chunk; transitions/readiness still validate current access.
      if (state !== 'loading' || token !== attempt || !Number.isFinite(bytes) || bytes <= progress) return
      progress = bytes; remaining = deadlines[stage]; deadline = now() + remaining
      // The existing timer rechecks the extended deadline. No per-chunk timer.
    },
    ready(token) {
      if (!live(token)) return false
      clear(); transition('ready')
      if (attempt !== token || state !== 'ready') return false
      observe(count > 1 ? 'recovered' : 'success')
      return attempt === token && state === 'ready'
    }
  }
}
