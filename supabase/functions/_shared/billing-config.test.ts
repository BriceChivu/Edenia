import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getStripePriceId,
  isStripeEventModeAllowed,
  readStripeCheckoutConfig,
  readStripePortalConfig,
  readStripeWebhookConfig,
} from './billing-config.ts'

function environment(overrides: Record<string, string> = {}) {
  const values = {
    STRIPE_MODE: 'test',
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_WEBHOOK_SECRET: 'whsec_example',
    STRIPE_MONTHLY_PRICE_ID: 'price_monthly',
    STRIPE_ANNUAL_PRICE_ID: 'price_annual',
    STRIPE_FOUNDING_COUPON_ID: 'founding-member-first-year',
    APP_URL: 'http://localhost:8000/',
    ...overrides,
  }
  return (name: string) => values[name as keyof typeof values]
}

test('reads environment-owned Checkout resources and normalizes the app URL', () => {
  const config = readStripeCheckoutConfig(environment())

  assert.equal(config.mode, 'test')
  assert.equal(config.appUrl, 'http://localhost:8000')
  assert.equal(getStripePriceId(config, 'monthly'), 'price_monthly')
  assert.equal(getStripePriceId(config, 'annual'), 'price_annual')
  assert.equal(getStripePriceId(config, 'founding'), 'price_annual')
})

test('portal configuration needs only the Stripe runtime and app URL', () => {
  assert.deepEqual(readStripePortalConfig(environment()), {
    mode: 'test',
    secretKey: 'sk_test_example',
    appUrl: 'http://localhost:8000',
  })
})

test('rejects a Stripe key or event from the other billing environment', () => {
  assert.throws(
    () => readStripeCheckoutConfig(environment({
      STRIPE_MODE: 'live',
      STRIPE_SECRET_KEY: 'sk_test_example',
      APP_URL: 'https://edenia.app',
    })),
    /does not match STRIPE_MODE=live/,
  )
  assert.equal(isStripeEventModeAllowed('test', false), true)
  assert.equal(isStripeEventModeAllowed('test', true), false)
  assert.equal(isStripeEventModeAllowed('live', true), true)
})

test('requires https and complete environment configuration in live mode', () => {
  assert.throws(
    () => readStripeCheckoutConfig(environment({
      STRIPE_MODE: 'live',
      STRIPE_SECRET_KEY: 'sk_live_example',
      APP_URL: 'http://edenia.app',
    })),
    /must use https in live mode/,
  )
  assert.throws(
    () => readStripeCheckoutConfig(environment({
      STRIPE_MONTHLY_PRICE_ID: '',
    })),
    /STRIPE_MONTHLY_PRICE_ID/,
  )
})

test('validates the environment-owned webhook secret', () => {
  assert.equal(
    readStripeWebhookConfig(environment()).webhookSecret,
    'whsec_example',
  )
  assert.throws(
    () => readStripeWebhookConfig(environment({
      STRIPE_WEBHOOK_SECRET: 'secret_example',
    })),
    /must start with whsec_/,
  )
})
