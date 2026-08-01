import assert from 'node:assert/strict'
import test from 'node:test'
import type Stripe from 'https://esm.sh/stripe@14.25.0?target=deno'
import { normalizePublicPlusPlan } from './plus-offer.ts'

function price(overrides: Partial<Stripe.Price> = {}) {
  return {
    active: true,
    currency: 'usd',
    recurring: { interval: 'month', interval_count: 1 },
    type: 'recurring',
    unit_amount: 500,
    ...overrides,
  } as Stripe.Price
}

test('normalizes only active recurring Stripe prices for the expected cadence', () => {
  assert.deepEqual(normalizePublicPlusPlan('monthly', price()), {
    id: 'monthly',
    currency: 'usd',
    unit_amount: 500,
    interval: 'month',
    interval_count: 1,
  })
  assert.deepEqual(normalizePublicPlusPlan('annual', price({
    recurring: { interval: 'year', interval_count: 1 } as Stripe.Price.Recurring,
    unit_amount: 4800,
  })), {
    id: 'annual',
    currency: 'usd',
    unit_amount: 4800,
    interval: 'year',
    interval_count: 1,
  })
})

test('rejects inactive, malformed, one-time, and wrong-cadence prices', () => {
  for (const candidate of [
    price({ active: false }),
    price({ currency: 'US dollars' }),
    price({ type: 'one_time', recurring: null }),
    price({ unit_amount: null }),
    price({ recurring: { interval: 'year', interval_count: 1 } as Stripe.Price.Recurring }),
  ]) {
    assert.throws(
      () => normalizePublicPlusPlan('monthly', candidate),
      /not a usable recurring price/,
    )
  }
})
