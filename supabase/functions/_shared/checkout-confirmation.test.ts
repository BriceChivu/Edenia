import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateCheckoutConfirmation } from './checkout-confirmation.ts'

const expected = {
  customerId: 'cus_expected',
  subscriptionId: 'sub_expected',
  plan: 'annual',
}

const confirmedSubscription = {
  user_id: 'user_expected',
  stripe_customer_id: expected.customerId,
  stripe_subscription_id: expected.subscriptionId,
  status: 'active',
  plan: expected.plan,
}

test('keeps checkout pending until the webhook subscription row exists', () => {
  assert.deepEqual(evaluateCheckoutConfirmation(null, expected), { state: 'pending' })
})

test('confirms active and past-due subscriptions written by the webhook', () => {
  assert.deepEqual(
    evaluateCheckoutConfirmation(confirmedSubscription, expected),
    { state: 'confirmed', userId: 'user_expected' },
  )
  assert.deepEqual(
    evaluateCheckoutConfirmation({ ...confirmedSubscription, status: 'past_due' }, expected),
    { state: 'confirmed', userId: 'user_expected' },
  )
})

test('rejects a row for a different customer, subscription, plan, or user', () => {
  for (const mismatch of [
    { stripe_customer_id: 'cus_other' },
    { stripe_subscription_id: 'sub_other' },
    { plan: 'monthly' },
    { user_id: null },
  ]) {
    assert.equal(
      evaluateCheckoutConfirmation({ ...confirmedSubscription, ...mismatch }, expected).state,
      'invalid',
    )
  }
})

test('rejects subscription states that do not grant Plus', () => {
  for (const status of ['trialing', 'paused', 'unpaid', 'canceled', 'incomplete']) {
    assert.deepEqual(
      evaluateCheckoutConfirmation({ ...confirmedSubscription, status }, expected),
      {
        state: 'invalid',
        code: 'checkout_subscription_not_entitled',
        message: 'Confirmed subscription does not currently grant Plus access',
      },
    )
  }
})
