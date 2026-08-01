import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getCheckoutIdempotencyKey,
  getCustomerIdempotencyKey,
  hashCheckoutIdentity,
  isBlockingSubscriptionStatus,
  normalizeCheckoutEmail,
} from './checkout-identity.ts'

test('normalizes checkout emails before customer lookup', () => {
  assert.equal(normalizeCheckoutEmail('  Learner@Example.COM '), 'learner@example.com')
})

test('rejects missing and malformed checkout emails', () => {
  assert.equal(normalizeCheckoutEmail(undefined), null)
  assert.equal(normalizeCheckoutEmail('learner'), null)
  assert.equal(normalizeCheckoutEmail('learner@example'), null)
  assert.equal(normalizeCheckoutEmail('learner @example.com'), null)
})

test('blocks every non-terminal Stripe subscription status', () => {
  for (const status of ['active', 'incomplete', 'past_due', 'paused', 'trialing', 'unpaid']) {
    assert.equal(isBlockingSubscriptionStatus(status), true, status)
  }
})

test('allows a new checkout after terminal subscription statuses', () => {
  assert.equal(isBlockingSubscriptionStatus('canceled'), false)
  assert.equal(isBlockingSubscriptionStatus('incomplete_expired'), false)
})

test('creates stable case-insensitive idempotency keys without exposing email', async () => {
  const normalized = normalizeCheckoutEmail('Learner@Example.com')!
  const hash = await hashCheckoutIdentity(normalized)
  const sameHash = await hashCheckoutIdentity('learner@example.com')
  const customerKey = getCustomerIdempotencyKey(hash)

  assert.equal(hash, sameHash)
  assert.equal(hash.length, 64)
  assert.equal(customerKey, getCustomerIdempotencyKey(sameHash))
  assert.equal(customerKey.includes('learner@example.com'), false)
  assert.equal(getCheckoutIdempotencyKey('cus_123'), 'edenia-plus-checkout-cus_123')
  assert.equal(
    getCheckoutIdempotencyKey('cus_123', 'reservation_456'),
    'edenia-plus-checkout-cus_123-reservation_456',
  )
})
