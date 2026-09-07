import assert from 'node:assert/strict'
import test from 'node:test'
import { containCanary, READ_GATE_SQL } from '../../scripts/canary-containment-operator.mjs'

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

test('containment establishes gate-off and monitor-off then becomes a read-only no-op', async () => {
  const { operator, writes } = fixture()
  assert.equal((await containCanary(operator, owner)).gateOff, true)
  assert.deepEqual(writes, ['gate', 'monitor'])
  assert.equal((await containCanary(operator, owner)).gateWriteAttempted, false)
  assert.deepEqual(writes, ['gate', 'monitor'])
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
