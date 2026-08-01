import type Stripe from 'https://esm.sh/stripe@14.25.0?target=deno'
import type { BillingPlan } from './billing-config.ts'

export type PublicPlusPlan = {
  id: Extract<BillingPlan, 'monthly' | 'annual'>
  currency: string
  unit_amount: number
  interval: 'month' | 'year'
  interval_count: number
}

export function normalizePublicPlusPlan(
  id: PublicPlusPlan['id'],
  price: Stripe.Price,
): PublicPlusPlan {
  const expectedInterval = id === 'monthly' ? 'month' : 'year'
  if (
    price.active !== true
    || !Number.isSafeInteger(price.unit_amount)
    || Number(price.unit_amount) < 0
    || !/^[a-z]{3}$/.test(price.currency)
    || price.type !== 'recurring'
    || price.recurring?.interval !== expectedInterval
    || !Number.isSafeInteger(price.recurring.interval_count)
    || Number(price.recurring.interval_count) < 1
  ) {
    throw new Error(`Configured ${id} Stripe Price is not a usable recurring price`)
  }

  return {
    id,
    currency: price.currency,
    unit_amount: Number(price.unit_amount),
    interval: expectedInterval,
    interval_count: Number(price.recurring.interval_count),
  }
}
