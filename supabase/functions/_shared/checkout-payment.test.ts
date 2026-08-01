import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getStripeReferenceId,
  isPaidEdeniaPlusCheckoutSession,
} from './checkout-payment.ts'

const paidSession = {
  mode: 'subscription',
  status: 'complete',
  payment_status: 'paid',
  customer: 'cus_paid',
  subscription: 'sub_paid',
  metadata: { plan: 'annual' },
}

test('accepts a completed, paid Edenia Plus subscription Checkout Session', () => {
  assert.equal(isPaidEdeniaPlusCheckoutSession(paidSession), true)
})

test('rejects a completed but unpaid Checkout Session', () => {
  assert.equal(isPaidEdeniaPlusCheckoutSession({
    ...paidSession,
    payment_status: 'unpaid',
  }), false)
})

test('rejects a no-payment-required Checkout Session', () => {
  assert.equal(isPaidEdeniaPlusCheckoutSession({
    ...paidSession,
    payment_status: 'no_payment_required',
  }), false)
})

test('rejects paid sessions that are incomplete or are not subscriptions', () => {
  assert.equal(isPaidEdeniaPlusCheckoutSession({
    ...paidSession,
    status: 'open',
  }), false)
  assert.equal(isPaidEdeniaPlusCheckoutSession({
    ...paidSession,
    mode: 'payment',
  }), false)
})

test('rejects sessions without an Edenia plan, customer, or subscription', () => {
  assert.equal(isPaidEdeniaPlusCheckoutSession({
    ...paidSession,
    metadata: { plan: 'other-product' },
  }), false)
  assert.equal(isPaidEdeniaPlusCheckoutSession({
    ...paidSession,
    customer: null,
  }), false)
  assert.equal(isPaidEdeniaPlusCheckoutSession({
    ...paidSession,
    subscription: null,
  }), false)
})

test('extracts Stripe IDs from string and expanded-object references', () => {
  assert.equal(getStripeReferenceId('sub_string'), 'sub_string')
  assert.equal(getStripeReferenceId({ id: 'sub_expanded' }), 'sub_expanded')
  assert.equal(getStripeReferenceId(null), null)
})
