import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getSubscriptionUpdate,
  reconcileCurrentSubscription,
} from './subscription-lifecycle.ts'

const original = {
  id: 'sub_1',
  status: 'active',
  cancel_at_period_end: false,
  current_period_end: 1_800_000_000,
}

const renewed = {
  ...original,
  current_period_end: 1_900_000_000,
}

test('builds the database dates from the current Stripe subscription', () => {
  assert.deepEqual(
    getSubscriptionUpdate(original, undefined, '2026-07-24T00:00:00.000Z'),
    {
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: '2027-01-15T08:00:00.000Z',
      past_due_since: null,
      updated_at: '2026-07-24T00:00:00.000Z',
    },
  )
})

test('starts failed-payment grace once, preserves it, and clears it on recovery', () => {
  const failedAt = '2026-07-24T00:00:00.000Z'
  const retriedAt = '2026-07-25T00:00:00.000Z'
  const pastDue = { ...original, status: 'past_due' }

  assert.equal(
    getSubscriptionUpdate(pastDue, undefined, failedAt).past_due_since,
    failedAt,
  )
  assert.equal(
    getSubscriptionUpdate(pastDue, failedAt, retriedAt).past_due_since,
    failedAt,
  )
  assert.equal(
    getSubscriptionUpdate(original, failedAt, retriedAt).past_due_since,
    null,
  )
  assert.equal(
    getSubscriptionUpdate({ ...original, status: 'canceled' }, failedAt, retriedAt)
      .past_due_since,
    null,
  )
})

test('persists cancellation, pause, and reactivation from current Stripe state', () => {
  const updatedAt = '2026-07-25T00:00:00.000Z'
  for (const status of ['canceled', 'unpaid', 'paused']) {
    assert.deepEqual(
      getSubscriptionUpdate({ ...original, status }, '2026-07-24T00:00:00.000Z', updatedAt),
      {
        status,
        cancel_at_period_end: false,
        current_period_end: '2027-01-15T08:00:00.000Z',
        past_due_since: null,
        updated_at: updatedAt,
      },
    )
  }

  assert.equal(
    getSubscriptionUpdate(original, '2026-07-24T00:00:00.000Z', updatedAt).status,
    'active',
  )
})

test('writes once when Stripe remains unchanged', async () => {
  const writes: number[] = []

  await reconcileCurrentSubscription(
    async () => original,
    async subscription => {
      writes.push(subscription.current_period_end)
    },
  )

  assert.deepEqual(writes, [original.current_period_end])
})

test('persists and reconciles scheduled cancellation changes', async () => {
  assert.equal(
    getSubscriptionUpdate({ ...original, cancel_at_period_end: true })
      .cancel_at_period_end,
    true,
  )
  const writes: boolean[] = []
  const canceling = { ...original, cancel_at_period_end: true }
  const snapshots = [original, canceling, canceling]
  await reconcileCurrentSubscription(
    async () => snapshots.shift()!,
    async subscription => {
      writes.push(subscription.cancel_at_period_end)
    },
  )
  assert.deepEqual(writes, [false, true])
})

test('rewrites a stale snapshot when Stripe changes during the first write', async () => {
  const snapshots = [original, renewed, renewed]
  const writes: number[] = []

  await reconcileCurrentSubscription(
    async () => snapshots.shift()!,
    async subscription => {
      writes.push(subscription.current_period_end)
    },
  )

  assert.deepEqual(writes, [
    original.current_period_end,
    renewed.current_period_end,
  ])
})

test('fails for a retry when Stripe keeps changing during reconciliation', async () => {
  const renewedAgain = {
    ...renewed,
    current_period_end: 2_000_000_000,
  }
  const snapshots = [original, renewed, renewedAgain]

  await assert.rejects(
    reconcileCurrentSubscription(
      async () => snapshots.shift()!,
      async () => {},
    ),
    /changed while its current state was being saved/,
  )
})
