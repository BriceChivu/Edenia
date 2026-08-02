import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PLUS_ENTITLEMENT_STATES
} from '../../src/domain/plus-access-policy.js'
import {
  getPlusEntitlementState,
  PLUS_PAYMENT_GRACE_PERIOD_MS,
  readPlusEntitlement
} from '../../src/domain/plus-entitlement.js'

function createQueryResult(result) {
  const calls = []
  const query = {
    select(columns) {
      calls.push(['select', columns])
      return this
    },
    eq(column, value) {
      calls.push(['eq', column, value])
      return this
    },
    async maybeSingle() {
      calls.push(['maybeSingle'])
      return result
    }
  }
  const client = {
    from(table) {
      calls.push(['from', table])
      return query
    }
  }
  return { calls, client }
}

test('subscription statuses and failed-payment grace map to the entitlement contract', () => {
  const now = Date.parse('2026-08-01T00:00:00.000Z')
  assert.equal(
    getPlusEntitlementState({ status: 'active' }, now),
    PLUS_ENTITLEMENT_STATES.PLUS
  )
  assert.equal(
    getPlusEntitlementState({
      status: 'past_due',
      past_due_since: new Date(now - PLUS_PAYMENT_GRACE_PERIOD_MS + 1).toISOString()
    }, now),
    PLUS_ENTITLEMENT_STATES.PAYMENT_PROBLEM
  )
  assert.equal(
    getPlusEntitlementState({
      status: 'past_due',
      past_due_since: new Date(now - PLUS_PAYMENT_GRACE_PERIOD_MS).toISOString()
    }, now),
    PLUS_ENTITLEMENT_STATES.FREE
  )
  assert.equal(
    getPlusEntitlementState({ status: 'past_due', past_due_since: null }, now),
    PLUS_ENTITLEMENT_STATES.FREE
  )
  for (const status of ['canceled', 'unpaid', 'incomplete', 'paused', 'trialing']) {
    assert.equal(
      getPlusEntitlementState({ status }, now),
      PLUS_ENTITLEMENT_STATES.FREE
    )
  }
  assert.equal(getPlusEntitlementState(null, now), PLUS_ENTITLEMENT_STATES.FREE)
})

test('entitlement lookup reads only the authenticated user subscription fields', async () => {
  const { calls, client } = createQueryResult({
    data: {
      status: 'active',
      plan: 'founding_monthly',
      current_period_end: '2026-09-01T00:00:00.000Z',
      cancel_at_period_end: true,
      past_due_since: null,
      updated_at: '2026-08-01T00:00:00.000Z'
    },
    error: null
  })

  assert.deepEqual(await readPlusEntitlement(client, 'user-1'), {
    entitlementState: PLUS_ENTITLEMENT_STATES.PLUS,
    subscriptionStatus: 'active',
    plan: 'founding_monthly',
    currentPeriodEnd: '2026-09-01T00:00:00.000Z',
    cancelAtPeriodEnd: true,
    pastDueSince: null,
    updatedAt: '2026-08-01T00:00:00.000Z'
  })
  assert.deepEqual(calls, [
    ['from', 'subscriptions'],
    ['select', 'status, plan, current_period_end, cancel_at_period_end, past_due_since, updated_at'],
    ['eq', 'user_id', 'user-1'],
    ['maybeSingle']
  ])
})

test('missing rows resolve Free while backend failures remain distinguishable', async () => {
  const missing = createQueryResult({ data: null, error: null })
  assert.equal(
    (await readPlusEntitlement(missing.client, 'user-1')).entitlementState,
    PLUS_ENTITLEMENT_STATES.FREE
  )

  const backendError = new Error('backend unavailable')
  const failed = createQueryResult({ data: null, error: backendError })
  await assert.rejects(
    readPlusEntitlement(failed.client, 'user-1'),
    error => error === backendError
  )
  await assert.rejects(
    readPlusEntitlement(failed.client, ''),
    /authenticated user/
  )
})
