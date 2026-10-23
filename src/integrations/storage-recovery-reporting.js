// Report the failed attempt and the current durable outcome separately. A
// queued retry can finish before a diagnostic is ready for delivery.
export function createStorageRecoveryReporter({ workspace, deliver, getDetails, onOutcome = () => {} }) {
  const preparing = new Map()
  const outcomes = new Map()
  function remember(key, outcome) {
    outcomes.delete(key)
    outcomes.set(key, outcome)
    if (outcomes.size > 20) outcomes.delete(outcomes.keys().next().value)
  }
  async function report(operation, failure = { code: 'storage-unavailable' }, context = workspace.getDiagnosticContext()) {
    const key = context?.incidentId || 'standalone'
    const fallbackNotice = failure?.code === 'storage-fallback-saved'
    if (fallbackNotice && (preparing.has(key) || outcomes.get(key) === 'fallback-saved' || outcomes.get(key) === 'recovered')) return 'skipped'
    preparing.set(key, (preparing.get(key) || 0) + 1)
    let details
    try {
      if (['memory', 'session', 'indexed-db'].includes(workspace.getTier())) await workspace.whenSettled()
      const state = workspace.getDiagnosticState(context?.incidentId)
      const promoted = failure?.code === 'storage-recovered'
      if (promoted ? state.outcome !== 'recovered' : state.outcome === 'recovered') return 'skipped'
      if (fallbackNotice && state.outcome !== 'fallback-saved') return 'skipped'
      details = { ...getDetails(), ...context, operation, failure: failure || { code: 'storage-unavailable' }, ...state }
      remember(key, state.outcome)
      onOutcome({ ...state, failure: details.failure })
    } catch { return 'failed' }
    finally {
      const remaining = preparing.get(key) - 1
      if (remaining) preparing.set(key, remaining)
      else preparing.delete(key)
    }
    // Network delivery must not hold up a later durable-outcome notification.
    try { return await deliver(details) } catch { return 'failed' }
  }
  return {
    report,
    recoverySaved() {
      return report('recovery', { code: 'storage-fallback-saved', phase: 'readback' })
    }
  }
}
