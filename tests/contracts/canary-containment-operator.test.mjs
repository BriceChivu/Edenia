import assert from 'node:assert/strict'
import test from 'node:test'
import { containCanary, READ_GATE_SQL, containTrial, enableTrialSql, READ_TRIAL_GATE_SQL } from '../../scripts/canary-containment-operator.mjs'

const owner = '11111111-1111-1111-1111-111111111111'
function fixture(state = { rollout_state: 'developer-canary', owner }) {
  let disabled = false
  const writes = []
  return {
    writes,
    operator: {
      async query(sql) {
        if (sql === READ_GATE_SQL) return [{ ...state }]
        writes.push('gate')
        state = { rollout_state: 'off', owner: null }
        return [{ rollout_state: 'off' }]
      },
      async monitorDisabled() { return disabled },
      async disableMonitor() { writes.push('monitor'); disabled = true }
    }
  }
}

test('containment establishes gate-off and monitor-off and fences repeated containment', async () => {
  const { operator, writes } = fixture()
  assert.equal((await containCanary(operator, owner)).gateOff, true)
  assert.deepEqual(writes, ['gate', 'monitor'])
  assert.equal((await containCanary(operator, owner)).gateWriteAttempted, true)
  assert.deepEqual(writes, ['gate', 'monitor', 'gate'])
})

test('containment never takes over another owner, public gate, or ambiguous off state', async () => {
  for (const state of [
    { rollout_state: 'developer-canary', owner: '22222222-2222-2222-2222-222222222222' },
    { rollout_state: 'signed-in-public', owner: null },
    { rollout_state: 'off', owner }
  ]) {
    const { operator, writes } = fixture(state)
    await assert.rejects(containCanary(operator, owner), /does not match/)
    assert.deepEqual(writes, [])
  }
})

test('an unverified gate transition prevents monitor mutation and an unknown result is not retried', async () => {
  const { operator, writes } = fixture()
  operator.query = async sql => sql === READ_GATE_SQL ? [{ rollout_state: 'developer-canary', owner }] : []
  await assert.rejects(containCanary(operator, owner), /not verified/)
  assert.deepEqual(writes, [])
  let calls = 0
  operator.query = async () => { calls++; throw new Error('unknown outcome') }
  await assert.rejects(containCanary(operator, owner), /unknown outcome/)
  assert.equal(calls, 1)
})

const secondOwner = '22222222-2222-2222-2222-222222222222'
test('trial containment requires the exact audience and clears admission on repeat', async () => {
  let state = { rollout_state: 'tester-trial', owner: null, testers: [secondOwner, owner] }
  const statements = []
  const operator = {
    query: async sql => {
      if (sql === READ_TRIAL_GATE_SQL) return [state]
      statements.push(sql)
      state = { rollout_state: 'off', owner: null, testers: [] }
      return [{ rollout_state: 'off' }]
    }, monitorDisabled: async () => true
  }
  assert.equal((await containTrial(operator, [owner, secondOwner])).audienceRemoved, true)
  assert.equal((await containTrial(operator, [secondOwner, owner])).gateOff, true)
  assert.equal(statements.length, 2)
  assert.match(statements[0], /tester_user_ids = '\{\}'::uuid\[\]/)
})
test('trial containment rejects audience drift, foreign stages and SQL input before mutation', async () => {
  for (const state of [
    { rollout_state: 'tester-trial', owner: null, testers: [owner, secondOwner] },
    { rollout_state: 'tester-trial', owner: null, testers: [owner, owner] },
    { rollout_state: 'off', owner: null, testers: [owner] },
    { rollout_state: 'signed-in-public', owner: null, testers: [] },
    { rollout_state: 'developer-canary', owner, testers: [] }
  ]) {
    const operator = { query: async sql => { assert.equal(sql, READ_TRIAL_GATE_SQL); return [state] } }
    await assert.rejects(containTrial(operator, [owner]), /does not match/)
  }
  for (const ids of [[], [owner, owner], ["';select 1;--"]]) {
    assert.throws(() => enableTrialSql(ids, '2026-10-08 00:00:00+00'), /Invalid trial audience/)
  }
  assert.throws(() => enableTrialSql([owner], "';select 1;--"), /Invalid gate fence/)
})
test('trial containment refuses unknown write outcomes before touching the monitor', async () => {
  const operator = { query: async sql => sql === READ_TRIAL_GATE_SQL
    ? [{ rollout_state: 'tester-trial', owner: null, testers: [owner] }] : [],
    monitorDisabled: async () => assert.fail('Unverified transition must not touch monitor') }
  await assert.rejects(containTrial(operator, [owner]), /not verified/)
})
