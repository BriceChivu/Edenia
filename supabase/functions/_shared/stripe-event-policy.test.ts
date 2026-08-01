import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getStripeBillingEventAction,
  STRIPE_BILLING_EVENT_ACTIONS,
} from './stripe-event-policy.ts'

test('routes successful checkout and asynchronous payment transitions', () => {
  assert.equal(
    getStripeBillingEventAction('checkout.session.completed'),
    STRIPE_BILLING_EVENT_ACTIONS.COMPLETE_CHECKOUT,
  )
  assert.equal(
    getStripeBillingEventAction('checkout.session.async_payment_succeeded'),
    STRIPE_BILLING_EVENT_ACTIONS.COMPLETE_CHECKOUT,
  )
  for (const eventType of [
    'checkout.session.expired',
    'checkout.session.async_payment_failed',
  ]) {
    assert.equal(
      getStripeBillingEventAction(eventType),
      STRIPE_BILLING_EVENT_ACTIONS.RELEASE_FOUNDING_RESERVATION,
    )
  }
})

test('routes renewal, payment failure, and payment recovery invoices', () => {
  assert.equal(
    getStripeBillingEventAction('invoice.paid'),
    STRIPE_BILLING_EVENT_ACTIONS.RECONCILE_PAID_INVOICE,
  )
  assert.equal(
    getStripeBillingEventAction('invoice.payment_failed'),
    STRIPE_BILLING_EVENT_ACTIONS.RECONCILE_FAILED_INVOICE,
  )
})

test('routes cancellation, deletion, pause, and reactivation state changes', () => {
  for (const eventType of [
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed',
  ]) {
    assert.equal(
      getStripeBillingEventAction(eventType),
      STRIPE_BILLING_EVENT_ACTIONS.RECONCILE_SUBSCRIPTION,
    )
  }
})

test('acknowledges unrelated signed Stripe events without mutating billing state', () => {
  assert.equal(
    getStripeBillingEventAction('customer.created'),
    STRIPE_BILLING_EVENT_ACTIONS.IGNORE,
  )
})
