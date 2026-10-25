import { annotateStorageFailure } from './profile-storage-recovery.js'

// One bounded set of counters per page, with no activity history or timestamps
// persisted. Transactions compare counters to observe lifecycle changes.
export function createStorageLifecycleDiagnostics({ document = globalThis.document, eventTarget = globalThis.window } = {}) {
  const counts = { hidden: 0, frozen: 0, resumed: 0, pageHidden: 0, pageRestored: 0 }
  const visibility = () => {
    try { return ['visible', 'hidden'].includes(document?.visibilityState) ? document.visibilityState : 'unknown' }
    catch { return 'unknown' }
  }
  const listen = (target, type, callback) => { try { target?.addEventListener(type, callback) } catch {} }
  listen(document, 'visibilitychange', () => { if (visibility() === 'hidden') counts.hidden++ })
  listen(document, 'freeze', () => { counts.frozen++ })
  listen(document, 'resume', () => { counts.resumed++ })
  listen(eventTarget, 'pagehide', () => { counts.pageHidden++ })
  listen(eventTarget, 'pageshow', event => { if (event.persisted === true) counts.pageRestored++ })
  return { snapshot() {
    let wasDiscarded = false
    try { wasDiscarded = document?.wasDiscarded === true } catch {}
    return { ...counts, visibility: visibility(), wasDiscarded }
  } }
}

const pageLifecycle = createStorageLifecycleDiagnostics()

export function createStorageOperationMonitor({ storageTarget, timeoutMs = 8000, mode = 'unknown',
  lifecycle = pageLifecycle, now = () => globalThis.performance?.now() ?? Date.now() }) {
  const time = () => { try { const value = now(); return Number.isFinite(value) ? value : 0 } catch { return 0 } }
  const startedAt = time()
  const initial = lifecycle.snapshot()
  let requestState = 'pending'
  return {
    observe(transaction) {
      // Request success does not bubble, so observe the capture phase. Both
      // outcomes mean a request responded; an error is not a pending request.
      for (const event of ['success', 'error']) {
        try { transaction.addEventListener(event, () => { requestState = 'responded' }, { capture: true }) } catch {}
      }
    },
    failure(error, phase, eventType) {
      const elapsedMs = Math.max(0, time() - startedAt)
      const current = lifecycle.snapshot()
      return annotateStorageFailure(error, storageTarget, phase, {
        elapsedMs, timeoutMs, timerLatenessMs: eventType === 'timeout' ? Math.max(0, elapsedMs - timeoutMs) : undefined,
        mode, requestState, eventType,
        lifecycle: {
          visibilityAtStart: initial.visibility, visibilityAtEnd: current.visibility,
          hiddenDuringOperation: initial.visibility === 'hidden' || current.hidden > initial.hidden,
          frozenDuringOperation: current.frozen > initial.frozen,
          resumedDuringOperation: current.resumed > initial.resumed,
          pageHiddenDuringOperation: current.pageHidden > initial.pageHidden,
          pageRestoredDuringOperation: current.pageRestored > initial.pageRestored,
          wasDiscarded: current.wasDiscarded
        }
      })
    }
  }
}
