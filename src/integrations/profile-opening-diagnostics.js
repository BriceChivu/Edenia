// Local trial diagnostics only. No transport, persistence, identity or profile
// payload enters this boundary. Phase names and terminal outcomes are fixed.
const STARTUP_PHASES = new Set(['script-ready', 'journal-ready',
  'session-preparation-start', 'session-preparation-end', 'backup-ready',
  'local-storage-ready', 'auth-ready'])
const OPENING_PHASES = new Set(['opening-start', 'opening-rpc-start',
  'opening-rpc-end', 'activation', 'usable-frame'])
const OUTCOMES = new Set(['active', 'locked', 'waiting-authentication',
  'onboarding-required', 'recovering', 'conflicting', 'waiting-cloud',
  'account-change', 'reloading', 'replacing'])

export function createProfileOpeningDiagnostics({ enabled = false,
  now = () => performance.now() } = {}) {
  const startup = {}
  const attempts = []
  let current = null
  const time = () => {
    try {
      const value = now()
      return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0
    } catch { return 0 }
  }
  function markStartup(phase) {
    if (enabled && STARTUP_PHASES.has(phase) && !Object.hasOwn(startup, phase)) {
      startup[phase] = time()
    }
  }
  function capture() {
    const attempt = current
    return Object.freeze({ mark(phase) {
      if (!enabled || !attempt || current !== attempt
        || !OPENING_PHASES.has(phase) || attempt.phases.length >= 16) return
      attempt.phases.push({ phase, at: time() })
    } })
  }
  function begin() {
    if (!enabled || current) return
    current = { phases: [], outcome: null }
    attempts.push(current)
    if (attempts.length > 8) attempts.shift()
    capture().mark('opening-start')
  }
  function finish(outcome) {
    if (!enabled || !current || !OUTCOMES.has(outcome)) return
    current.outcome = outcome
    current.finishedAt = time()
    current = null
  }
  return Object.freeze({ begin, capture, finish, markStartup,
    read: () => ({ schema: 1, startup: { ...startup },
      attempts: attempts.map(attempt => ({ ...attempt,
        phases: attempt.phases.map(phase => ({ ...phase })) })) })
  })
}
