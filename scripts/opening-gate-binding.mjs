import { createHash } from 'node:crypto'
import { containCanary, containTrial, enableCanarySql, enableTrialSql, READ_GATE_SQL, READ_TRIAL_GATE_SQL } from './canary-containment-operator.mjs'

// One private binding drives both executor and independent watchdog. An absent
// surface preserves historical canaries; trial admission must always be explicit.
export function openingGateBinding(config) {
  const surface = config.surface ?? 'public'
  if (!['public', 'trial'].includes(surface)) throw new Error('Invalid opening surface')
  const trial = surface === 'trial'
  const stage = trial ? 'tester-trial' : 'developer-canary'
  const testers = trial ? [...(config.expectedTesters || [])].sort() : null
  // Validate before creating a lease, browser or operator capability.
  if (trial) {
    enableTrialSql(testers, '2026-01-01 00:00:00+00')
    if (!testers.includes(config.expectedOwner)) throw new Error('Opening owner is outside the reviewed trial audience')
  } else {
    enableCanarySql(config.expectedOwner, '2026-01-01 00:00:00+00')
    if (config.expectedTesters !== undefined) throw new Error('Trial audience requires trial surface')
  }
  const identityHash = createHash('sha256').update(JSON.stringify({ surface, owner: config.expectedOwner, testers })).digest('hex')
  return {
    surface, stage, identityHash,
    readSql: trial ? READ_TRIAL_GATE_SQL : READ_GATE_SQL,
    directory: trial ? 'auth-trial-opening' : 'canary-execution',
    issue: trial ? 177 : 286,
    async verifyAudience(operator) {
      if (!trial) return
      const audience = `array[${testers.map(id => `'${id}'::uuid`).join(',')}]`
      const rows = await operator.query(`select count(*)::integer as admitted from auth.users where id = any(${audience}) and confirmed_at is not null and deleted_at is null and not coalesce(is_anonymous, false) and not private.learner_profile_account_is_locked(id);`)
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0].admitted !== testers.length) throw new Error('Reviewed trial accounts are not all eligible')
    },
    assertState(state) {
      const matches = trial
        ? state?.owner === null && Array.isArray(state.testers)
          && (state.rollout_state === 'off' && state.testers.length === 0
            || state.rollout_state === stage && JSON.stringify([...state.testers].sort()) === JSON.stringify(testers))
        : state?.rollout_state === 'off' && state.owner === null
          || state?.rollout_state === stage && state.owner === config.expectedOwner
      if (!matches) throw new Error('Unexpected gate ownership or audience')
      return state
    },
    contain: operator => trial ? containTrial(operator, testers) : containCanary(operator, config.expectedOwner),
    enableSql: version => trial ? enableTrialSql(testers, version) : enableCanarySql(config.expectedOwner, version)
  }
}
